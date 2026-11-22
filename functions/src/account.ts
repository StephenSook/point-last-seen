// deleteMyAccount: a searcher or family member deletes its own sign-in when it leaves a search.
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type DocumentReference, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { PURGES } from "./retention.js";

/** At most this many incidents are checked for the caller's member records; past it the call fails and deletes nothing. */
export const MAX_INCIDENTS = 1000;
/** Every write goes in one batch, which holds at most this many. */
const MAX_WRITES = 500;
/** Documents are read this many at a time. */
const READ_CHUNK = 100;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
/** A Firebase Auth uid that is also one Firestore document id: 1 to 128 characters, no "/", not "." or "..". */
const uidOk = (uid: string) => uid.length >= 1 && uid.length <= 128 && !uid.includes("/") && uid !== "." && uid !== "..";

const gone = (e: unknown) => (e as { code?: string }).code === "auth/user-not-found";
const commandRefusal = () => new HttpsError("failed-precondition", "Command keeps its sign-in.", { reason: "command_account" });
const tooMany = (reason: "too_many_incidents" | "too_many_records") => new HttpsError("resource-exhausted",
  "There are too many searches to check, so this sign-in was not deleted. Try again later.", { reason });

async function readAll(db: Firestore, refs: DocumentReference[]): Promise<DocumentSnapshot[]> {
  const out: DocumentSnapshot[] = [];
  for (let i = 0; i < refs.length; i += READ_CHUNK) out.push(...(await db.getAll(...refs.slice(i, i + READ_CHUNK))));
  return out;
}

/**
 * Deletes the caller's own member records, then its Firebase Auth user, and only the caller's.
 *
 * The member record (incidents/{id}/members/{uid}: role, team, when it joined) goes in every incident that has one,
 * not only the one the account's claims name now, so a search the account joined earlier and a search whose command
 * removed it (claims cleared) are both covered. In the same batch, each of those incidents, and the one the claims
 * name, gets a record at incidents/{id}/removed/{uid} holding only the time and the uid itself, unless command's own
 * removal record is already there (it stays as it is): the security rules refuse every read and write by a uid with
 * that record, so the account's ID token, valid for up to an hour after the delete, no longer reaches the search.
 * The batch goes first, so a failed Auth delete leaves a retry that finds no record and still deletes the user. The
 * caller's reports stay in the incident until the drill's retention removes them, as the privacy policy says.
 *
 * Idempotent: with no record left and the user already gone (a delete whose reply was lost) the caller gets
 * { ok: true }, so the phone is never stuck in a search it already left. A caller whose user is gone but whose ID
 * token is still valid still has its records deleted.
 *
 * A command account is refused and keeps its sign-in and records, whether its claims or any member record say
 * command: command never leaves this way, and its ID token would keep command's rule access for up to an hour after
 * the delete. With more than maxIncidents incidents to check, or more writes than one batch holds, the call fails and
 * deletes nothing: it never skips a record.
 */
export async function handleDeleteMyAccount(db: Firestore, auth: Pick<Auth, "deleteUser" | "getUser">, uid: string | null,
  opts: { maxIncidents?: number; maxWrites?: number } = {}): Promise<{ ok: true }> {
  const maxIncidents = opts.maxIncidents ?? MAX_INCIDENTS;
  const maxWrites = opts.maxWrites ?? MAX_WRITES;
  if (uid === null) throw new HttpsError("unauthenticated", "Sign in before deleting this sign-in.", { reason: "not_signed_in" });
  if (!uidOk(uid)) throw new HttpsError("invalid-argument", "That sign-in is malformed.", { reason: "bad_uid" });
  const user = await auth.getUser(uid).catch((e: unknown) => {
    if (gone(e)) return null;
    throw e;
  });
  if (user?.customClaims?.["role"] === "command") throw commandRefusal();

  const incidents = await db.collection("incidents").listDocuments();
  if (incidents.length > maxIncidents) throw tooMany("too_many_incidents");
  const found = (await readAll(db, incidents.map(i => i.collection("members").doc(uid)))).filter(s => s.exists);
  if (found.some(s => s.get("role") === "command")) throw commandRefusal();

  // Where the old token could still reach: every incident with a record, and the one the claims name.
  const reach = new Set(found.map(s => s.ref.parent.parent!.id));
  const claimed = user?.customClaims?.["inc"];
  if (typeof claimed === "string" && ID.test(claimed) && incidents.some(i => i.id === claimed)) reach.add(claimed);
  // Only where the incident still exists and no retention purge of it is unfinished: a record written under a drill
  // being deleted would outlive it, and a token for a deleted incident reaches nothing anyway. A finished or abandoned
  // purge leaves its record for good as a tombstone (retention.ts), so a tombstone beside a live incident (the id in
  // use again) does not stop the record.
  const ids = [...reach];
  const [incDocs, purges, removed] = await Promise.all([readAll(db, ids.map(id => db.doc(`incidents/${id}`))),
    readAll(db, ids.map(id => db.doc(`${PURGES}/${id}`))), readAll(db, ids.map(id => db.doc(`incidents/${id}/removed/${uid}`)))]);
  const unfinished = (p: DocumentSnapshot) => p.exists && p.get("doneAt") === undefined && p.get("staleAt") === undefined;
  const toRefuse = removed.filter((s, i) => !s.exists && incDocs[i]!.exists && !unfinished(purges[i]!));
  if (found.length + toRefuse.length > maxWrites) throw tooMany("too_many_records");
  if (found.length + toRefuse.length > 0) {
    const batch = db.batch();
    // A record that changed since it was read (a join racing this leave) fails the batch, and the caller retries.
    for (const s of found) batch.delete(s.ref, { lastUpdateTime: s.updateTime! });
    // create, not set: a removal command recorded meanwhile fails the batch rather than being overwritten.
    for (const s of toRefuse) batch.create(s.ref, { removedAt: FieldValue.serverTimestamp(), removedBy: uid });
    await batch.commit();
  }

  if (user === null) return { ok: true };
  try {
    await auth.deleteUser(uid);
  } catch (e: unknown) {
    if (!gone(e)) throw e;
  }
  return { ok: true };
}
