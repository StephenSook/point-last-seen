// removeMember: command removes a searcher or family member from its own incident.
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const UID = /^[A-Za-z0-9:_-]{1,128}$/;

/**
 * Command removes one searcher or family member of its own incident. The removal is recorded first, at
 * incidents/{id}/removed/{uid} (server-owned; the security rules refuse every read and write by that uid to the
 * incident while the record exists, and the join function refuses that account), and only then are the member's
 * claims cleared and its refresh tokens revoked. Revoking does not end an ID token already issued (it stays valid
 * for up to an hour), which is why the record comes first. Command cannot remove itself or another command.
 * Removing a member already removed is ok.
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
  if (caller.token["inc"] !== incidentId || caller.token["role"] !== "command") {
    throw new HttpsError("permission-denied", "Only the incident's command can remove a member.", { reason: "not_command" });
  }
  if (uid === caller.uid) throw new HttpsError("failed-precondition", "Command cannot remove itself.", { reason: "self" });

  const ref = db.doc(`incidents/${incidentId}/removed/${uid}`);
  const already = await ref.get();
  let role: unknown = already.get("role");
  if (!already.exists) {
    const target = await auth.getUser(uid).catch((e: unknown) => {
      if ((e as { code?: string }).code === "auth/user-not-found") return null;
      throw e;
    });
    const claims = target?.customClaims ?? {};
    if (target === null || claims["inc"] !== incidentId) {
      throw new HttpsError("not-found", "That person is not a member of this search.", { reason: "not_member" });
    }
    role = claims["role"];
    if (role === "command") throw new HttpsError("permission-denied", "Command cannot remove another command.", { reason: "command_target" });
    if (role !== "searcher" && role !== "family") {
      throw new HttpsError("not-found", "That person is not a member of this search.", { reason: "not_member" });
    }
    // First: from this write on, the rules refuse the member's reads and writes, whatever its tokens still say.
    await ref.create({ removedAt: FieldValue.serverTimestamp(), removedBy: caller.uid, role, team: claims["team"] ?? null });
  }
  // Then: the claims go (a later token has none) and every session's refresh token is revoked.
  const now = await auth.getUser(uid).catch(() => null);
  if (now !== null && now.customClaims?.["inc"] === incidentId) await auth.setCustomUserClaims(uid, null);
  if (now !== null) await auth.revokeRefreshTokens(uid);
  return { removed: true };
}
