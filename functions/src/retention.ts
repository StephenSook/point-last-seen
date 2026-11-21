// Drill retention. A drill's data is deleted 30 days after the search command closes it:
// - closedAt is server-owned (the rules refuse it from any client) and written by recordDrillClosed when a drill's
//   status becomes closed. Closing is final in the rules, so closedAt is never cleared.
// - deleteEndedDrills (daily) deletes each drill whose closedAt is more than 30 days old: its media prefixes first,
//   then the incident with everything under it, then the anonymous sign-ins whose only incident it was. A drill whose
//   media cannot be deleted is left whole for the next run. The keep-list protects the drills the judge page and the
//   film use. A drill closed before closedAt existed has none and is never deleted by this job.
import type { Auth } from "firebase-admin/auth";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { getStorage } from "firebase-admin/storage";

// The bucket type the Admin SDK hands out (as in media.ts).
type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

export const DRILL_RETENTION_MS = 30 * 86_400_000;
// The prefixes a drill's media live under (as in media.ts).
const MEDIA_PREFIXES = ["clips", "photos", "packs"] as const;
// drill-dev-1: the development drill; drill-judge-1: the judge sandboxes' seed; drill-kennesaw-1: the drill on film,
// kept through judging and until the end of the year.
const KEEP_UNTIL: Record<string, number> = {
  "drill-dev-1": Number.POSITIVE_INFINITY,
  "drill-judge-1": Number.POSITIVE_INFINITY,
  "drill-kennesaw-1": Date.UTC(2027, 0, 1),
};

/** The time until which a drill is kept whatever its closedAt says, or 0 when it is not on the keep-list. */
export function keptUntil(incidentId: string): number {
  return KEEP_UNTIL[incidentId] ?? 0;
}

type Doc = Record<string, unknown> | undefined;

/** The closedAt write for an incident update, or null: only a drill moving into closed, and only once. */
export function closedAtPatch(before: Doc, after: Doc): { closedAt: FieldValue } | null {
  if (!before || !after || after["mode"] !== "drill") return null;
  if (before["status"] === "closed" || after["status"] !== "closed" || after["closedAt"] !== undefined) return null;
  return { closedAt: FieldValue.serverTimestamp() };
}

/** Writes closedAt when this update closed a drill. Returns whether it wrote. */
export async function recordDrillClosed(db: Firestore, incidentId: string, before: Doc, after: Doc): Promise<boolean> {
  const patch = closedAtPatch(before, after);
  if (!patch) return false;
  await db.doc(`incidents/${incidentId}`).update(patch);
  return true;
}

export type RetentionResult = { deleted: string[]; kept: string[]; failed: string[]; files: number; users: number };

/**
 * Deletes every drill closed more than 30 days before nowMs that is not on the keep-list, with its media and the
 * anonymous sign-ins that belonged only to it. With dryRun, it lists the same and changes nothing.
 */
export async function deleteEndedDrills(db: Firestore, bucket: Pick<Bucket, "getFiles">, auth: Pick<Auth, "listUsers" | "deleteUsers">,
  nowMs: number, opts: { dryRun?: boolean } = {}): Promise<RetentionResult> {
  const out: RetentionResult = { deleted: [], kept: [], failed: [], files: 0, users: 0 };
  const due: string[] = [];
  for (const doc of (await db.collection("incidents").where("mode", "==", "drill").get()).docs) {
    const at = doc.get("closedAt");
    if (doc.get("status") !== "closed" || !(at instanceof Timestamp) || at.toMillis() >= nowMs - DRILL_RETENTION_MS) continue;
    if (keptUntil(doc.id) > nowMs) out.kept.push(doc.id);
    else due.push(doc.id);
  }
  for (const id of due.sort()) {
    try {
      // Media first: if any of it cannot be deleted, the incident stays, so the next run finds the drill again.
      for (const prefix of MEDIA_PREFIXES) {
        const [files] = await bucket.getFiles({ prefix: `${prefix}/${id}/` });
        out.files += files.length;
        if (!opts.dryRun) await Promise.all(files.map(f => f.delete({ ignoreNotFound: true })));
      }
      if (!opts.dryRun) await db.recursiveDelete(db.doc(`incidents/${id}`));
      out.deleted.push(id);
    } catch {
      out.failed.push(id);
    }
  }
  // A sign-in belongs to one incident (its inc claim). Only anonymous ones are deleted (no provider, no email, no phone
  // number): any other is a person's account, kept even when its incident is gone.
  const gone = new Set(out.deleted);
  const orphans: string[] = [];
  if (gone.size > 0) {
    let page: string | undefined;
    do {
      const r = await auth.listUsers(1000, page);
      for (const u of r.users) {
        const anonymous = u.providerData.length === 0 && !u.email && !u.phoneNumber;
        if (anonymous && gone.has(String(u.customClaims?.["inc"] ?? ""))) orphans.push(u.uid);
      }
      page = r.pageToken;
    } while (page);
  }
  out.users = orphans.length;
  if (!opts.dryRun) {
    for (let i = 0; i < orphans.length; i += 1000) await auth.deleteUsers(orphans.slice(i, i + 1000));
  }
  out.kept.sort();
  return out;
}
