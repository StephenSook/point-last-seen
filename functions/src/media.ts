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
