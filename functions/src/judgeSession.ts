import { randomUUID } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import { Timestamp, type DocumentData, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

/** The label every practice incident carries, shown wherever the drill label is shown. */
export const JUDGE_LABEL = "Training drill. Practice search; nobody is missing.";
/** The incident a practice search is copied from: the development drill on the Piedmont Park grid (OpenStreetMap). */
export const JUDGE_SEED_INCIDENT = "drill-dev-1";
/** New practice searches allowed per UTC day across all visitors (cost bound). */
export const JUDGE_SESSIONS_PER_DAY = 50;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
// Seed fields a practice incident must not inherit; everything else (grid, IPP, terrain, prior and engine settings)
// is copied so the practice search runs the real engine on the real grid.
const NOT_COPIED = new Set(["createdAt", "expiresAt", "name", "mode", "drillLabel", "status", "priorInputEventIds",
  "joinCodeHash", "commandJoinCodeHash", "mediaDeletedAt", "mediaSweepEmpty", "mediaRevokedAt",
  "setupReady", "setupId", "setupStartedAtMs"]);
/** startJudgeSession's timeout (index.ts). A 2nd gen function can keep running after it, so it is not a kill switch. */
export const JUDGE_SESSION_TIMEOUT_S = 120;
/**
 * A setup that has not finished in this long is taken to have died, and the next start builds a fresh attempt. More
 * than twice the timeout, as a margin; the safety comes from each attempt having its own incident id.
 */
export const SETUP_STALE_MS = 5 * 60_000;
const NO_SEED = "No practice search is available right now.";
const STILL_SETTING_UP = "Your practice search is still being set up. Try again in a moment.";

/** The part of a BulkWriter the copy uses: each set's own promise reports that write's failure. */
type Writer = { set(ref: DocumentReference, data: DocumentData): Promise<unknown>; close(): Promise<void> };
/** copy: tests wrap the real copy step to delay it or make it fail; writer: tests make single writes fail. */
type Config = { seedIncidentId: string; perDay: number; copy?: (copy: () => Promise<void>) => Promise<void>; writer?: () => Writer };

async function giveCommand(auth: Auth, uid: string, incidentId: string): Promise<{ incidentId: string; role: "command" }> {
  await auth.setCustomUserClaims(uid, { inc: incidentId, role: "command", team: null });
  return { incidentId, role: "command" };
}

/**
 * Copies the seed's segments, teams and shared profile into a new attempt's own, empty incident. Nothing is cleared:
 * no other attempt ever writes under this id, so a builder that stalls and resumes late can touch only its own
 * attempt. Every write's own result is checked (BulkWriter.close() resolves even when a write failed), and the writer
 * is closed before any error leaves, so no write is still in flight once the setup is let go.
 */
async function copyFrom(seed: DocumentReference, to: DocumentReference, makeWriter: () => Writer,
  stillOwner: () => Promise<boolean>): Promise<void> {
  if (!(await stillOwner())) throw new HttpsError("unavailable", STILL_SETTING_UP);
  const writer = makeWriter();
  const writes: Promise<unknown>[] = [];
  const set = (ref: DocumentReference, data: DocumentData) => writes.push(writer.set(ref, data).then(() => null, (e: unknown) => e ?? "write failed"));
  try {
    for (const sub of ["segments", "teams"]) {
      for (const d of (await seed.collection(sub).get()).docs) set(to.collection(sub).doc(d.id), d.data());
    }
    const shared = await seed.collection("profile").doc("shared").get();
    if (shared.exists) set(to.collection("profile").doc("shared"), shared.data()!);
  } finally {
    await writer.close();
  }
  const failed = (await Promise.all(writes)).find(e => e !== null);
  if (failed !== undefined) throw failed;
}

/** Whether a sandbox holds the seed's whole copy: as many segments and teams, and the shared profile if the seed has one. */
async function copyIsComplete(seed: DocumentReference, to: DocumentReference): Promise<boolean> {
  const count = async (ref: DocumentReference, sub: string) => (await ref.collection(sub).count().get()).data().count;
  for (const sub of ["segments", "teams"]) if ((await count(seed, sub)) !== (await count(to, sub))) return false;
  const [a, b] = await Promise.all([seed.collection("profile").doc("shared").get(), to.collection("profile").doc("shared").get()]);
  return a.exists === b.exists;
}

/**
 * startJudgeSession (callable): a signed-in visitor gets their own practice incident, copied from the seed drill (its
 * grid, prior, teams and shared profile; never its events, command profile or consent records), labelled as a training
 * drill, ending 24 hours after it starts, with the command role on it. A visitor who returns while it is live gets the
 * same one. A new one is allowed once an hour per visitor and within a daily cap across all visitors.
 *
 * Each build gets a fresh incident id, judge-{uid}-{12 hex}, and judgeUsers/{uid} names the attempt that won. A setup
 * that died is replaced by a fresh attempt for the same session (same window, same slot) and the dead one is ended,
 * so a builder that resumes late, the cleanup job and the media sweep each act only on ids no other attempt uses. A
 * sandbox made before attempts had ids (incidents/judge-{uid}) is checked against the seed and kept when whole.
 */
export async function handleStartJudgeSession(db: Firestore, auth: Auth, uid: string | null, nowMs: number,
  cfg: Config = { seedIncidentId: JUDGE_SEED_INCIDENT, perDay: JUDGE_SESSIONS_PER_DAY }): Promise<{ incidentId: string; role: "command" }> {
  if (uid === null) throw new HttpsError("unauthenticated", "Sign in before starting a practice search.");
  const userRef = db.doc(`judgeUsers/${uid}`), legacyId = `judge-${uid}`, legacyRef = db.doc(`incidents/${legacyId}`);
  const seedRef = db.doc(`incidents/${cfg.seedIncidentId}`);
  const setupId = randomUUID();
  const attemptId = `judge-${uid}-${randomUUID().replace(/-/g, "").slice(0, 12)}`, attemptRef = db.doc(`incidents/${attemptId}`);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const counter = db.doc("ops/judgeSessions");
  // A new attempt: the seed's settings, this session's window, and a setup this call owns.
  const attempt = (seed: DocumentData, createdAt: Timestamp, expiresAt: Timestamp) => ({
    ...Object.fromEntries(Object.entries(seed).filter(([k]) => !NOT_COPIED.has(k))),
    name: "Practice search", mode: "judge", drillLabel: JUDGE_LABEL, status: "open", priorInputEventIds: [],
    createdAt, expiresAt, setupReady: false, setupId, setupStartedAtMs: nowMs });
  // An attempt replaced by a newer one ends now: the rules refuse it, its builder can no longer finish it, and the
  // cleanup job and the media sweep remove it.
  const retired = { setupId: "retired", setupStartedAtMs: 0, expiresAt: Timestamp.fromMillis(nowMs) };

  // One transaction decides, so two starts at once cannot both take a slot or both build: a live, ready sandbox is
  // handed back; one still being set up makes the caller wait; a setup that died is replaced by a fresh attempt for
  // the same session; a missing or ended one gives a new session. Only a new session uses a slot of the daily cap.
  type Action = { kind: "ready" | "legacy"; id: string } | { kind: "busy" } | { kind: "build"; id: string };
  const action: Action = await db.runTransaction(async tx => {
    const [user, seed, count, legacy] = await tx.getAll(userRef, seedRef, counter, legacyRef);
    const currentId: string | null = user!.exists ? (user!.get("incidentId") as string) : legacy!.exists ? legacyId : null;
    const current = currentId === null ? null : currentId === legacyId ? legacy! : await tx.get(db.doc(`incidents/${currentId}`));
    const exp = current?.get("expiresAt");
    if (current?.exists && exp instanceof Timestamp && exp.toMillis() > nowMs) {
      if (current.get("setupReady") === true) return { kind: "ready", id: current.id };
      // Only a sandbox made before setup was tracked has no flag: checked against the seed below.
      if (current.get("setupReady") === undefined) return { kind: "legacy", id: current.id };
      const started = current.get("setupStartedAtMs");
      if (typeof started === "number" && nowMs - started < SETUP_STALE_MS) return { kind: "busy" };
      if (!seed!.exists) throw new HttpsError("failed-precondition", NO_SEED);
      tx.update(current.ref, retired);
      tx.set(attemptRef, attempt(seed!.data()!, current.get("createdAt"), exp));
      tx.set(userRef, { incidentId: attemptId, createdAt: current.get("createdAt") });
      return { kind: "build", id: attemptId };
    }
    const created = user!.exists ? user!.get("createdAt") : current?.get("createdAt");
    if (created instanceof Timestamp && nowMs - created.toMillis() < HOUR_MS) {
      throw new HttpsError("resource-exhausted", "One new practice search per hour. Try again later.");
    }
    if (!seed!.exists) throw new HttpsError("failed-precondition", NO_SEED);
    const used = count!.get("day") === today && typeof count!.get("count") === "number" ? (count!.get("count") as number) : 0;
    if (used >= cfg.perDay) throw new HttpsError("resource-exhausted", "Practice searches are full for today. Try again tomorrow.");
    tx.set(counter, { day: today, count: used + 1 });
    const createdAt = Timestamp.fromMillis(nowMs);
    tx.set(attemptRef, attempt(seed!.data()!, createdAt, Timestamp.fromMillis(nowMs + DAY_MS)));
    tx.set(userRef, { incidentId: attemptId, createdAt });
    return { kind: "build", id: attemptId };
  });
  if (action.kind === "busy") throw new HttpsError("unavailable", STILL_SETTING_UP);
  if (action.kind === "ready") return giveCommand(auth, uid, action.id);

  let buildId = action.id;
  if (action.kind === "legacy") {
    // A whole legacy copy gets its flag and the pointer; a short one is replaced by a fresh attempt for the same
    // session, on the slot it already used, and never rebuilt in place.
    const complete = await copyIsComplete(seedRef, legacyRef);
    const next = await db.runTransaction(async tx => {
      const [user, legacy, seed] = await tx.getAll(userRef, legacyRef, seedRef);
      if (user!.exists || legacy!.get("setupReady") !== undefined) return "busy" as const;
      if (complete) {
        tx.update(legacyRef, { setupReady: true });
        tx.set(userRef, { incidentId: legacyId, createdAt: legacy!.get("createdAt") });
        return "ready" as const;
      }
      if (!seed!.exists) throw new HttpsError("failed-precondition", NO_SEED);
      tx.update(legacyRef, retired);
      tx.set(attemptRef, attempt(seed!.data()!, legacy!.get("createdAt"), legacy!.get("expiresAt")));
      tx.set(userRef, { incidentId: attemptId, createdAt: legacy!.get("createdAt") });
      return "build" as const;
    });
    if (next === "busy") throw new HttpsError("unavailable", STILL_SETTING_UP);
    if (next === "ready") return giveCommand(auth, uid, legacyId);
    buildId = attemptId;
  }

  const ref = db.doc(`incidents/${buildId}`);
  const stillOwner = async () => (await ref.get()).get("setupId") === setupId;
  const copy = () => copyFrom(seedRef, ref, cfg.writer ?? (() => db.bulkWriter()), stillOwner);
  // Finishes or lets go of the setup, but only while this call still owns it (a later start may have replaced it).
  const settle = (fields: Record<string, unknown>) => db.runTransaction(async tx => {
    if ((await tx.get(ref)).get("setupId") === setupId) tx.update(ref, fields);
  });
  try {
    await (cfg.copy ? cfg.copy(copy) : copy());
  } catch (e) {
    await settle({ setupStartedAtMs: 0 });
    throw e;
  }
  await settle({ setupReady: true });
  // Published only while it is still the visitor's attempt and ready.
  const published = await db.runTransaction(async tx => {
    const [user, sandbox] = await tx.getAll(userRef, ref);
    return user!.get("incidentId") === buildId && sandbox!.get("setupReady") === true;
  });
  if (!published) throw new HttpsError("unavailable", STILL_SETTING_UP);
  console.log(JSON.stringify({ event: "startJudgeSession", incidentId: buildId, seed: cfg.seedIncidentId }));
  return giveCommand(auth, uid, buildId);
}

/** Deletes each judge sandbox, with everything under it, once it ended more than a day ago. Returns the ids. */
export async function deleteEndedSandboxes(db: Firestore, nowMs: number): Promise<string[]> {
  const deleted: string[] = [];
  for (const doc of (await db.collection("incidents").where("mode", "==", "judge").get()).docs) {
    const exp = doc.get("expiresAt");
    if (exp instanceof Timestamp && exp.toMillis() < nowMs - DAY_MS) {
      await db.recursiveDelete(doc.ref);
      deleted.push(doc.id);
    }
  }
  return deleted.sort();
}
