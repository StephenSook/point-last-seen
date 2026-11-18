import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { getStorage } from "firebase-admin/storage";

type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;
const MEDIA_PREFIXES = ["clips", "photos", "packs"] as const;

/**
 * Deletes every clip, photo and pack of each judge sandbox whose expiresAt has passed. A member can mint a
 * no-sign-in download link that works as long as the file exists (docs/LIMITS.md), so deleting the file is what
 * ends access. No model call.
 * - Which sandboxes: those ended in the last 7 days, plus any still unstamped (mediaDeletedAt == null, which a
 *   failed sweep writes explicitly), so the work does not grow with history.
 * - Each prefix of a sandbox is listed and deleted on its own (allSettled): a held clip never stops its photos
 *   and packs, and one sandbox never stops the next. A sandbox with any failure is reported and left unstamped.
 * - A sandbox is skipped only once it is stamped and its previous sweep found nothing under all three prefixes
 *   (mediaSweepEmpty); until then a late upload is still caught.
 */
const RECENT_MS = 7 * 86_400_000;
export async function deleteEndedSandboxMedia(db: Firestore, bucket: Pick<Bucket, "getFiles">, nowMs: number):
  Promise<{ incidents: string[]; files: number; failed: string[] }> {
  const incidentsRef = db.collection("incidents");
  const [recent, pending] = await Promise.all([
    incidentsRef.where("expiresAt", ">=", Timestamp.fromMillis(nowMs - RECENT_MS)).where("expiresAt", "<=", Timestamp.fromMillis(nowMs)).get(),
    incidentsRef.where("mode", "==", "judge").where("mediaDeletedAt", "==", null).get(),
  ]);
  const seen = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of [...recent.docs, ...pending.docs]) seen.set(d.id, d);
  const incidents: string[] = [], failed: string[] = [];
  let files = 0;
  for (const inc of [...seen.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const endedAt = inc.get("expiresAt");
    if (inc.get("mode") !== "judge" || !(endedAt instanceof Timestamp) || endedAt.toMillis() > nowMs) continue;
    const stamped = inc.get("mediaDeletedAt") != null;
    if (stamped && inc.get("mediaSweepEmpty") === true) continue;
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
      // An explicit null keeps the sandbox in the "not yet stamped" query until a sweep succeeds.
      if (inc.get("mediaDeletedAt") !== null) await inc.ref.update({ mediaDeletedAt: null, mediaSweepEmpty: false });
      continue;
    }
    await inc.ref.update({ ...(stamped ? {} : { mediaDeletedAt: FieldValue.serverTimestamp() }), mediaSweepEmpty: deleted === 0 && stamped });
  }
  return { incidents, files, failed };
}

const LIFECYCLE_PREFIXES = ["clips/", "photos/", "packs/"];
const LIFECYCLE_DAYS = 30;
interface BucketMetadata { lifecycle?: { rule?: { action?: { type?: string }; condition?: Record<string, unknown> }[] } }

/**
 * Whether the bucket keeps exactly the rule docs/LIMITS.md promises: action Delete, condition keys exactly
 * {age, matchesPrefix}, age exactly 30, prefixes exactly clips/, photos/ and packs/. A looser rule (a
 * bucket-wide or shorter delete, an extra condition such as isLive) would delete drill media early or not at
 * all, so it does not count.
 */
export function lifecycleOk(meta: BucketMetadata): { ok: boolean; ageDays: number | null } {
  for (const r of meta.lifecycle?.rule ?? []) {
    const c = r.condition ?? {};
    const keys = Object.keys(c).sort();
    const prefixes = Array.isArray(c.matchesPrefix) ? [...(c.matchesPrefix as string[])].sort() : [];
    if (r.action?.type === "Delete" && keys.join(",") === "age,matchesPrefix" && c.age === LIFECYCLE_DAYS
      && prefixes.join(",") === [...LIFECYCLE_PREFIXES].sort().join(",")) return { ok: true, ageDays: LIFECYCLE_DAYS };
  }
  return { ok: false, ageDays: null };
}

/**
 * Writes ops/storage, the one doc anyone may read: the lifecycle state, the last sweep's failure count and a server time. The daily probe
 * reads it without credentials and fails if the rule is gone or the time is stale (the sweep stopped).
 */
export async function recordStorageHealth(db: Firestore, bucket: Pick<Bucket, "getMetadata">, sweepFailures = 0): Promise<void> {
  const [meta] = await bucket.getMetadata();
  const lc = lifecycleOk(meta as BucketMetadata);
  // Public doc: a count only; the failed incident ids go to the function log.
  await db.doc("ops/storage").set({ lifecycleOk: lc.ok, lifecycleAgeDays: lc.ageDays, sweepFailures, checkedAt: FieldValue.serverTimestamp() });
}
