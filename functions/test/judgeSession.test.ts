// startJudgeSession: a judge's browser gets its own practice incident, copied from the drill seed, with the
// command role on it, capped per visitor and per day, and deleted a day after it ends.
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteEndedSandboxes, handleStartJudgeSession, JUDGE_LABEL } from "../src/judgeSession";
import { callRaw, emulatorIdToken } from "./callable";
import { admin, clearFirestore, closeClients } from "./helpers";

const NOW = Date.UTC(2026, 11, 12, 15, 0);
const HOUR = 3_600_000, DAY = 24 * HOUR;
const cfg = { seedIncidentId: "SEED", perDay: 3 };
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function freshUid(): Promise<string> {
  return (await admin.auth.createUser({})).uid;
}

beforeEach(async () => {
  await clearFirestore();
  await admin.db.doc("incidents/SEED").set({ name: "Development drill (synthetic)", mode: "drill", drillLabel: "Training drill. Nobody is missing.",
    status: "open", mediaRevokedAt: new Date(2026, 10, 1), gridId: "piedmont-park-dev", ipp: { lat: 33.78, lon: -84.37 }, terrain: "temperate_flat", priorVersion: 5, priorModel: "rings",
    priorSeed: 20261122, priorInputEventIds: ["e1"], priorLayers: { linear: true, wedge: false }, engineParams: { sweepWidthFactor: 1.6 } });
  for (const s of ["AA", "AB", "ROW"]) await admin.db.doc(`incidents/SEED/segments/${s}`).set({ segmentId: s, priorPoa: 0.3, priorVersion: 5 });
  for (const t of ["T1", "T2"]) await admin.db.doc(`incidents/SEED/teams/${t}`).set({ teamId: t, name: `Team ${t}`, colorSlot: 1 });
  await admin.db.doc("incidents/SEED/profile/shared").set({ nickname: "Practice person" });
  await admin.db.doc("incidents/SEED/profile/command").set({ previousAddresses: ["somewhere"] });
  await admin.db.doc("incidents/SEED/events/e1").set({ type: "sighting" });
});
afterAll(closeClients);

describe("startJudgeSession", () => {
  it("gives a judge a private practice incident copied from the seed, with the command role", async () => {
    const uid = await freshUid();
    expect(await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg)).toEqual({ incidentId: `judge-${uid}`, role: "command" });
    const inc = (await admin.db.doc(`incidents/judge-${uid}`).get()).data()!;
    expect(inc.mode).toBe("judge");
    expect(inc.drillLabel).toBe(JUDGE_LABEL);
    expect(inc.drillLabel.startsWith("Training drill.")).toBe(true);
    expect((inc.expiresAt as Timestamp).toMillis()).toBe(NOW + DAY);
    expect(inc.gridId).toBe("piedmont-park-dev");
    expect(inc.priorInputEventIds).toEqual([]);
    expect(inc).not.toHaveProperty("mediaRevokedAt");
    expect((await admin.db.collection(`incidents/judge-${uid}/segments`).get()).size).toBe(3);
    expect((await admin.db.collection(`incidents/judge-${uid}/teams`).get()).size).toBe(2);
    expect((await admin.db.doc(`incidents/judge-${uid}/profile/shared`).get()).get("nickname")).toBe("Practice person");
    expect((await admin.db.doc(`incidents/judge-${uid}/profile/command`).get()).exists).toBe(false);
    expect((await admin.db.collection(`incidents/judge-${uid}/events`).get()).size).toBe(0);
    expect((await admin.auth.getUser(uid)).customClaims).toEqual({ inc: `judge-${uid}`, role: "command", team: null });
    expect((await admin.db.doc("ops/judgeSessions").get()).data()).toEqual({ day: day(NOW), count: 1 });
  });
  it("a visitor who comes back while the sandbox is live gets the same one, and nothing more is counted", async () => {
    const uid = await freshUid();
    await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg);
    await admin.db.doc(`incidents/judge-${uid}/events/x`).set({ type: "clue" });
    expect((await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + HOUR, cfg)).incidentId).toBe(`judge-${uid}`);
    expect((await admin.db.doc(`incidents/judge-${uid}/events/x`).get()).exists).toBe(true);
    expect((await admin.db.doc("ops/judgeSessions").get()).get("count")).toBe(1);
  });
  it("one new sandbox per visitor per hour; an older ended one is rebuilt clean", async () => {
    const uid = await freshUid(), ref = admin.db.doc(`incidents/judge-${uid}`);
    await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg);
    await ref.update({ expiresAt: Timestamp.fromMillis(NOW + 10 * 60_000) });
    await admin.db.doc(`incidents/judge-${uid}/events/x`).set({ type: "clue" });
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 20 * 60_000, cfg)).rejects.toMatchObject({ code: "resource-exhausted" });
    expect((await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 2 * HOUR, cfg)).incidentId).toBe(`judge-${uid}`);
    expect((await admin.db.doc(`incidents/judge-${uid}/events/x`).get()).exists).toBe(false);
    expect(((await ref.get()).get("expiresAt") as Timestamp).toMillis()).toBe(NOW + 2 * HOUR + DAY);
    expect((await admin.db.doc("ops/judgeSessions").get()).get("count")).toBe(2);
  });
  it("the daily cap holds, and a new day starts a new count", async () => {
    await admin.db.doc("ops/judgeSessions").set({ day: day(NOW), count: 3 });
    await expect(handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, cfg)).rejects.toMatchObject({ code: "resource-exhausted" });
    await admin.db.doc("ops/judgeSessions").set({ day: day(NOW - DAY), count: 3 });
    await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, cfg);
    expect((await admin.db.doc("ops/judgeSessions").get()).data()).toEqual({ day: day(NOW), count: 1 });
  });
  it("a signed-out caller is refused, and a missing seed is an error, not an empty sandbox", async () => {
    await expect(handleStartJudgeSession(admin.db, admin.auth, null, NOW, cfg)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, { ...cfg, seedIncidentId: "NONE" }))
      .rejects.toMatchObject({ code: "failed-precondition" });
  });
  it("the exported callable refuses a signed-in request with no or a bad App Check token", async () => {
    const { startJudgeSession } = await import("../src/index");
    const { idToken, uid } = await emulatorIdToken();
    for (const appCheck of [undefined, "not-an-app-check-token"]) {
      const res = await callRaw({ method: "POST", idToken, appCheck, fn: startJudgeSession, body: { data: {} } });
      expect(res.status).toBe(401);
    }
    expect((await admin.db.doc(`incidents/judge-${uid}`).get()).exists).toBe(false);
  });
});

describe("startJudgeSession setup is safe to fail, retry and race", () => {
  const claims = async (uid: string) => (await admin.auth.getUser(uid)).customClaims ?? {};
  it("a failed copy grants nothing; a retry finishes the same sandbox without using another slot", async () => {
    const uid = await freshUid(), ref = admin.db.doc(`incidents/judge-${uid}`);
    const broken = { ...cfg, copy: async () => { throw new Error("copy failed"); } };
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW, broken)).rejects.toThrow();
    expect(await claims(uid)).not.toHaveProperty("inc");
    expect((await ref.get()).get("setupReady")).toBe(false);
    expect((await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 60_000, cfg)).incidentId).toBe(`judge-${uid}`);
    expect((await ref.get()).get("setupReady")).toBe(true);
    expect((await admin.db.collection(`incidents/judge-${uid}/segments`).get()).size).toBe(3);
    expect(await claims(uid)).toEqual({ inc: `judge-${uid}`, role: "command", team: null });
    expect((await admin.db.doc("ops/judgeSessions").get()).get("count")).toBe(1);
  });
  it("while another start is still setting up, a second one waits instead of granting a half-built sandbox", async () => {
    const uid = await freshUid(), ref = admin.db.doc(`incidents/judge-${uid}`);
    let release!: () => void;
    const slow = { ...cfg, copy: (copy: () => Promise<void>) => new Promise<void>(r => { release = r; }).then(copy) };
    const first = handleStartJudgeSession(admin.db, admin.auth, uid, NOW, slow);
    while (!(await ref.get()).exists) await new Promise(r => setTimeout(r, 20));
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 1000, cfg)).rejects.toMatchObject({ code: "unavailable" });
    expect(await claims(uid)).not.toHaveProperty("inc");
    release();
    expect((await first).incidentId).toBe(`judge-${uid}`);
    expect((await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 2000, cfg)).incidentId).toBe(`judge-${uid}`);
    expect((await admin.db.doc("ops/judgeSessions").get()).get("count")).toBe(1);
  });
  it("two starts at once by one visitor use one slot and end on one ready sandbox", async () => {
    const uid = await freshUid();
    const results = await Promise.allSettled([handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg),
      handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg)]);
    expect(results.filter(r => r.status === "fulfilled")).not.toHaveLength(0);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "unavailable" });
    expect((await admin.db.doc("ops/judgeSessions").get()).get("count")).toBe(1);
    expect((await admin.db.doc(`incidents/judge-${uid}`).get()).get("setupReady")).toBe(true);
    expect((await admin.db.collection(`incidents/judge-${uid}/segments`).get()).size).toBe(3);
  });
  it("a live sandbox made before setup was tracked counts as ready", async () => {
    const uid = await freshUid();
    await admin.db.doc(`incidents/judge-${uid}`).set({ mode: "judge", status: "open", createdAt: Timestamp.fromMillis(NOW),
      expiresAt: Timestamp.fromMillis(NOW + DAY) });
    expect((await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + HOUR, cfg)).incidentId).toBe(`judge-${uid}`);
    expect((await admin.db.collection(`incidents/judge-${uid}/segments`).get()).size).toBe(0);
    expect((await admin.db.doc("ops/judgeSessions").get()).exists).toBe(false);
  });
});

describe("deleteEndedSandboxes", () => {
  it("deletes a judge sandbox, with everything under it, a day after it ends; live sandboxes and drills stay", async () => {
    await admin.db.doc("incidents/judge-old").set({ mode: "judge", expiresAt: Timestamp.fromMillis(NOW - DAY - 60_000) });
    await admin.db.doc("incidents/judge-old/events/e").set({ type: "clue" });
    await admin.db.doc("incidents/judge-recent").set({ mode: "judge", expiresAt: Timestamp.fromMillis(NOW - HOUR) });
    await admin.db.doc("incidents/judge-live").set({ mode: "judge", expiresAt: Timestamp.fromMillis(NOW + HOUR) });
    expect(await deleteEndedSandboxes(admin.db, NOW)).toEqual(["judge-old"]);
    expect((await admin.db.doc("incidents/judge-old").get()).exists).toBe(false);
    expect((await admin.db.doc("incidents/judge-old/events/e").get()).exists).toBe(false);
    for (const id of ["judge-recent", "judge-live", "SEED"]) expect((await admin.db.doc(`incidents/${id}`).get()).exists).toBe(true);
  });
});
