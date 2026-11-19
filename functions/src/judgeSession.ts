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
/** A setup that has not finished in this long is taken to have died, and the next start redoes it. */
export const SETUP_STALE_MS = 5 * 60_000;

/** The part of a BulkWriter the copy uses: each set's own promise reports that write's failure. */
type Writer = { set(ref: DocumentReference, data: DocumentData): Promise<unknown>; close(): Promise<void> };
/** copy: tests wrap the real copy step to delay it or make it fail; writer: tests make single writes fail. */
type Config = { seedIncidentId: string; perDay: number; copy?: (copy: () => Promise<void>) => Promise<void>; writer?: () => Writer };

async function giveCommand(auth: Auth, uid: string, incidentId: string): Promise<{ incidentId: string; role: "command" }> {
  await auth.setCustomUserClaims(uid, { inc: incidentId, role: "command", team: null });
  return { incidentId, role: "command" };
}

/**
 * Clears whatever an earlier sandbox or a failed setup left under it, then copies the seed's subcollections in. Each
 * phase first checks that this build still owns the setup, so a builder that stalled while another took over never
 * clears or writes the newer sandbox; and every write's own result is checked, since BulkWriter.close() resolves
 * even when a write failed.
 */
async function copyFrom(db: Firestore, seed: DocumentReference, to: DocumentReference, makeWriter: () => Writer,
  stillOwner: () => Promise<boolean>): Promise<void> {
  const owned = async () => {
    if (!(await stillOwner())) throw new HttpsError("unavailable", "Your practice search is still being set up. Try again in a moment.");
  };
  await owned();
  for (const c of await to.listCollections()) await db.recursiveDelete(c);
  await owned();
  const writer = makeWriter();
  // Each write's failure is caught as it happens (never left unhandled) and the first one is thrown after close().
  const writes: Promise<unknown>[] = [];
  const set = (ref: DocumentReference, data: DocumentData) => writes.push(writer.set(ref, data).then(() => null, (e: unknown) => e ?? "write failed"));
  for (const sub of ["segments", "teams"]) {
    for (const d of (await seed.collection(sub).get()).docs) set(to.collection(sub).doc(d.id), d.data());
  }
  const shared = await seed.collection("profile").doc("shared").get();
  if (shared.exists) set(to.collection("profile").doc("shared"), shared.data()!);
  await writer.close();
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
 * startJudgeSession (callable): a signed-in visitor gets their own practice incident, incidents/judge-{uid},
 * copied from the seed drill (its grid, prior, teams and shared profile; never its events, command profile or
 * consent records), labelled as a training drill, ending 24 hours after it starts, with the command role on it.
 * A visitor who returns while it is live gets the same one. A new one is allowed once an hour per visitor and
 * within a daily cap across all visitors.
 */
export async function handleStartJudgeSession(db: Firestore, auth: Auth, uid: string | null, nowMs: number,
  cfg: Config = { seedIncidentId: JUDGE_SEED_INCIDENT, perDay: JUDGE_SESSIONS_PER_DAY }): Promise<{ incidentId: string; role: "command" }> {
  if (uid === null) throw new HttpsError("unauthenticated", "Sign in before starting a practice search.");
  const id = `judge-${uid}`, ref = db.doc(`incidents/${id}`);
  const seedRef = db.doc(`incidents/${cfg.seedIncidentId}`);
  const setupId = randomUUID();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const counter = db.doc("ops/judgeSessions");
  // One transaction decides, so two starts at once cannot both take a slot or both build: a live, ready sandbox is
  // handed back; one still being set up makes the caller wait; a missing or ended one (or a setup that died) is
  // claimed by this call, and only the claim's owner builds it. Only a new sandbox uses a slot of the daily cap.
  const action = await db.runTransaction(async tx => {
    const [existing, seed, count] = await tx.getAll(ref, seedRef, counter);
    const exp = existing!.get("expiresAt"), created = existing!.get("createdAt");
    const live = existing!.exists && exp instanceof Timestamp && exp.toMillis() > nowMs;
    if (live) {
      if (existing!.get("setupReady") === true) return "ready";
      // A sandbox made before setup was tracked has no flag: checked against the seed below.
      if (existing!.get("setupReady") === undefined) return "legacy";
      const started = existing!.get("setupStartedAtMs");
      if (typeof started === "number" && nowMs - started < SETUP_STALE_MS) return "busy";
      tx.update(ref, { setupId, setupStartedAtMs: nowMs });
      return "build";
    }
    if (existing!.exists && created instanceof Timestamp && nowMs - created.toMillis() < HOUR_MS) {
      throw new HttpsError("resource-exhausted", "One new practice search per hour. Try again later.");
    }
    if (!seed!.exists) throw new HttpsError("failed-precondition", "No practice search is available right now.");
    const used = count!.get("day") === today && typeof count!.get("count") === "number" ? (count!.get("count") as number) : 0;
    if (used >= cfg.perDay) throw new HttpsError("resource-exhausted", "Practice searches are full for today. Try again tomorrow.");
    tx.set(counter, { day: today, count: used + 1 });
    const fields = Object.fromEntries(Object.entries(seed!.data()!).filter(([k]) => !NOT_COPIED.has(k)));
    tx.set(ref, { ...fields, name: "Practice search", mode: "judge", drillLabel: JUDGE_LABEL, status: "open", priorInputEventIds: [],
      createdAt: Timestamp.fromMillis(nowMs), expiresAt: Timestamp.fromMillis(nowMs + DAY_MS),
      setupReady: false, setupId, setupStartedAtMs: nowMs });
    return "build";
  });
  if (action === "busy") throw new HttpsError("unavailable", "Your practice search is still being set up. Try again in a moment.");
  let next: "ready" | "build" = action === "legacy" ? "ready" : action;
  if (action === "legacy") {
    // A complete legacy copy gets its flag; a short one is claimed and rebuilt, on the slot it already used.
    const complete = await copyIsComplete(seedRef, ref);
    next = await db.runTransaction(async tx => {
      const fresh = await tx.get(ref);
      if (fresh.get("setupReady") !== undefined) return fresh.get("setupReady") === true ? "ready" : "build";
      tx.update(ref, complete ? { setupReady: true } : { setupReady: false, setupId, setupStartedAtMs: nowMs });
      return complete ? "ready" : "build";
    });
    if (next === "build" && (await ref.get()).get("setupId") !== setupId) {
      throw new HttpsError("unavailable", "Your practice search is still being set up. Try again in a moment.");
    }
  }
  if (next === "build") {
    const stillOwner = async () => (await ref.get()).get("setupId") === setupId;
    const copy = () => copyFrom(db, seedRef, ref, cfg.writer ?? (() => db.bulkWriter()), stillOwner);
    // Finishes or releases the claim, but only while this call still owns it (a later start may have taken over).
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
    if ((await ref.get()).get("setupReady") !== true) {
      throw new HttpsError("unavailable", "Your practice search is still being set up. Try again in a moment.");
    }
    console.log(JSON.stringify({ event: "startJudgeSession", incidentId: id, seed: cfg.seedIncidentId }));
  }
  return giveCommand(auth, uid, id);
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
