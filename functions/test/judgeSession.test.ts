// startJudgeSession: a judge's browser gets its own practice incident, copied from the drill seed, with the
// command role on it, capped per visitor and per day, and deleted a day after it ends. Every build claim gets a
// fresh incident id and judgeUsers/{uid} names the one that won, so no builder, cleanup or media sweep ever
// touches a path another attempt uses.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteEndedSandboxes, handleStartJudgeSession, JUDGE_CLIP_SHA256S, JUDGE_LABEL, JUDGE_SESSION_TIMEOUT_S, SETUP_STALE_MS } from "../src/judgeSession";
import { bucketClipStore, SIGHTING_ENUMS } from "../src/practiceClip";
import { callRaw, emulatorIdToken } from "./callable";
import { admin, adminApp, clearFirestore, closeClients } from "./helpers";

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

describe("startJudgeSession and the practice clip", () => {
  // The blurred copy of the team's porch clip (plates and house numbers pixelated); the original is never copied.
  const CLIP = "28fffd2082fd48ea50709b94c8d37b823d2613dc5997adffda1117136483ddfb";
  const MARK = { byUid: "seed-uid", atMs: 1 };
  const PRACTICE = { byUid: "practice-seed", atMs: 1 };
  const ROUTE = { platform: "web", path: "cloud", stage: "sdk", model: "m", reason: "sdk_only_in_cloud", latencyMs: 1, sdkReported: true, blocked: null, decidedAtMs: 1 };
  const SIGHTING = {
    personVisible: true, firstSeen: "00:01", lastSeen: "00:08", entryEdge: "right", exitEdge: "left", topColor: "blue", bottomColor: "black",
    topType: "jacket", footwear: "boots", headwear: "none", carriedItems: [], keyFrame: { time: "00:04", box2d: [100, 200, 900, 400] },
    lighting: "night_ir", legibility: "partial", evidence: "One person walks away along the sidewalk.",
  };
  const ENTRY = { t: 1, box: [100, 200, 900, 400], source: "cloud", mask: [100, 210, 500, 380, 900, 300] };
  async function seedClip(sha: string, over: Record<string, unknown> = {}, trackOver: Record<string, unknown> = {}) {
    await admin.db.doc(`incidents/SEED/clipReadings/${sha}`).set({
      sha256: sha, storagePath: `clips/SEED/${sha}.mp4`, durationS: 9, clipStartMs: 1, clockConfirmed: true, cameraFacingDeg: 180, reading: SIGHTING, route: ROUTE,
      consent: { personInClip: MARK, footageOwner: MARK, cloudProcessing: MARK, publicUse: MARK },
      expiresAt: Timestamp.fromMillis(NOW + 20 * DAY), createdAt: Timestamp.fromMillis(NOW - DAY), createdByUid: "seed-uid", extra: "not copied", ...over,
    });
    await admin.db.doc(`incidents/SEED/clipTracks/${sha}`).set({ version: "track-v1", sha256: sha, window: { startS: 0, endS: 9 }, entries: [ENTRY],
      model: "m", route: ROUTE, framesSent: 10, createdByUid: "seed-uid", createdAt: Timestamp.fromMillis(NOW - DAY), extra: "not copied", ...trackOver });
  }
  // A store that records what it was asked and copies nothing.
  const fakeStore = () => {
    const calls: string[] = [];
    return { calls, store: { copy: async (from: string, to: string, sha: string) => void calls.push(`copy ${from} ${to} ${sha}`), remove: async (path: string) => void calls.push(`remove ${path}`) } };
  };
  const clipCfg = (store: unknown, extra: Record<string, unknown> = {}) => ({ ...cfg, clipStore: store as never, clipSha256s: [CLIP], ...extra });

  it("lists only the blurred practice clip", () => {
    expect(JUDGE_CLIP_SHA256S).toEqual([CLIP]);
  });

  it("keeps the sighting schema's lists equal to the shared schema", () => {
    const schema = JSON.parse(readFileSync(new URL("../../shared/schemas/camera-sighting.schema.json", import.meta.url), "utf8")) as { properties: Record<string, { enum?: string[] }> };
    const p = schema.properties;
    expect([p["entryEdge"]!.enum, p["exitEdge"]!.enum, p["topColor"]!.enum, p["bottomColor"]!.enum, p["lighting"]!.enum, p["legibility"]!.enum]).toEqual([
      [...SIGHTING_ENUMS.edge], [...SIGHTING_ENUMS.edge], [...SIGHTING_ENUMS.color], [...SIGHTING_ENUMS.color], [...SIGHTING_ENUMS.lighting], [...SIGHTING_ENUMS.legibility],
    ]);
  });

  it("copies the file, then the reading and track field by field, with no seed account and the practice search's end", async () => {
    await seedClip(CLIP, { reading: { ...SIGHTING, uid: "seed-uid" } }, { entries: [{ ...ENTRY, uid: "seed-uid" }] });
    const { calls, store } = fakeStore();
    const { incidentId } = await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, clipCfg(store));
    expect(calls).toEqual([`copy clips/SEED/${CLIP}.mp4 clips/${incidentId}/${CLIP}.mp4 ${CLIP}`]);
    const reading = (await inc(incidentId).collection("clipReadings").doc(CLIP).get()).data()!;
    expect(Object.keys(reading).sort()).toEqual(["cameraFacingDeg", "clipStartMs", "clockConfirmed", "consent", "createdAt", "createdByUid", "durationS", "expiresAt", "reading", "route", "sha256", "storagePath"]);
    expect(reading.reading).toEqual(SIGHTING);
    expect(reading.consent).toEqual({ personInClip: PRACTICE, footageOwner: PRACTICE, cloudProcessing: PRACTICE, publicUse: PRACTICE });
    expect(reading.createdByUid).toBe("practice-seed");
    expect(reading.storagePath).toBe(`clips/${incidentId}/${CLIP}.mp4`);
    expect((reading.expiresAt as Timestamp).toMillis()).toBe(NOW + DAY);
    const track = (await inc(incidentId).collection("clipTracks").doc(CLIP).get()).data()!;
    expect(Object.keys(track).sort()).toEqual(["createdAt", "createdByUid", "entries", "framesSent", "model", "route", "sha256", "version", "window"]);
    expect(track.entries).toEqual([ENTRY]);
    expect(track.createdByUid).toBe("practice-seed");
  });

  it("copies nothing without the judge-page consent, or with a reading or consent that breaks the schema", async () => {
    for (const over of [
      { consent: { personInClip: MARK, footageOwner: MARK, cloudProcessing: MARK, publicUse: null } },
      { reading: { ...SIGHTING, topColor: "teal" } },
      { reading: { ...SIGHTING, evidence: "x".repeat(401) } },
      { reading: null },
      { expiresAt: Timestamp.fromMillis(NOW - 1) },
    ]) {
      await seedClip(CLIP, over);
      const { calls, store } = fakeStore();
      // Five practice searches in one test: past the test config's daily cap of 3.
      const { incidentId } = await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, clipCfg(store, { perDay: 20 }));
      expect(calls).toEqual([]);
      expect(await size(incidentId, "clipReadings")).toBe(0);
    }
  });

  it("says in the log why the practice clip or its track was left out", async () => {
    const logged: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((line: unknown) => void logged.push(String(line)));
    try {
      const { store } = fakeStore();
      const reasons = async () => logged.flatMap((l) => {
        try {
          const j = JSON.parse(l) as Record<string, string>;
          return j["practice_clip_skipped"] ? [`clip ${j["practice_clip_skipped"]}`] : j["practice_track_skipped"] ? [`track ${j["practice_track_skipped"]}`] : [];
        } catch {
          return [];
        }
      });
      await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, clipCfg(store, { perDay: 20 }));
      expect(await reasons()).toEqual(["clip no_reading"]);
      logged.length = 0;
      await seedClip(CLIP, { consent: { personInClip: MARK, footageOwner: MARK, cloudProcessing: MARK, publicUse: null } });
      await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, clipCfg(store, { perDay: 20 }));
      expect(await reasons()).toEqual(["clip consent_public_use"]);
      logged.length = 0;
      await seedClip(CLIP, {}, { entries: [{ t: 1, box: [900, 200, 100, 400], source: "cloud" }] });
      await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, clipCfg(store, { perDay: 20 }));
      expect(await reasons()).toEqual(["track track_entries"]);
    } finally {
      spy.mockRestore();
    }
  });

  it("never writes the visitor's uid to the log, only a short hash of the practice search's id", async () => {
    const logged: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));
    try {
      await seedClip(CLIP, { consent: { personInClip: MARK, footageOwner: MARK, cloudProcessing: MARK, publicUse: null } });
      const uid = await freshUid();
      const { store } = fakeStore();
      const { incidentId } = await handleStartJudgeSession(admin.db, admin.auth, uid, NOW, clipCfg(store));
      expect(logged.length).toBeGreaterThan(0);
      for (const line of logged) {
        expect(line).not.toContain(uid);
        expect(line).not.toContain(incidentId);
      }
      expect(logged.some((l) => /judge#[0-9a-f]{12}/.test(l))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps a track entry whose outline has 7 numbers or NaN, without the outline", async () => {
    await seedClip(CLIP, {}, { entries: [
      { t: 1, box: [100, 200, 900, 400], source: "cloud", mask: [100, 200, 300, 400, 500, 600, 700] },
      { t: 2, box: [100, 200, 900, 400], source: "cloud", mask: [100, 200, Number.NaN, 400, 500, 600] },
      ENTRY,
    ] });
    const { store } = fakeStore();
    const { incidentId } = await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, clipCfg(store));
    expect((await inc(incidentId).collection("clipTracks").doc(CLIP).get()).get("entries")).toEqual([
      { t: 1, box: [100, 200, 900, 400], source: "cloud" },
      { t: 2, box: [100, 200, 900, 400], source: "cloud" },
      ENTRY,
    ]);
  });

  it("keeps a track entry whose outline has more than 16 points, without the outline", async () => {
    const long = Array.from({ length: 34 }, (_, i) => 100 + i);
    await seedClip(CLIP, {}, { entries: [{ t: 1, box: [100, 200, 900, 400], source: "cloud", mask: long }, ENTRY] });
    const { store } = fakeStore();
    const { incidentId } = await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, clipCfg(store));
    expect((await inc(incidentId).collection("clipTracks").doc(CLIP).get()).get("entries")).toEqual([{ t: 1, box: [100, 200, 900, 400], source: "cloud" }, ENTRY]);
  });

  it("copies the reading without a track whose entries break the track's schema", async () => {
    await seedClip(CLIP, {}, { entries: [{ t: 1, box: [900, 200, 100, 400], source: "cloud" }] });
    const { store } = fakeStore();
    const { incidentId } = await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, clipCfg(store));
    expect([await size(incidentId, "clipReadings"), await size(incidentId, "clipTracks")]).toEqual([1, 0]);
  });

  it("checks the file's bytes against its name and writes them with fresh metadata, in the Storage emulator", async () => {
    const bucket = getStorage(adminApp).bucket();
    const bytes = Buffer.from("practice clip bytes");
    const sha = createHash("sha256").update(bytes).digest("hex");
    await seedClip(sha);
    await bucket.file(`clips/SEED/${sha}.mp4`).save(bytes, { contentType: "video/mp4", metadata: { metadata: { firebaseStorageDownloadTokens: "seed-token", note: "private" } } });
    const ok = await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, { ...cfg, clipStore: bucketClipStore(bucket), clipSha256s: [sha] });
    const [copied] = await bucket.file(`clips/${ok.incidentId}/${sha}.mp4`).download();
    expect(copied.equals(bytes)).toBe(true);
    const [meta] = await bucket.file(`clips/${ok.incidentId}/${sha}.mp4`).getMetadata();
    expect(meta.contentType).toBe("video/mp4");
    expect(meta.metadata ?? {}).toEqual({});
    // Other bytes under the listed name are not copied, and the practice search still starts.
    await bucket.file(`clips/SEED/${sha}.mp4`).delete();
    await bucket.file(`clips/SEED/${sha}.mp4`).save(Buffer.from("other bytes"), { contentType: "video/mp4" });
    const bad = await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, { ...cfg, clipStore: bucketClipStore(bucket), clipSha256s: [sha] });
    expect((await inc(bad.incidentId).get()).get("setupReady")).toBe(true);
    expect((await bucket.file(`clips/${bad.incidentId}/${sha}.mp4`).exists())[0]).toBe(false);
    expect(await size(bad.incidentId, "clipReadings")).toBe(0);
    await bucket.deleteFiles({ prefix: "clips/" });
  });

  it("removes the copied file when the reading and track cannot be written, and still starts the practice search", async () => {
    await seedClip(CLIP);
    const { calls, store } = fakeStore();
    const { incidentId } = await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, clipCfg(store, { writeClipDocs: async () => {
      throw new Error("write refused");
    } }));
    expect(calls).toEqual([`copy clips/SEED/${CLIP}.mp4 clips/${incidentId}/${CLIP}.mp4 ${CLIP}`, `remove clips/${incidentId}/${CLIP}.mp4`]);
    expect((await inc(incidentId).get()).get("setupReady")).toBe(true);
    expect([await size(incidentId, "clipReadings"), await size(incidentId, "clipTracks")]).toEqual([0, 0]);
  });

  it("leaves the clip out, and still starts, when the file cannot be copied; and copies none without a store", async () => {
    await seedClip(CLIP);
    const failing = { copy: async () => { throw new Error("No such object"); }, remove: async () => undefined };
    const a = await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, clipCfg(failing));
    expect((await inc(a.incidentId).get()).get("setupReady")).toBe(true);
    expect(await size(a.incidentId, "clipReadings")).toBe(0);
    const b = await handleStartJudgeSession(admin.db, admin.auth, await freshUid(), NOW, cfg);
    expect(await size(b.incidentId, "clipReadings")).toBe(0);
  });
});
