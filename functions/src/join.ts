import { createHash } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export type JoinRole = "command" | "searcher" | "family";
export interface JoinRequest {
  incidentId?: string;
  joinCode: string;
  role: JoinRole;
  teamId?: string;
}
export interface JoinResponse {
  ok: true;
  incidentId: string;
}

const ROLES: readonly JoinRole[] = ["command", "searcher", "family"];
const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Codes are 8 characters from a 32-symbol alphabet; case, spaces and hyphens are ignored. */
export function normalizeJoinCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]+/g, "");
}

export function hashJoinCode(code: string): string {
  return createHash("sha256").update(normalizeJoinCode(code), "utf8").digest("hex");
}

function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

/** One message for every wrong code, closed incident or unknown incident, so the reply is not an oracle. */
const DENIED = "The join code does not match an open incident.";

/**
 * Checks the join code and sets the caller's custom claims { inc, role, team }. Code hashes live in
 * joinCodes/{sha256(code)} = { incidentId, roles }, a collection no client can read: a hash of a 40-bit code
 * in a member-readable document could be brute-forced offline. Each code admits exactly one role
 * (searcher, family or command). With no incidentId, the code's own incident is used. Callers refresh their ID
 * token afterwards to receive the claims.
 */
export async function handleJoin(uid: string | null, data: JoinRequest): Promise<JoinResponse> {
  if (uid === null) throw new HttpsError("unauthenticated", "Sign in before joining an incident.");
  if (data === null || typeof data !== "object") bad("The request must be an object.");
  const { incidentId, joinCode, role, teamId } = data;
  if (typeof joinCode !== "string" || normalizeJoinCode(joinCode).length === 0) bad("joinCode must be text.");
  if (!ROLES.includes(role)) bad("role must be command, searcher or family.");
  if (incidentId !== undefined && (typeof incidentId !== "string" || !ID.test(incidentId))) bad("incidentId is malformed.");
  if (role === "searcher" && (typeof teamId !== "string" || !ID.test(teamId))) bad("A searcher must name a team.");

  const db = getFirestore();
  const code = await db.doc(`joinCodes/${hashJoinCode(joinCode)}`).get();
  const id = code.get("incidentId");
  const roles = code.get("roles");
  // One code per role: a code doc must name exactly one role, so a searcher's code can never admit
  // family (profile/command) or command.
  if (!code.exists || typeof id !== "string" || !Array.isArray(roles) || roles.length !== 1 || roles[0] !== role) {
    throw new HttpsError("permission-denied", DENIED);
  }
  if (incidentId !== undefined && incidentId !== id) throw new HttpsError("permission-denied", DENIED);
  const incident = await db.doc(`incidents/${id}`).get();
  const expiresAt = incident.get("expiresAt");
  const expired = expiresAt instanceof Timestamp && expiresAt.toMillis() <= Date.now();
  if (!incident.exists || incident.get("status") !== "open" || expired) {
    throw new HttpsError("permission-denied", DENIED);
  }
  let team: string | null = null;
  if (role === "searcher") {
    const t = await db.doc(`incidents/${id}/teams/${teamId}`).get();
    if (!t.exists) bad("That team is not part of this incident.");
    team = teamId!;
  }
  await getAuth().setCustomUserClaims(uid, { inc: id, role, team });
  return { ok: true, incidentId: id };
}
