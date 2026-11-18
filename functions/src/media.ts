import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { getStorage } from "firebase-admin/storage";

type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;
const MEDIA_PREFIXES = ["clips", "photos", "packs"] as const;

/**
 * Deletes every clip, photo and pack of each judge sandbox whose expiresAt has passed, and stamps
 * mediaDeletedAt the first time. A member can mint a no-sign-in download link that works as long as the
 * file exists (docs/LIMITS.md), so deleting the file is what ends access. Every run re-checks all ended
 * sandboxes, so an upload that was in flight at the end is caught on the next run. No model call.
 */
export async function deleteEndedSandboxMedia(db: Firestore, bucket: Bucket, nowMs: number): Promise<{ incidents: string[]; files: number }> {
  const ended = await db.collection("incidents").where("expiresAt", "<=", Timestamp.fromMillis(nowMs)).get();
  const incidents: string[] = [];
  let files = 0;
  for (const inc of ended.docs) {
    if (inc.get("mode") !== "judge") continue;
    let deleted = 0;
    for (const prefix of MEDIA_PREFIXES) {
      const [found] = await bucket.getFiles({ prefix: `${prefix}/${inc.id}/` });
      await Promise.all(found.map(f => f.delete({ ignoreNotFound: true })));
      deleted += found.length;
    }
    if (deleted > 0) incidents.push(inc.id);
    files += deleted;
    if (inc.get("mediaDeletedAt") == null) await inc.ref.update({ mediaDeletedAt: FieldValue.serverTimestamp() });
  }
  return { incidents, files };
}

const LIFECYCLE_PREFIXES = ["clips/", "photos/", "packs/"];
const LIFECYCLE_MAX_DAYS = 30;
interface BucketMetadata { lifecycle?: { rule?: { action?: { type?: string }; condition?: { age?: number; matchesPrefix?: string[] } }[] } }

/**
 * Whether the bucket keeps a Delete rule within 30 days that covers clips/, photos/ and packs/ (a rule
 * with no prefix covers everything). docs/LIMITS.md promises drill media is deleted within 30 days.
 */
export function lifecycleOk(meta: BucketMetadata): { ok: boolean; ageDays: number | null } {
  for (const r of meta.lifecycle?.rule ?? []) {
    const age = r.condition?.age;
    if (r.action?.type !== "Delete" || typeof age !== "number" || age > LIFECYCLE_MAX_DAYS) continue;
    const prefixes = r.condition?.matchesPrefix ?? [];
    if (prefixes.length === 0 || LIFECYCLE_PREFIXES.every(p => prefixes.includes(p))) return { ok: true, ageDays: age };
  }
  return { ok: false, ageDays: null };
}

/**
 * Writes ops/storage, the one doc anyone may read: the lifecycle state and a server time. The daily probe
 * reads it without credentials and fails if the rule is gone or the time is stale (the sweep stopped).
 */
export async function recordStorageHealth(db: Firestore, bucket: Pick<Bucket, "getMetadata">): Promise<void> {
  const [meta] = await bucket.getMetadata();
  const lc = lifecycleOk(meta as BucketMetadata);
  await db.doc("ops/storage").set({ lifecycleOk: lc.ok, lifecycleAgeDays: lc.ageDays, checkedAt: FieldValue.serverTimestamp() });
}
