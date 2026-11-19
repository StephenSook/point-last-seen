import { randomUUID } from "node:crypto";
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
  "joinCodeHash", "commandJoinCodeHash", "mediaDeletedAt", "mediaSweepEmpty", "mediaRevokedAt",
  "setupReady", "setupId", "setupStartedAtMs"]);
/** A setup that has not finished in this long is taken to have died, and the next start redoes it. */
export const SETUP_STALE_MS = 5 * 60_000;

/** copy: tests wrap the real copy step to delay it or make it fail. */
type Config = { seedIncidentId: string; perDay: number; copy?: (copy: () => Promise<void>) => Promise<void> };

async function giveCommand(auth: Auth, uid: string, incidentId: string): Promise<{ incidentId: string; role: "command" }> {
  await auth.setCustomUserClaims(uid, { inc: incidentId, role: "command", team: null });
  return { incidentId, role: "command" };
}

/** Clears whatever an earlier sandbox or a failed setup left under it, then copies the seed's subcollections in. */
async function copyFrom(db: Firestore, seed: DocumentReference, to: DocumentReference): Promise<void> {
  for (const c of await to.listCollections()) await db.recursiveDelete(c);
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
      // A sandbox made before setup was tracked has no setupReady and was built in full.
      if (existing!.get("setupReady") !== false) return "ready";
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
  if (action === "build") {
    const copy = () => copyFrom(db, seedRef, ref);
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
