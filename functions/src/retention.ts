// Drill retention. A drill's data is deleted 30 days after the search command closes it:
// - closedAt is server-owned (the rules refuse it from any client) and written by recordDrillClosed, in a
//   transaction and only if absent, with the close write's own commit time, so a retried or repeated delivery of the
//   close event never moves it. Closing is final in the rules, so closedAt is never cleared.
// - deleteEndedDrills (daily) purges each drill whose closedAt is more than 30 days old. It first writes a purge
//   record outside the incident (ops/drillPurges/items/{id}), then deletes the media prefixes, the drill's join codes,
//   the incident with everything under it, a last media and join-code sweep (anything written during the purge; with
//   the incident gone the rules refuse new uploads), and the anonymous sign-ins whose only incident it was and that
//   nobody has used since the drill closed, each re-read just before it is deleted. The record is marked done only
//   when every step succeeded, so a run that fails partway is finished by the next one from the record, even when the
//   incident root is already gone; a record whose incident id is in use again is marked stale and nothing is deleted.
//   Done and stale records are kept for good, and the seed tool refuses any id that has one, so a purged id is never
//   reused (old sign-ins still carry it in their claims). The keep-list protects the drills the judge page and the
//   film use. A drill closed before closedAt existed has none and is never deleted by this job.
import type { Auth, UserRecord } from "firebase-admin/auth";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { getStorage } from "firebase-admin/storage";

// The bucket type the Admin SDK hands out (as in media.ts).
type Bucket = ReturnType<ReturnType<typeof getStorage>["bucket"]>;

export const DRILL_RETENTION_MS = 30 * 86_400_000;
/** Where an unfinished purge is recorded, outside the incident it deletes. */
export const PURGES = "ops/drillPurges/items";
// The prefixes a drill's media live under (as in media.ts).
const MEDIA_PREFIXES = ["clips", "photos", "packs"] as const;
// drill-dev-1: the development drill; drill-judge-1: the judge sandboxes' seed; drill-kennesaw-1: the drill on film;
// drill-test-1: the drill every live check and the daily probe use. All are kept through judging (it ends 2026-12-16)
// and until the end of the year. On that date each is purged, whether or not anyone closed it.
const KEPT_UNTIL_MS = Date.UTC(2027, 0, 1);
const KEEP_UNTIL: Record<string, number> = {
  "drill-dev-1": KEPT_UNTIL_MS,
  "drill-judge-1": KEPT_UNTIL_MS,
  "drill-kennesaw-1": KEPT_UNTIL_MS,
  "drill-test-1": KEPT_UNTIL_MS,
};

/** The time until which a drill is kept whatever its closedAt says, or 0 when it is not on the keep-list. */
export function keptUntil(incidentId: string): number {
  return KEEP_UNTIL[incidentId] ?? 0;
}

type Doc = Record<string, unknown> | undefined;

/** Whether an incident update moved a drill into closed. */
export function closesDrill(before: Doc, after: Doc): boolean {
  return !!before && !!after && after["mode"] === "drill" && before["status"] !== "closed" && after["status"] === "closed";
}

/**
 * Writes closedAt (the close write's commit time) when this update closed a drill and the incident, read in a
 * transaction, is still a closed drill with no closedAt. Returns whether it wrote.
 */
export async function recordDrillClosed(db: Firestore, incidentId: string, before: Doc, after: Doc, closedAt: Timestamp): Promise<boolean> {
  if (!closesDrill(before, after)) return false;
  const ref = db.doc(`incidents/${incidentId}`);
  return db.runTransaction(async tx => {
    const now = await tx.get(ref);
    if (!now.exists || now.get("mode") !== "drill" || now.get("status") !== "closed" || now.get("closedAt") !== undefined) return false;
    tx.update(ref, { closedAt });
    return true;
  });
}

/**
 * Starts (or resumes) the purge of one incident in a single transaction that reads the incident and its purge record
 * together, and returns the sign-in cutoff, or null when there is nothing to purge. With the incident gone, only an
 * unfinished record resumes, with its own cutoff, so a stale run never reopens a purge another run finished. With the
 * incident there, the cutoff is its close (for a kept drill past its end date, the earlier of its close and that date;
 * an open one is closed at that date, never over a close already recorded), and never later than an unfinished
 * record's cutoff; the record is written in the same transaction.
 */
export async function startPurge(db: Firestore, incidentId: string, nowMs: number, scanCutoffMs: number): Promise<number | null> {
  const incRef = db.doc(`incidents/${incidentId}`), recRef = db.doc(`${PURGES}/${incidentId}`);
  return db.runTransaction(async tx => {
    const [inc, rec] = await tx.getAll(incRef, recRef);
    const unfinished = !!rec?.exists && rec.get("doneAt") === undefined && rec.get("staleAt") === undefined;
    const recorded = unfinished && typeof rec!.get("closedAtMs") === "number" ? (rec!.get("closedAtMs") as number) : null;
    if (!inc?.exists) {
      if (recorded === null) return null;
      tx.set(recRef, { startedAt: Timestamp.fromMillis(nowMs) }, { merge: true });
      return recorded;
    }
    const at = inc.get("closedAt");
    const closedMs = at instanceof Timestamp ? at.toMillis() : null;
    const end = keptUntil(incidentId);
    let cutoff: number;
    if (end > 0 && end <= nowMs) {
      if (closedMs === null) tx.update(incRef, { closedAt: Timestamp.fromMillis(end) });
      cutoff = closedMs === null ? end : Math.min(closedMs, end);
    } else {
      cutoff = closedMs ?? scanCutoffMs;
    }
    if (recorded !== null) cutoff = Math.min(cutoff, recorded);
    tx.set(recRef, { startedAt: Timestamp.fromMillis(nowMs), closedAtMs: cutoff, doneAt: FieldValue.delete(), staleAt: FieldValue.delete() }, { merge: true });
    return cutoff;
  });
}

export type RetentionResult = { deleted: string[]; kept: string[]; failed: string[]; stale: string[]; files: number; users: number };
type RetentionAuth = Pick<Auth, "listUsers" | "getUsers" | "deleteUsers">;

const anonymous = (u: UserRecord) => u.providerData.length === 0 && !u.email && !u.phoneNumber;
const incOf = (u: UserRecord) => String(u.customClaims?.["inc"] ?? "");
// When the sign-in was last used: its last token refresh, else its last sign-in, else its creation.
const lastUsedMs = (u: UserRecord) => Date.parse(u.metadata.lastRefreshTime ?? u.metadata.lastSignInTime ?? u.metadata.creationTime);

async function sweepMedia(bucket: Pick<Bucket, "getFiles">, id: string, dryRun: boolean): Promise<number> {
  let n = 0;
  for (const prefix of MEDIA_PREFIXES) {
    const [files] = await bucket.getFiles({ prefix: `${prefix}/${id}/` });
    n += files.length;
    if (!dryRun) await Promise.all(files.map(f => f.delete({ ignoreNotFound: true })));
  }
  return n;
}

/** Every anonymous sign-in whose incident is one of ids, from one pass over the user list. */
async function anonymousMembers(auth: RetentionAuth, ids: ReadonlySet<string>): Promise<Map<string, string[]>> {
  const by = new Map<string, string[]>();
  if (ids.size === 0) return by;
  let page: string | undefined;
  do {
    const r = await auth.listUsers(1000, page);
    for (const u of r.users) {
      const id = incOf(u);
      if (anonymous(u) && ids.has(id)) by.set(id, [...(by.get(id) ?? []), u.uid]);
    }
    page = r.pageToken;
  } while (page);
  return by;
}

/**
 * Deletes the sign-ins in uids that, read again now, are still anonymous, still belong to incident id and have not
 * been used since the drill closed (a person joining anything refreshes their token first, so a sign-in in use is
 * never idle). Returns how many were deleted (or would be, in a dry run); throws when any delete failed, so the purge
 * record stays.
 */
async function deleteMembers(auth: RetentionAuth, id: string, all: readonly string[], closedAtMs: number, dryRun: boolean,
  handled: ReadonlySet<string>): Promise<number> {
  // A removed sign-in whose claims were not yet cleared was already counted (and deleted) by deleteRemoved.
  const uids = all.filter(uid => !handled.has(uid));
  let deleted = 0;
  for (let i = 0; i < uids.length; i += 100) {
    const { users } = await auth.getUsers(uids.slice(i, i + 100).map(uid => ({ uid })));
    const still = users.filter(u => anonymous(u) && incOf(u) === id && lastUsedMs(u) < closedAtMs).map(u => u.uid);
    if (dryRun || still.length === 0) {
      deleted += still.length;
      continue;
    }
    const r = await auth.deleteUsers(still);
    deleted += r.successCount;
    if (r.failureCount > 0) throw new Error(`${r.failureCount} sign-in delete(s) failed`);
  }
  return deleted;
}

/**
 * The sign-ins command removed from drill id (members.ts clears their claims, so the scan by claim cannot find them):
 * read from the drill's removal records, they are deleted when, read again now, they are still anonymous, hold no
 * claims or still this drill's, and have not been used since the close. Runs before the drill is deleted, so a failed
 * delete is retried with the records still there. Returns how many were deleted (or would be, in a dry run).
 */
async function deleteRemoved(db: Firestore, auth: RetentionAuth, id: string, closedAtMs: number, dryRun: boolean,
  handled: Set<string>): Promise<number> {
  const uids = (await db.collection(`incidents/${id}/removed`).listDocuments()).map(d => d.id);
  let deleted = 0;
  for (let i = 0; i < uids.length; i += 100) {
    const { users } = await auth.getUsers(uids.slice(i, i + 100).map(uid => ({ uid })));
    const still = users.filter(u => anonymous(u) && (incOf(u) === "" || incOf(u) === id) && lastUsedMs(u) < closedAtMs).map(u => u.uid);
    for (const uid of still) handled.add(uid);
    if (dryRun || still.length === 0) {
      deleted += still.length;
      continue;
    }
    const r = await auth.deleteUsers(still);
    deleted += r.successCount;
    if (r.failureCount > 0) throw new Error(`${r.failureCount} removed sign-in delete(s) failed`);
  }
  return deleted;
}

/**
 * Purges every drill closed more than 30 days before nowMs that is not on the keep-list, and finishes every purge a
 * previous run left recorded. With dryRun, it lists the same and writes nothing.
 */
export async function deleteEndedDrills(db: Firestore, bucket: Pick<Bucket, "getFiles">, auth: RetentionAuth,
  nowMs: number, opts: { dryRun?: boolean } = {}): Promise<RetentionResult> {
  const dryRun = opts.dryRun === true;
  const out: RetentionResult = { deleted: [], kept: [], failed: [], stale: [], files: 0, users: 0 };
  // When each due drill closed: from the incident for a newly due drill, from its record for a resumed purge.
  const due = new Map<string, number>();
  for (const doc of (await db.collection("incidents").where("mode", "==", "drill").get()).docs) {
    const at = doc.get("closedAt");
    const closedMs = at instanceof Timestamp ? at.toMillis() : null;
    const keep = keptUntil(doc.id);
    // A kept drill goes once its end date passes, whether or not anyone closed it. Its sign-in cutoff is its real
    // close if it had one, else its end date, so every run and every retry use the same cutoff.
    if (keep > 0 && keep <= nowMs) {
      due.set(doc.id, closedMs === null ? keep : Math.min(closedMs, keep));
      continue;
    }
    if (doc.get("status") !== "closed" || closedMs === null || closedMs >= nowMs - DRILL_RETENTION_MS) continue;
    if (keep > nowMs) out.kept.push(doc.id);
    else due.set(doc.id, closedMs);
  }
  // A purge record is kept for good once its purge is done (doneAt) or abandoned (staleAt), as a tombstone: the seed
  // tool refuses an id that has one. An unfinished record resumes only while its incident is gone; an incident at that
  // id that is not itself due means the id is in use again, so the record is marked stale and nothing is deleted,
  // its sign-ins included. Each record is handled on its own: one that cannot be written fails alone.
  const records = (await db.collection(PURGES).get()).docs.filter(r => r.get("doneAt") === undefined && r.get("staleAt") === undefined);
  const roots = records.length === 0 ? [] : await db.getAll(...records.map(r => db.doc(`incidents/${r.id}`)));
  for (const [i, r] of records.entries()) {
    if (due.has(r.id) || keptUntil(r.id) > nowMs) continue;
    const closedAtMs = r.get("closedAtMs");
    if (!roots[i]?.exists && typeof closedAtMs === "number") {
      due.set(r.id, closedAtMs);
      continue;
    }
    try {
      if (!dryRun) await db.doc(`${PURGES}/${r.id}`).update({ staleAt: Timestamp.fromMillis(nowMs) });
      out.stale.push(r.id);
    } catch {
      out.failed.push(r.id);
    }
  }
  const members = await anonymousMembers(auth, new Set(due.keys()));
  const deleteCodes = async (id: string) => {
    const codes = await db.collection("joinCodes").where("incidentId", "==", id).get();
    await Promise.all(codes.docs.map(c => c.ref.delete()));
  };
  for (const [id, scanCutoffMs] of [...due].sort(([a], [b]) => a.localeCompare(b))) {
    try {
      // The cutoff and the purge record come from one transaction (startPurge); null: another run already finished it.
      const closedAtMs = dryRun ? scanCutoffMs : await startPurge(db, id, nowMs, scanCutoffMs);
      if (closedAtMs === null) continue;
      out.files += await sweepMedia(bucket, id, dryRun);
      const handled = new Set<string>();
      out.users += await deleteRemoved(db, auth, id, closedAtMs, dryRun, handled);
      if (!dryRun) {
        await deleteCodes(id);
        await db.recursiveDelete(db.doc(`incidents/${id}`));
        out.files += await sweepMedia(bucket, id, false);
        await deleteCodes(id);
      }
      out.users += await deleteMembers(auth, id, members.get(id) ?? [], closedAtMs, dryRun, handled);
      if (!dryRun) await db.doc(`${PURGES}/${id}`).update({ doneAt: Timestamp.fromMillis(nowMs) });
      out.deleted.push(id);
    } catch {
      out.failed.push(id);
    }
  }
  out.kept.sort();
  out.stale.sort();
  out.failed.sort();
  return out;
}
