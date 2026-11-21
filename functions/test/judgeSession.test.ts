// startJudgeSession: a judge's browser gets its own practice incident, copied from the drill seed, with the
// command role on it, capped per visitor and per day, and deleted a day after it ends. Every build claim gets a
// fresh incident id and judgeUsers/{uid} names the one that won, so no builder, cleanup or media sweep ever
// touches a path another attempt uses.
import { readFileSync } from "node:fs";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteEndedSandboxes, handleStartJudgeSession, JUDGE_LABEL, JUDGE_SESSION_TIMEOUT_S, SETUP_STALE_MS } from "../src/judgeSession";
import { callRaw, emulatorIdToken } from "./callable";
import { admin, clearFirestore, closeClients } from "./helpers";

const NOW = Date.UTC(2026, 11, 12, 15, 0);
const HOUR = 3_600_000, DAY = 24 * HOUR;
const cfg = { seedIncidentId: "SEED", perDay: 3 };
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const counterAt = (ms: number) => admin.db.doc(`ops/judgeSessions-${day(ms)}`);
const used = async (ms = NOW) => (await counterAt(ms).get()).get("count");
const pointer = async (uid: string) => (await admin.db.doc(`judgeUsers/${uid}`).get()).get("incidentId");
const inc = (id: string) => admin.db.doc(`incidents/${id}`);
const size = async (id: string, sub: string) => (await inc(id).collection(sub).get()).size;
const claims = async (uid: string) => (await admin.auth.getUser(uid)).customClaims ?? {};
const attemptId = (uid: string) => new RegExp(`^judge-${uid}-[a-z0-9]{12}$`);

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
    const { incidentId, role } = await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg);
    expect(role).toBe("command");
    expect(incidentId).toMatch(attemptId(uid));
    expect(await pointer(uid)).toBe(incidentId);
    const doc = (await inc(incidentId).get()).data()!;
    expect(doc.mode).toBe("judge");
    expect(doc.drillLabel).toBe(JUDGE_LABEL);
    expect(doc.drillLabel.startsWith("Training drill.")).toBe(true);
    expect(doc.setupReady).toBe(true);
    expect((doc.expiresAt as Timestamp).toMillis()).toBe(NOW + DAY);
    expect(doc.gridId).toBe("piedmont-park-dev");
    expect(doc.priorInputEventIds).toEqual([]);
    expect(doc).not.toHaveProperty("mediaRevokedAt");
    expect(await size(incidentId, "segments")).toBe(3);
    expect(await size(incidentId, "teams")).toBe(2);
    expect((await inc(incidentId).collection("profile").doc("shared").get()).get("nickname")).toBe("Practice person");
    expect((await inc(incidentId).collection("profile").doc("command").get()).exists).toBe(false);
    expect(await size(incidentId, "events")).toBe(0);
    expect(await claims(uid)).toEqual({ inc: incidentId, role: "command", team: null });
    // The cap it enforces rides with the count, so the quota probe reads the deployed cap, not a checkout's.
    expect((await counterAt(NOW).get()).data()).toEqual({ count: 1, cap: 3 });
  });
  it("a visitor who comes back while the sandbox is live gets the same one, and nothing more is counted", async () => {
    const uid = await freshUid();
    const { incidentId } = await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg);
    await inc(incidentId).collection("events").doc("x").set({ type: "clue" });
    expect((await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + HOUR, cfg)).incidentId).toBe(incidentId);
    expect((await inc(incidentId).collection("events").doc("x").get()).exists).toBe(true);
    expect(await used()).toBe(1);
  });
  it("one new sandbox per visitor per hour; after an ended one, the next is a new incident", async () => {
    const uid = await freshUid();
    const first = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg)).incidentId;
    await inc(first).update({ expiresAt: Timestamp.fromMillis(NOW + 10 * 60_000) });
    await inc(first).collection("events").doc("x").set({ type: "clue" });
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 20 * 60_000, cfg)).rejects.toMatchObject({ code: "resource-exhausted" });
    const second = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 2 * HOUR, cfg)).incidentId;
    expect(second).toMatch(attemptId(uid));
    expect(second).not.toBe(first);
    expect(await size(second, "events")).toBe(0);
    expect(((await inc(second).get()).get("expiresAt") as Timestamp).toMillis()).toBe(NOW + 2 * HOUR + DAY);
    // The ended one is left to the cleanup job; the new start never writes or clears it.
    expect((await inc(first).collection("events").doc("x").get()).exists).toBe(true);
    expect(await used()).toBe(2);
  });
  it("a copy never carries the seed's end of search: no closedReason, no closedAt, and it starts open", async () => {
    await inc("SEED").update({ closedReason: "training_ended", closedAt: Timestamp.fromMillis(NOW - DAY) });
    const { incidentId } = await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, cfg);
    const doc = (await inc(incidentId).get()).data()!;
    expect(doc.status).toBe("open");
    expect(doc).not.toHaveProperty("closedReason");
    expect(doc).not.toHaveProperty("closedAt");
  });
  it("a practice search the visitor ended is not handed back: the next start (after the hourly limit) is a new incident", async () => {
    const uid = await freshUid();
    const first = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg)).incidentId;
    await inc(first).update({ status: "closed", closedReason: "training_ended" });
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 20 * 60_000, cfg)).rejects.toMatchObject({ code: "resource-exhausted" });
    const second = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 2 * HOUR, cfg)).incidentId;
    expect(second).toMatch(attemptId(uid));
    expect(second).not.toBe(first);
    expect((await inc(second).get()).get("status")).toBe("open");
    expect(await claims(uid)).toEqual({ inc: second, role: "command", team: null });
  });
  it("the day's counter, which anyone may read, holds only the count and the cap, start after start", async () => {
    await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, cfg);
    await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW + 60_000, cfg);
    expect((await counterAt(NOW).get()).data()).toEqual({ count: 2, cap: 3 });
  });
  it("the daily cap holds per UTC day, each day on its own counter (review: a late call could reset a new day)", async () => {
    await counterAt(NOW).set({ count: 3 });
    await expect(handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, cfg)).rejects.toMatchObject({ code: "resource-exhausted" });
    // Yesterday's count never touches today's, and a start counts only on the day it runs.
    await counterAt(NOW + DAY).set({ count: 2 });
    await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW + DAY, cfg);
    expect(await used(NOW + DAY)).toBe(3);
    expect(await used(NOW)).toBe(3);
  });
  it("a signed-out caller is refused, and a missing seed is an error, not an empty sandbox", async () => {
    await expect(handleStartJudgeSession(admin.db, admin.auth, null, NOW, cfg)).rejects.toMatchObject({ code: "unauthenticated" });
    const uid = await freshUid();
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW, { ...cfg, seedIncidentId: "NONE" }))
      .rejects.toMatchObject({ code: "failed-precondition" });
    expect(await pointer(uid)).toBeUndefined();
  });
  it("the exported callable refuses a signed-in request with no or a bad App Check token", async () => {
    const { startJudgeSession } = await import("../src/index");
    const { idToken, uid } = await emulatorIdToken();
    for (const appCheck of [undefined, "not-an-app-check-token"]) {
      const res = await callRaw({ method: "POST", idToken, appCheck, fn: startJudgeSession, body: { data: {} } });
      expect(res.status).toBe(401);
    }
    expect((await admin.db.doc(`judgeUsers/${uid}`).get()).exists).toBe(false);
  });
  it("the setup lease is more than twice the callable's timeout, and the callable uses that timeout", () => {
    // A 2nd gen function keeps running after its timeout, so the lease is a margin, not the guarantee: each
    // attempt's own incident id is what keeps a late builder away from another attempt's data.
    expect(SETUP_STALE_MS).toBeGreaterThan(2 * JUDGE_SESSION_TIMEOUT_S * 1000);
    const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const block = index.slice(index.indexOf("export const startJudgeSession"), index.indexOf("export const deleteEndedSandboxesJob"));
    expect(block).toContain("timeoutSeconds: JUDGE_SESSION_TIMEOUT_S");
  });
});

describe("startJudgeSession setup is safe to fail, retry and race", () => {
  it("a failed copy grants nothing; a retry builds a fresh incident on the same slot and retires the failed one", async () => {
    const uid = await freshUid();
    const broken = { ...cfg, copy: async () => { throw new Error("copy failed"); } };
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW, broken)).rejects.toThrow();
    const failed = await pointer(uid);
    expect(await claims(uid)).not.toHaveProperty("inc");
    expect((await inc(failed).get()).get("setupReady")).toBe(false);
    const retry = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 60_000, cfg)).incidentId;
    expect(retry).not.toBe(failed);
    expect(await pointer(uid)).toBe(retry);
    expect((await inc(retry).get()).get("setupReady")).toBe(true);
    expect(((await inc(retry).get()).get("expiresAt") as Timestamp).toMillis()).toBe(NOW + DAY);
    expect(await size(retry, "segments")).toBe(3);
    expect(await claims(uid)).toEqual({ inc: retry, role: "command", team: null });
    // The failed attempt has ended, so the rules refuse it and the sweeps remove it.
    expect(((await inc(failed).get()).get("expiresAt") as Timestamp).toMillis()).toBeLessThanOrEqual(NOW + 60_000);
    expect(await used()).toBe(1);
  });
  it("while another start is still setting up, a second one waits instead of granting a half-built sandbox", async () => {
    const uid = await freshUid();
    let release!: () => void;
    const slow = { ...cfg, copy: (copy: () => Promise<void>) => new Promise<void>(r => { release = r; }).then(copy) };
    const first = handleStartJudgeSession(admin.db, admin.auth, uid, NOW, slow);
    while ((await pointer(uid)) === undefined) await new Promise(r => setTimeout(r, 20));
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 1000, cfg)).rejects.toMatchObject({ code: "unavailable" });
    expect(await claims(uid)).not.toHaveProperty("inc");
    release();
    const id = (await first).incidentId;
    expect((await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 2000, cfg)).incidentId).toBe(id);
    expect(await used()).toBe(1);
  });
  it("two starts at once by one visitor use one slot and end on one ready sandbox", async () => {
    const uid = await freshUid();
    const results = await Promise.allSettled([handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg),
      handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg)]);
    expect(results.filter(r => r.status === "fulfilled")).not.toHaveLength(0);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "unavailable" });
    expect(await used()).toBe(1);
    const id = await pointer(uid);
    expect((await inc(id).get()).get("setupReady")).toBe(true);
    expect(await size(id, "segments")).toBe(3);
  });
  it("a builder that stalls inside its copy and resumes after a takeover writes only its own retired attempt", async () => {
    // Review round 2: the earlier test paused before the first ownership check, so it missed a stall after it.
    const uid = await freshUid();
    let release!: () => void, stalled!: () => void;
    const atStall = new Promise<void>(r => { stalled = r; });
    const gate = new Promise<void>(r => { release = r; });
    const stalling = { ...cfg, writer: () => {
      const w = admin.db.bulkWriter();
      return { set: (r: FirebaseFirestore.DocumentReference, d: FirebaseFirestore.DocumentData) => {
        if (r.path.endsWith("/teams/T1")) { stalled(); return gate.then(() => w.set(r, d)); }
        return w.set(r, d);
      }, close: async () => { await gate; await w.close(); } };
    } };
    const first = handleStartJudgeSession(admin.db, admin.auth, uid, NOW, stalling);
    await atStall;
    const stale = await pointer(uid);
    const later = NOW + SETUP_STALE_MS + 1000;
    const winner = (await handleStartJudgeSession(admin.db, admin.auth, uid, later, cfg)).incidentId;
    expect(winner).not.toBe(stale);
    await inc(winner).collection("events").doc("judge-work").set({ type: "clue" });
    release();
    await expect(first).rejects.toMatchObject({ code: "unavailable" });
    expect((await inc(winner).collection("events").doc("judge-work").get()).exists).toBe(true);
    expect(await size(winner, "segments")).toBe(3);
    expect((await inc(winner).get()).get("setupReady")).toBe(true);
    expect((await inc(stale).get()).get("setupReady")).toBe(false);
    expect(await pointer(uid)).toBe(winner);
    expect(await claims(uid)).toEqual({ inc: winner, role: "command", team: null });
  });
  it("a copy whose writes fail is not marked ready, and a retry finishes on a fresh incident", async () => {
    // Review round 1: BulkWriter.close() resolves even when a write failed; each write's own result is checked.
    const uid = await freshUid();
    const failing = { ...cfg, writer: () => {
      const w = admin.db.bulkWriter();
      return { set: (r: FirebaseFirestore.DocumentReference, d: FirebaseFirestore.DocumentData) =>
        (r.path.endsWith("/teams/T2") ? Promise.reject(new Error("write failed")) : w.set(r, d)), close: () => w.close() };
    } };
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW, failing)).rejects.toThrow();
    const failed = await pointer(uid);
    expect((await inc(failed).get()).get("setupReady")).toBe(false);
    expect(await claims(uid)).not.toHaveProperty("inc");
    const retry = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 60_000, cfg)).incidentId;
    expect(await size(retry, "teams")).toBe(2);
    expect((await inc(retry).get()).get("setupReady")).toBe(true);
  });
  it("a copy that throws part way waits for its started writes before it lets go of the setup (review)", async () => {
    const uid = await freshUid();
    let closed = false, n = 0;
    const throwing = { ...cfg, writer: () => {
      const w = admin.db.bulkWriter();
      return { set: (r: FirebaseFirestore.DocumentReference, d: FirebaseFirestore.DocumentData) => {
        if (n++ === 1) throw new Error("writer broke");
        return w.set(r, d);
      }, close: async () => { await w.close(); closed = true; } };
    } };
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW, throwing)).rejects.toThrow("writer broke");
    expect(closed).toBe(true);
    const failed = await pointer(uid);
    expect(await size(failed, "segments")).toBe(1);
    expect((await inc(failed).get()).get("setupStartedAtMs")).toBe(0);
  });
});

describe("startJudgeSession when the pointer names a dead attempt", () => {
  it("a pointer to a deleted attempt gives a fresh one and never hands back the dead id (review round 3)", async () => {
    const uid = await freshUid();
    const dead = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW - 3 * DAY, cfg)).incidentId;
    expect(await deleteEndedSandboxes(admin.db, NOW)).toEqual([dead]);
    expect(await pointer(uid)).toBe(dead);
    const fresh = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg)).incidentId;
    expect(fresh).not.toBe(dead);
    expect(await pointer(uid)).toBe(fresh);
    expect(await claims(uid)).toEqual({ inc: fresh, role: "command", team: null });
    expect((await inc(fresh).get()).get("setupReady")).toBe(true);
  });
  it("a pointer to an unfinished attempt that has ended gives a fresh one, not the half-built one (review round 3)", async () => {
    const uid = await freshUid();
    const broken = { ...cfg, copy: async () => { throw new Error("copy failed"); } };
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW - 2 * DAY, broken)).rejects.toThrow();
    const unfinished = await pointer(uid);
    expect((await inc(unfinished).get()).get("setupReady")).toBe(false);
    const fresh = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg)).incidentId;
    expect(fresh).not.toBe(unfinished);
    expect((await inc(fresh).get()).get("setupReady")).toBe(true);
    expect(await claims(uid)).toEqual({ inc: fresh, role: "command", team: null });
  });
});

describe("startJudgeSession refusals carry a stable reason beside their sentence", () => {
  const why = (e: unknown) => ({ code: (e as { code: string }).code, reason: (e as { details?: { reason?: string } }).details?.reason });
  it("signed out, no practice drill, the hourly and the daily limit, and a setup still running each name their reason", async () => {
    expect(await handleStartJudgeSession(admin.db, admin.auth, null, NOW, cfg).then(() => null, why))
      .toEqual({ code: "unauthenticated", reason: "not_signed_in" });
    expect(await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, { ...cfg, seedIncidentId: "NONE" }).then(() => null, why))
      .toEqual({ code: "failed-precondition", reason: "no_practice" });
    const uid = await freshUid();
    const first = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg)).incidentId;
    await inc(first).update({ expiresAt: Timestamp.fromMillis(NOW + 60_000) });
    expect(await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + 120_000, cfg).then(() => null, why))
      .toEqual({ code: "resource-exhausted", reason: "hourly_limit" });
    await counterAt(NOW).set({ count: 3 });
    expect(await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, cfg).then(() => null, why))
      .toEqual({ code: "resource-exhausted", reason: "daily_limit" });
    const busy = await freshUid();
    let release!: () => void;
    const slow = { ...cfg, perDay: 10, copy: (copy: () => Promise<void>) => new Promise<void>(r => { release = r; }).then(copy) };
    const building = handleStartJudgeSession(admin.db, admin.auth, busy, NOW, slow);
    while ((await pointer(busy)) === undefined) await new Promise(r => setTimeout(r, 20));
    expect(await handleStartJudgeSession(admin.db, admin.auth, busy, NOW + 1000, { ...cfg, perDay: 10 }).then(() => null, why))
      .toEqual({ code: "unavailable", reason: "setup_busy" });
    release();
    await building;
  });
});

describe("startJudgeSession hands out the role only for the visitor's current attempt", () => {
  it("a start that finds a newer winner by the time it hands out the role leaves that winner's role alone (review round 3)", async () => {
    const uid = await freshUid();
    const first = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg)).incidentId;
    const newer = `judge-${uid}-newerattempt`;
    // While this start pauses before the role, a newer attempt wins and is handed out.
    const pause = { ...cfg, beforeClaims: async () => {
      await inc(newer).set({ mode: "judge", status: "open", setupReady: true, createdAt: Timestamp.fromMillis(NOW),
        expiresAt: Timestamp.fromMillis(NOW + DAY) });
      await admin.db.doc(`judgeUsers/${uid}`).set({ incidentId: newer, createdAt: Timestamp.fromMillis(NOW) });
      await admin.auth.setCustomUserClaims(uid, { inc: newer, role: "command", team: null });
    } };
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW + HOUR, pause)).rejects.toMatchObject({ code: "unavailable" });
    expect(await claims(uid)).toEqual({ inc: newer, role: "command", team: null });
    expect(first).not.toBe(newer);
  });
  it("a start that finds the sandbox closed by the time it hands out the role grants nothing (review: close during a start)", async () => {
    const uid = await freshUid();
    const first = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg)).incidentId;
    await admin.auth.setCustomUserClaims(uid, null);
    const pause = { ...cfg, beforeClaims: async () => { await inc(first).update({ status: "closed", closedReason: "training_ended" }); } };
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW + HOUR, pause)).rejects.toMatchObject({ code: "unavailable" });
    expect(await claims(uid)).toEqual({});
  });
});

describe("startJudgeSession and a sandbox made before setup was tracked", () => {
  const legacy = (uid: string) => admin.db.doc(`incidents/judge-${uid}`);
  async function fullLegacy(uid: string, ids = { segments: ["AA", "AB", "ROW"], teams: ["T1", "T2"] }) {
    await legacy(uid).set({ mode: "judge", status: "open", createdAt: Timestamp.fromMillis(NOW), expiresAt: Timestamp.fromMillis(NOW + DAY) });
    for (const sg of ids.segments) await legacy(uid).collection("segments").doc(sg).set({ segmentId: sg, priorPoa: 0.3 });
    for (const t of ids.teams) await legacy(uid).collection("teams").doc(t).set({ teamId: t });
    await legacy(uid).collection("profile").doc("shared").set({ nickname: "Practice person" });
  }
  it("a whole copy is handed back as it is, its judge's own work kept, and no slot is used", async () => {
    const uid = await freshUid();
    await fullLegacy(uid);
    await legacy(uid).collection("events").doc("mine").set({ type: "clue" });
    expect((await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + HOUR, cfg)).incidentId).toBe(`judge-${uid}`);
    expect((await legacy(uid).collection("events").doc("mine").get()).exists).toBe(true);
    expect((await legacy(uid).get()).get("setupReady")).toBe(true);
    expect(await pointer(uid)).toBe(`judge-${uid}`);
    expect((await counterAt(NOW).get()).exists).toBe(false);
  });
  it("a short copy is rebuilt on a fresh incident, on the slot it already used, and the old one is retired", async () => {
    const uid = await freshUid();
    await legacy(uid).set({ mode: "judge", status: "open", createdAt: Timestamp.fromMillis(NOW), expiresAt: Timestamp.fromMillis(NOW + DAY) });
    const id = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + HOUR, cfg)).incidentId;
    expect(id).toMatch(attemptId(uid));
    expect(await size(id, "segments")).toBe(3);
    expect(await size(id, "teams")).toBe(2);
    expect(((await inc(id).get()).get("expiresAt") as Timestamp).toMillis()).toBe(NOW + DAY);
    expect(((await legacy(uid).get()).get("expiresAt") as Timestamp).toMillis()).toBeLessThanOrEqual(NOW + HOUR);
    expect((await counterAt(NOW).get()).exists).toBe(false);
  });
  it("the check compares document ids, not counts: the right number of the wrong segments is short (review)", async () => {
    const uid = await freshUid();
    await fullLegacy(uid, { segments: ["AA", "AB", "ZZ"], teams: ["T1", "T2"] });
    expect((await handleStartJudgeSession(admin.db, admin.auth, uid, NOW + HOUR, cfg)).incidentId).toMatch(attemptId(uid));
  });
  it("without the seed a legacy sandbox is never promoted (review)", async () => {
    const uid = await freshUid();
    await fullLegacy(uid);
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid, NOW + HOUR, { ...cfg, seedIncidentId: "NONE" }))
      .rejects.toMatchObject({ code: "failed-precondition" });
    expect((await legacy(uid).get()).get("setupReady")).toBeUndefined();
    expect(await claims(uid)).not.toHaveProperty("inc");
    // An empty one matched an absent seed on counts (0 and 0) and was promoted.
    const uid2 = await freshUid();
    await legacy(uid2).set({ mode: "judge", status: "open", createdAt: Timestamp.fromMillis(NOW), expiresAt: Timestamp.fromMillis(NOW + DAY) });
    await expect(handleStartJudgeSession(admin.db, admin.auth, uid2, NOW + HOUR, { ...cfg, seedIncidentId: "NONE" }))
      .rejects.toMatchObject({ code: "failed-precondition" });
    expect((await legacy(uid2).get()).get("setupReady")).toBeUndefined();
    expect(await claims(uid2)).not.toHaveProperty("inc");
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
  it("removes a visitor's ended attempt and never their newer one, which has its own id (review)", async () => {
    const uid = await freshUid();
    const old = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW - 3 * DAY, cfg)).incidentId;
    const current = (await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, cfg)).incidentId;
    expect(await deleteEndedSandboxes(admin.db, NOW)).toEqual([old]);
    expect((await inc(current).get()).get("setupReady")).toBe(true);
    expect(await size(current, "segments")).toBe(3);
    expect(await pointer(uid)).toBe(current);
  });
});
