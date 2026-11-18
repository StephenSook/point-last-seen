import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { getStorage } from "firebase-admin/storage";
import { HttpsError } from "firebase-functions/v2/https";

type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;
const MEDIA_PREFIXES = ["clips", "photos", "packs"] as const;

/**
 * Deletes every clip, photo and pack of each judge sandbox whose expiresAt has passed. A member can mint a
 * no-sign-in download link that works as long as the file exists (docs/LIMITS.md), so deleting the file is what
 * ends access. No model call.
 * - Which sandboxes: every judge sandbox that has ended, unless its last sweep was stamped and found nothing
 *   (mediaSweepEmpty: true). A missing stamp counts as unstamped. The judge-sandbox count is small (the daily
 *   cap times the days since launch), so one equality query reads them all.
 * - Each prefix of a sandbox is listed and deleted on its own (allSettled): a held clip never stops its photos
 *   and packs. Any failure in a sandbox, including a rejected Firestore write, is caught, reported and leaves
 *   the sandbox to the next run; the next sandbox is still swept.
 */
export async function deleteEndedSandboxMedia(db: Firestore, bucket: Pick<Bucket, "getFiles">, nowMs: number):
  Promise<{ incidents: string[]; files: number; failed: string[] }> {
  const sandboxes = await db.collection("incidents").where("mode", "==", "judge").get();
  const incidents: string[] = [], failed: string[] = [];
  let files = 0;
  for (const inc of [...sandboxes.docs].sort((a, b) => a.id.localeCompare(b.id))) {
    const endedAt = inc.get("expiresAt");
    if (!(endedAt instanceof Timestamp) || endedAt.toMillis() > nowMs) continue;
    const stamped = inc.get("mediaDeletedAt") != null;
    if (stamped && inc.get("mediaSweepEmpty") === true) continue;
    try {
      const results = await Promise.allSettled(MEDIA_PREFIXES.map(async prefix => {
        const [found] = await bucket.getFiles({ prefix: `${prefix}/${inc.id}/` });
        const deletes = await Promise.allSettled(found.map(f => f.delete({ ignoreNotFound: true })));
        const bad = deletes.find(d => d.status === "rejected");
        if (bad) throw (bad as PromiseRejectedResult).reason;
        return found.length;
      }));
      const deleted = results.reduce((n, r) => n + (r.status === "fulfilled" ? r.value : 0), 0);
      if (deleted > 0) incidents.push(inc.id);
      files += deleted;
      const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      if (errors.length > 0) {
        failed.push(inc.id);
        console.error(JSON.stringify({ event: "deleteIncidentMedia.failed", incidentId: inc.id, errors: errors.map(e => String(e.reason)) }));
        if (inc.get("mediaSweepEmpty") !== false) await inc.ref.update({ mediaSweepEmpty: false });
        continue;
      }
      await inc.ref.update({ ...(stamped ? {} : { mediaDeletedAt: FieldValue.serverTimestamp() }), mediaSweepEmpty: deleted === 0 && stamped });
    } catch (e) {
      if (!failed.includes(inc.id)) failed.push(inc.id);
      console.error(JSON.stringify({ event: "deleteIncidentMedia.failed", incidentId: inc.id, errors: [String(e)] }));
    }
  }
  return { incidents, files, failed };
}

/**
 * One scheduled run: the sweep, then the ops/storage heartbeat in a finally block, so the probe sees every run
 * (a sweep that throws counts as one failure) and a stale heartbeat means the function itself stopped. A thrown
 * sweep is rethrown after the heartbeat, so the run is logged as failed.
 */
export async function runMediaSweep(db: Firestore, bucket: Pick<Bucket, "getFiles" | "getMetadata">, nowMs: number):
  Promise<{ incidents: string[]; files: number; failed: string[] }> {
  let failures = 1;
  try {
    const r = await deleteEndedSandboxMedia(db, bucket, nowMs);
    failures = r.failed.length;
    return r;
  } finally {
    await recordStorageHealth(db, bucket, failures);
  }
}

/**
 * Deletes the clip a clip reading covers when the reading is deleted, whether by its TTL, by command or by the
 * sweep. The reading carries the consent, so the clip never outlives it by more than this trigger's delay
 * (the 30-day lifecycle and the 31-day consent margin are the backstop). Only a 64-hex-digit id names a clip;
 * anything else touches nothing. Returns whether a file was deleted.
 */
export async function deleteClipForReading(bucket: Pick<Bucket, "file">, incidentId: string, sha256: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(sha256) || !/^[A-Za-z0-9_-]{1,128}$/.test(incidentId)) return false;
  const file = bucket.file(`clips/${incidentId}/${sha256}.mp4`);
  const [found] = await file.exists();
  if (!found) return false;
  await file.delete({ ignoreNotFound: true });
  return true;
}

/**
 * deleteIncidentMediaNow (callable, command only): removes an incident's clips and photos and their reading
 * documents at once, for example when a family withdraws consent or a search closes, instead of waiting for the
 * 30-day lifecycle. The caller's claims must name this incident and the command role. Returns the number of
 * files and documents removed.
 */
export async function handleDeleteMedia(db: Firestore, bucket: Pick<Bucket, "getFiles">,
  auth: { uid: string; token: Record<string, unknown> } | null, data: { incidentId?: unknown } | null): Promise<{ deleted: number }> {
  const incidentId = data && typeof data === "object" ? data.incidentId : undefined;
  if (typeof incidentId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(incidentId)) {
    throw new HttpsError("invalid-argument", "incidentId is malformed.");
  }
  if (auth === null) throw new HttpsError("unauthenticated", "Sign in before deleting an incident's media.");
  if (auth.token.inc !== incidentId || auth.token.role !== "command") {
    throw new HttpsError("permission-denied", "Only the incident's command can delete its media.");
  }
  let deleted = 0;
  for (const prefix of ["clips", "photos"]) {
    const [found] = await bucket.getFiles({ prefix: `${prefix}/${incidentId}/` });
    await Promise.all(found.map(f => f.delete({ ignoreNotFound: true })));
    deleted += found.length;
  }
  for (const collection of ["clipReadings", "photoReadings"]) {
    const docs = await db.collection(`incidents/${incidentId}/${collection}`).listDocuments();
    await Promise.all(docs.map(d => d.delete()));
    deleted += docs.length;
  }
  console.log(JSON.stringify({ event: "deleteIncidentMediaNow", incidentId, deleted }));
  return { deleted };
}

const LIFECYCLE_PREFIXES = ["clips/", "photos/", "packs/"];
const LIFECYCLE_DAYS = 30;
type LifecycleRule = { action?: { type?: string }; condition?: Record<string, unknown> & { matchesPrefix?: unknown[] } };
interface BucketMetadata { lifecycle?: { rule?: LifecycleRule[] } }

/**
 * Whether the bucket keeps exactly the rule docs/LIMITS.md promises, and nothing that undercuts it: one rule
 * with action Delete, condition keys exactly {age, matchesPrefix}, age exactly 30 and prefixes exactly the set
 * clips/, photos/, packs/ (each once); and no other Delete rule that is younger than 30 days, touches one of
 * those prefixes, or covers the whole bucket. A looser policy would delete drill media early or not at all.
 */
function isExactRule(r: LifecycleRule): boolean {
  const c = r.condition ?? {};
  const keys = Object.keys(c).sort();
  const prefixes = Array.isArray(c.matchesPrefix) ? c.matchesPrefix : null;
  return r.action?.type === "Delete" && keys.length === 2 && keys[0] === "age" && keys[1] === "matchesPrefix"
    && c.age === LIFECYCLE_DAYS && prefixes !== null && prefixes.length === LIFECYCLE_PREFIXES.length
    && LIFECYCLE_PREFIXES.every(p => prefixes.filter(x => x === p).length === 1);
}
function undercuts(r: LifecycleRule): boolean {
  if (r.action?.type !== "Delete") return false;
  const c = r.condition ?? {};
  const prefixes = Array.isArray(c.matchesPrefix) ? (c.matchesPrefix as unknown[]) : [];
  return (typeof c.age === "number" && c.age < LIFECYCLE_DAYS) || prefixes.length === 0
    || prefixes.some(p => typeof p === "string" && LIFECYCLE_PREFIXES.some(ours => ours.startsWith(p) || p.startsWith(ours)));
}
export function lifecycleOk(meta: BucketMetadata): { ok: boolean; ageDays: number | null } {
  const rules = meta.lifecycle?.rule ?? [];
  const exact = rules.findIndex(isExactRule);
  if (exact < 0 || rules.some((r, i) => i !== exact && undercuts(r))) return { ok: false, ageDays: null };
  return { ok: true, ageDays: LIFECYCLE_DAYS };
}

/**
 * Writes ops/storage, the one doc anyone may read: the lifecycle state, the last sweep's failure count and a server time. The daily probe
 * reads it without credentials and fails if the rule is gone or the time is stale (the sweep stopped).
 */
export async function recordStorageHealth(db: Firestore, bucket: Pick<Bucket, "getMetadata">, sweepFailures = 0): Promise<void> {
  const [meta] = await bucket.getMetadata();
  const lc = lifecycleOk(meta as BucketMetadata);
  const ref = db.doc("ops/storage");
  const previous = (await ref.get()).get("sweepFailureStreak");
  const sweepFailureStreak = sweepFailures > 0 ? (typeof previous === "number" ? previous : 0) + 1 : 0;
  // Public doc: counts only; the failed incident ids go to the function log. The probe fails on a streak of 2.
  await ref.set({ lifecycleOk: lc.ok, lifecycleAgeDays: lc.ageDays, sweepFailures, sweepFailureStreak, checkedAt: FieldValue.serverTimestamp() });
}
