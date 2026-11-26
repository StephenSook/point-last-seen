import { randomUUID } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import { Timestamp, type DocumentData, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type FunctionsErrorCode } from "firebase-functions/v2/https";
import { logIncidentId } from "./logId.js";
import { practiceReading, practiceTrack, type ClipStore } from "./practiceClip.js";

/** The label every practice incident carries, shown wherever the drill label is shown. */
export const JUDGE_LABEL = "Training drill. Practice search; nobody is missing.";
/** The incident a practice search is copied from: the development drill on the Piedmont Park grid (OpenStreetMap). */
export const JUDGE_SEED_INCIDENT = "drill-dev-1";
/**
 * The clips a practice search may copy from the seed, by SHA-256: only the blurred copy of the team's porch clip
 * (plates and house numbers pixelated), never the original.
 */
export const JUDGE_CLIP_SHA256S: readonly string[] = ["28fffd2082fd48ea50709b94c8d37b823d2613dc5997adffda1117136483ddfb"];
/** New practice searches allowed per UTC day across all visitors (cost bound). */
export const JUDGE_SESSIONS_PER_DAY = 50;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
// Seed fields a practice incident must not inherit; everything else (grid, IPP, terrain, prior and engine settings)
// is copied so the practice search runs the real engine on the real grid.
// The seed's own end of search (closedReason, closedAt) is never copied: a copy starts open.
const NOT_COPIED = new Set(["createdAt", "expiresAt", "name", "mode", "drillLabel", "status", "priorInputEventIds",
  "joinCodeHash", "commandJoinCodeHash", "mediaDeletedAt", "mediaSweepEmpty", "mediaRevokedAt",
  "setupReady", "setupId", "setupStartedAtMs", "closedReason", "closedAt"]);
/** startJudgeSession's timeout (index.ts). A 2nd gen function can keep running after it, so it is not a kill switch. */
export const JUDGE_SESSION_TIMEOUT_S = 120;
/**
 * A setup that has not finished in this long is taken to have died, and the next start builds a fresh attempt. More
 * than twice the timeout, as a margin; the safety comes from each attempt having its own incident id.
 */
export const SETUP_STALE_MS = 5 * 60_000;
/**
 * Each refusal carries a stable details.reason beside its sentence, so a client maps the code and the reason, never
 * the text (a client SDK may add to the message). The sentences stay as the words a client shows.
 */
const refuse = (code: FunctionsErrorCode, message: string, reason: string) => new HttpsError(code, message, { reason });
const noSeed = () => refuse("failed-precondition", "No practice search is available right now.", "no_practice");
const stillSettingUp = () => refuse("unavailable", "Your practice search is still being set up. Try again in a moment.", "setup_busy");

/** The part of a BulkWriter the copy uses: each set's own promise reports that write's failure. */
type Writer = { set(ref: DocumentReference, data: DocumentData): Promise<unknown>; close(): Promise<void> };
/** The practice clip's two records, written together or not at all. */
type ClipDocs = { ref: DocumentReference; data: DocumentData }[];
/**
 * copy: tests wrap the real copy step to delay it or make it fail; writer: tests make single writes fail. clipStore:
 * where the practice clip's file goes (bucketClipStore in production); without it no clip is copied. clipSha256s:
 * tests list their own clip; writeClipDocs: tests make the clip's records fail to write.
 */
type Config = { seedIncidentId: string; perDay: number; copy?: (copy: () => Promise<void>) => Promise<void>; writer?: () => Writer;
  beforeClaims?: () => Promise<void>; clipStore?: ClipStore; clipSha256s?: readonly string[]; writeClipDocs?: (docs: ClipDocs) => Promise<void> };

/**
 * Gives the command role on a practice search, but only while it is still the visitor's attempt (judgeUsers/{uid}),
 * ready, not closed and not expired, read right before the role is written. A start that paused and finds a newer winner leaves
 * that winner's role alone. (A pause between this read and the write itself is the gap left; docs/LIMITS.md.)
 */
async function giveCommand(db: Firestore, auth: Auth, uid: string, incidentId: string, nowMs: number,
  beforeClaims?: () => Promise<void>): Promise<{ incidentId: string; role: "command" }> {
  await beforeClaims?.();
  const [user, sandbox] = await db.getAll(db.doc(`judgeUsers/${uid}`), db.doc(`incidents/${incidentId}`));
  const exp = sandbox!.get("expiresAt");
  const current = user!.get("incidentId") === incidentId && sandbox!.get("setupReady") === true
    && sandbox!.get("status") !== "closed" && exp instanceof Timestamp && exp.toMillis() > Math.max(nowMs, Date.now());
  if (!current) throw stillSettingUp();
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
  if (!(await stillOwner())) throw stillSettingUp();
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

/**
 * The practice clip, after the rest of the copy: optional, so nothing here stops the practice search from starting.
 * Its records are read and checked first (practiceClip.ts: the judge-page consent, the fixed schema), then its file
 * is copied (its bytes checked against its SHA-256), then its reading and track are written together; when they
 * cannot be written, the copied file is removed again.
 */
async function copyPracticeClips(seed: DocumentReference, to: DocumentReference, nowMs: number, store: ClipStore | undefined,
  shas: readonly string[], writeDocs: (docs: ClipDocs) => Promise<void>): Promise<void> {
  if (!store) return;
  const attemptEnds = (await to.get().catch(() => null))?.get("expiresAt");
  for (const sha of shas) {
    const path = `clips/${to.id}/${sha}.mp4`;
    let copied = false;
    try {
      const [reading, track] = await Promise.all([seed.collection("clipReadings").doc(sha).get(), seed.collection("clipTracks").doc(sha).get()]);
      // Every skip says why in the log, so a practice search with no clip is never a silent one.
      const log = (fields: Record<string, string>) => console.log(JSON.stringify({ event: "startJudgeSession", incidentId: logIncidentId(to.id), ...fields }));
      const r = reading.exists ? practiceReading(reading.data()!, sha, path, attemptEnds, Math.max(nowMs, Date.now())) : { skip: "no_reading" };
      if ("skip" in r) {
        log({ practice_clip_skipped: r.skip });
        continue;
      }
      const t = track.exists ? practiceTrack(track.data()!, sha) : { skip: "no_track" };
      if ("skip" in t) log({ practice_track_skipped: t.skip });
      await store.copy(`clips/${seed.id}/${sha}.mp4`, path, sha);
      copied = true;
      await writeDocs([{ ref: to.collection("clipReadings").doc(sha), data: r.data }, ...("data" in t ? [{ ref: to.collection("clipTracks").doc(sha), data: t.data }] : [])]);
    } catch {
      console.log(JSON.stringify({ event: "startJudgeSession", incidentId: logIncidentId(to.id), clip: "not_copied" }));
      if (copied) await store.remove(path).catch(() => undefined);
    }
  }
}

/**
 * Whether a sandbox holds the seed's whole copy: every one of the seed's segment and team ids, and the shared profile
 * if the seed has one. With no seed there is nothing to check against, so nothing is promoted.
 */
async function copyIsComplete(seed: DocumentReference, to: DocumentReference): Promise<boolean> {
  if (!(await seed.get()).exists) throw noSeed();
  for (const sub of ["segments", "teams"]) {
    const have = new Set((await to.collection(sub).listDocuments()).map(d => d.id));
    if ((await seed.collection(sub).listDocuments()).some(d => !have.has(d.id))) return false;
  }
  const [a, b] = await Promise.all([seed.collection("profile").doc("shared").get(), to.collection("profile").doc("shared").get()]);
  return !a.exists || b.exists;
}

/**
 * startJudgeSession (callable): a signed-in visitor gets their own practice incident, copied from the seed drill (its
 * grid, prior, teams and shared profile, and the blurred practice clip with its reading and track; never its events,
 * command profile, or any other clip or consent record), labelled as a training
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
  if (uid === null) throw refuse("unauthenticated", "Sign in before starting a practice search.", "not_signed_in");
  const userRef = db.doc(`judgeUsers/${uid}`), legacyId = `judge-${uid}`, legacyRef = db.doc(`incidents/${legacyId}`);
  const seedRef = db.doc(`incidents/${cfg.seedIncidentId}`);
  const setupId = randomUUID();
  const attemptId = `judge-${uid}-${randomUUID().replace(/-/g, "").slice(0, 12)}`, attemptRef = db.doc(`incidents/${attemptId}`);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  // One counter per UTC day: a call that started before midnight and commits after it counts on its own day only.
  const counter = db.doc(`ops/judgeSessions-${today}`);
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
    // A sandbox the visitor ended (closed) counts as ended, like an expired one: the next start is a new session.
    if (current?.exists && exp instanceof Timestamp && exp.toMillis() > nowMs && current.get("status") !== "closed") {
      if (current.get("setupReady") === true) {
        if (!user!.exists) tx.set(userRef, { incidentId: current.id, createdAt: current.get("createdAt") });
        return { kind: "ready", id: current.id };
      }
      // Only a sandbox made before setup was tracked has no flag: checked against the seed below.
      if (current.get("setupReady") === undefined) return { kind: "legacy", id: current.id };
      const started = current.get("setupStartedAtMs");
      if (typeof started === "number" && nowMs - started < SETUP_STALE_MS) return { kind: "busy" };
      if (!seed!.exists) throw noSeed();
      tx.update(current.ref, retired);
      tx.set(attemptRef, attempt(seed!.data()!, current.get("createdAt"), exp));
      tx.set(userRef, { incidentId: attemptId, createdAt: current.get("createdAt") });
      return { kind: "build", id: attemptId };
    }
    const created = user!.exists ? user!.get("createdAt") : current?.get("createdAt");
    if (created instanceof Timestamp && nowMs - created.toMillis() < HOUR_MS) {
      throw refuse("resource-exhausted", "One new practice search per hour. Try again later.", "hourly_limit");
    }
    if (!seed!.exists) throw noSeed();
    const used = typeof count!.get("count") === "number" ? (count!.get("count") as number) : 0;
    if (used >= cfg.perDay) throw refuse("resource-exhausted", "Practice searches are full for today. Try again tomorrow.", "daily_limit");
    // The cap enforced rides with the count, so the quota probe reads the deployed cap (scripts/judge_quota_probe.py).
    tx.set(counter, { count: used + 1, cap: cfg.perDay });
    const createdAt = Timestamp.fromMillis(nowMs);
    tx.set(attemptRef, attempt(seed!.data()!, createdAt, Timestamp.fromMillis(nowMs + DAY_MS)));
    tx.set(userRef, { incidentId: attemptId, createdAt });
    return { kind: "build", id: attemptId };
  });
  if (action.kind === "busy") throw stillSettingUp();
  if (action.kind === "ready") return giveCommand(db, auth, uid, action.id, nowMs, cfg.beforeClaims);

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
      if (!seed!.exists) throw noSeed();
      tx.update(legacyRef, retired);
      tx.set(attemptRef, attempt(seed!.data()!, legacy!.get("createdAt"), legacy!.get("expiresAt")));
      tx.set(userRef, { incidentId: attemptId, createdAt: legacy!.get("createdAt") });
      return "build" as const;
    });
    if (next === "busy") throw stillSettingUp();
    if (next === "ready") return giveCommand(db, auth, uid, legacyId, nowMs, cfg.beforeClaims);
    buildId = attemptId;
  }

  const ref = db.doc(`incidents/${buildId}`);
  const stillOwner = async () => (await ref.get()).get("setupId") === setupId;
  const writeClipDocs = cfg.writeClipDocs ?? (async (docs: ClipDocs) => {
    const batch = db.batch();
    for (const d of docs) batch.set(d.ref, d.data);
    await batch.commit();
  });
  const copy = async () => {
    await copyFrom(seedRef, ref, cfg.writer ?? (() => db.bulkWriter()), stillOwner);
    await copyPracticeClips(seedRef, ref, nowMs, cfg.clipStore, cfg.clipSha256s ?? JUDGE_CLIP_SHA256S, writeClipDocs);
  };
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
  console.log(JSON.stringify({ event: "startJudgeSession", incidentId: logIncidentId(buildId), seed: cfg.seedIncidentId }));
  return giveCommand(db, auth, uid, buildId, nowMs, cfg.beforeClaims);
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
