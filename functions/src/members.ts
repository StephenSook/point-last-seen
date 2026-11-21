// removeMember: command removes a searcher or family member from its own incident.
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { assertCurrentCommand } from "./authz.js";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const UID = /^[A-Za-z0-9:_-]{1,128}$/;
const notMember = () => new HttpsError("not-found", "That person is not a member of this search.", { reason: "not_member" });

/**
 * Command removes one searcher or family member of its own incident.
 *
 * Who the member is comes from incidents/{id}/members/{uid}, which joinIncident writes in one transaction with its
 * check of the removal records, so a later join elsewhere (new claims) does not hide a member and a join racing a
 * removal is serialized. An account that joined before members records existed is found by its current claims.
 *
 * The removal is recorded first, at incidents/{id}/removed/{uid} (server-owned): from that write on, the security
 * rules refuse every read and write by that uid to the incident, whatever its ID token still says (a token stays
 * valid for up to an hour after its refresh tokens are revoked), and the join function refuses it. Only then, if the
 * account's claims still name this incident, are they cleared and its refresh tokens revoked; an account that has
 * moved to another incident keeps that incident's claims and sessions. Command cannot remove itself or another
 * command, and the caller must be command now (its current claims), not only by its token. Removing a member already
 * removed is ok, and finishes a cleanup that failed before.
 */
export async function handleRemoveMember(db: Firestore, auth: Pick<Auth, "getUser" | "setCustomUserClaims" | "revokeRefreshTokens">,
  caller: { uid: string; token: Record<string, unknown> } | null, data: { incidentId?: unknown; uid?: unknown } | null): Promise<{ removed: true }> {
  const incidentId = data && typeof data === "object" ? data.incidentId : undefined;
  const uid = data && typeof data === "object" ? data.uid : undefined;
  if (typeof incidentId !== "string" || !ID.test(incidentId)) {
    throw new HttpsError("invalid-argument", "incidentId is malformed.", { reason: "bad_incident_id" });
  }
  if (typeof uid !== "string" || !UID.test(uid)) throw new HttpsError("invalid-argument", "uid is malformed.", { reason: "bad_uid" });
  if (caller === null) throw new HttpsError("unauthenticated", "Sign in before removing a member.", { reason: "not_signed_in" });
  const refusal = "Only the incident's command can remove a member.";
  if (caller.token["inc"] !== incidentId || caller.token["role"] !== "command") {
    throw new HttpsError("permission-denied", refusal, { reason: "not_command" });
  }
  await assertCurrentCommand(db, auth, caller.uid, incidentId, refusal);
  if (uid === caller.uid) throw new HttpsError("failed-precondition", "Command cannot remove itself.", { reason: "self" });

  const removedRef = db.doc(`incidents/${incidentId}/removed/${uid}`);
  const memberRef = db.doc(`incidents/${incidentId}/members/${uid}`);
  await db.runTransaction(async tx => {
    const [removed, member] = await Promise.all([tx.get(removedRef), tx.get(memberRef)]);
    if (removed.exists) return;
    let role: unknown = member.get("role");
    let team: unknown = member.get("team") ?? null;
    if (!member.exists) {
      // Joined before members records existed: its current claims are the only record.
      const claims = (await auth.getUser(uid).catch((e: unknown) => {
        if ((e as { code?: string }).code === "auth/user-not-found") return null;
        throw e;
      }))?.customClaims ?? {};
      if (claims["inc"] !== incidentId) throw notMember();
      role = claims["role"];
      team = claims["team"] ?? null;
    }
    if (role === "command") throw new HttpsError("permission-denied", "Command cannot remove another command.", { reason: "command_target" });
    if (role !== "searcher" && role !== "family") throw notMember();
    // First: from this write on, the rules refuse the member's reads and writes, whatever its tokens still say.
    tx.create(removedRef, { removedAt: FieldValue.serverTimestamp(), removedBy: caller.uid, role, team });
  });

  // Then the account itself, only while its claims still name this incident. A missing account is done; any other
  // failure is reported, and calling again finishes the cleanup (the record already refuses the member).
  const target = await auth.getUser(uid).catch((e: unknown) => {
    if ((e as { code?: string }).code === "auth/user-not-found") return null;
    throw e;
  });
  if (target !== null && target.customClaims?.["inc"] === incidentId) {
    await auth.setCustomUserClaims(uid, null);
    await auth.revokeRefreshTokens(uid);
  }
  return { removed: true };
}
