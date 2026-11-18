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
 * Writes ops/storage, the one doc anyone may read: the lifecycle state and a server time. The daily probe
 * reads it without credentials and fails if the rule is gone or the time is stale (the sweep stopped).
 */
export async function recordStorageHealth(db: Firestore, bucket: Pick<Bucket, "getMetadata">): Promise<void> {
  const [meta] = await bucket.getMetadata();
  const lc = lifecycleOk(meta as BucketMetadata);
  await db.doc("ops/storage").set({ lifecycleOk: lc.ok, lifecycleAgeDays: lc.ageDays, checkedAt: FieldValue.serverTimestamp() });
}
