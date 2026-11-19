import type { Auth } from "firebase-admin/auth";
import { Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
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
  "joinCodeHash", "commandJoinCodeHash", "mediaDeletedAt", "mediaSweepEmpty", "mediaRevokedAt"]);

type Config = { seedIncidentId: string; perDay: number };

async function giveCommand(auth: Auth, uid: string, incidentId: string): Promise<{ incidentId: string; role: "command" }> {
  await auth.setCustomUserClaims(uid, { inc: incidentId, role: "command", team: null });
  return { incidentId, role: "command" };
}

async function countToday(db: Firestore, nowMs: number, perDay: number): Promise<void> {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const ref = db.doc("ops/judgeSessions");
  await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const count = doc.get("day") === today && typeof doc.get("count") === "number" ? (doc.get("count") as number) : 0;
    if (count >= perDay) throw new HttpsError("resource-exhausted", "Practice searches are full for today. Try again tomorrow.");
    tx.set(ref, { day: today, count: count + 1 });
  });
}

async function copyFrom(db: Firestore, seed: DocumentReference, to: DocumentReference): Promise<void> {
  const writer = db.bulkWriter();
  for (const sub of ["segments", "teams"]) {
    for (const d of (await seed.collection(sub).get()).docs) writer.set(to.collection(sub).doc(d.id), d.data());
  }
  const shared = await seed.collection("profile").doc("shared").get();
  if (shared.exists) writer.set(to.collection("profile").doc("shared"), shared.data()!);
  await writer.close();
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
  const existing = await ref.get();
  if (existing.exists) {
    const exp = existing.get("expiresAt"), created = existing.get("createdAt");
    if (exp instanceof Timestamp && exp.toMillis() > nowMs) return giveCommand(auth, uid, id);
    if (created instanceof Timestamp && nowMs - created.toMillis() < HOUR_MS) {
      throw new HttpsError("resource-exhausted", "One new practice search per hour. Try again later.");
    }
  }
  const seedRef = db.doc(`incidents/${cfg.seedIncidentId}`);
  const seed = await seedRef.get();
  if (!seed.exists) throw new HttpsError("failed-precondition", "No practice search is available right now.");
  await countToday(db, nowMs, cfg.perDay);
  if (existing.exists) await db.recursiveDelete(ref);
  const fields = Object.fromEntries(Object.entries(seed.data()!).filter(([k]) => !NOT_COPIED.has(k)));
  await ref.set({ ...fields, name: "Practice search", mode: "judge", drillLabel: JUDGE_LABEL, status: "open", priorInputEventIds: [],
    createdAt: Timestamp.fromMillis(nowMs), expiresAt: Timestamp.fromMillis(nowMs + DAY_MS) });
  await copyFrom(db, seedRef, ref);
  console.log(JSON.stringify({ event: "startJudgeSession", incidentId: id, seed: cfg.seedIncidentId }));
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
