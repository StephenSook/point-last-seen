import { createHash } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
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
/**
 * A searcher's team id is one a push can reach (notify.ts): no "-" (the topic separator), at most 32, and never
 * "family", whose topic is the family's.
 */
const TEAM_ID = /^[A-Za-z0-9_]{1,32}$/;
const teamIdOk = (t: unknown): t is string => typeof t === "string" && TEAM_ID.test(t) && t.toLowerCase() !== "family";

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

/** One message for every failed join (wrong or malformed code, wrong role, closed, expired or unknown
 * incident, unknown team, used-up invite), so the reply is never an oracle. */
const DENIED = "The join code does not match an open incident.";
const denied = (): never => {
  throw new HttpsError("permission-denied", DENIED);
};
/** 8 symbols of the Crockford base-32 alphabet (no I, L, O or U), after normalization. */
const CODE_FORMAT = /^[0-9A-HJKMNP-TV-Z]{8}$/;
export const JOIN_ATTEMPTS_PER_HOUR = 10;
const HOUR_MS = 3600_000;

/**
 * Spends one join attempt for this caller, atomically, before any code lookup: at most
 * JOIN_ATTEMPTS_PER_HOUR in a rolling one-hour window (joinAttempts/{uid}, admin only).
 */
async function spendAttempt(db: Firestore, uid: string): Promise<void> {
  const ref = db.doc(`joinAttempts/${uid}`);
  const allowed = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const start = snap.get("windowStartMs");
    const fresh = typeof start !== "number" || now - start >= HOUR_MS;
    const count = fresh ? 0 : (snap.get("count") as number) ?? 0;
    if (count >= JOIN_ATTEMPTS_PER_HOUR) return false;
    tx.set(ref, { windowStartMs: fresh ? now : start, count: count + 1 });
    return true;
  });
  if (!allowed) throw new HttpsError("resource-exhausted", "Too many join attempts. Try again in an hour.");
}

function inviteUsable(code: DocumentSnapshot): boolean {
  const exp = code.get("expiresAt");
  if (exp != null && !(exp instanceof Timestamp && exp.toMillis() > Date.now())) return false;
  const max = code.get("maxUses");
  return max == null || (typeof max === "number" && ((code.get("uses") as number) ?? 0) < max);
}

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
  if (role === "searcher" && !teamIdOk(teamId)) bad("A searcher must name a team.");

  if (!CODE_FORMAT.test(normalizeJoinCode(joinCode))) denied();
  const db = getFirestore();
  await spendAttempt(db, uid);
  const codeRef = db.doc(`joinCodes/${hashJoinCode(joinCode)}`);
  const code = await codeRef.get();
  const id = code.get("incidentId");
  const roles = code.get("roles");
  // One code per role: a code doc must name exactly one role, so a searcher's code can never admit
  // family (profile/command) or command.
  if (!code.exists || typeof id !== "string" || !Array.isArray(roles) || roles.length !== 1 || roles[0] !== role) {
    denied();
  }
  if (incidentId !== undefined && incidentId !== id) denied();
  if (!inviteUsable(code)) denied();
  const incident = await db.doc(`incidents/${id}`).get();
  // A judge sandbox needs a future timestamp expiry and a finished setup (setupReady === true), as the security
  // rules' liveFor requires; any other incident may have no expiry, but a set one counts.
  const expiresAt = incident.get("expiresAt");
  const live = expiresAt instanceof Timestamp && expiresAt.toMillis() > Date.now();
  const expired = incident.get("mode") === "judge"
    ? !live || incident.get("setupReady") !== true
    : expiresAt != null && !live;
  if (!incident.exists || incident.get("status") !== "open" || expired) denied();
  // Command removed this account from the incident (members.ts): it cannot join it again.
  if ((await db.doc(`incidents/${id}/removed/${uid}`).get()).exists) denied();
  let team: string | null = null;
  if (role === "searcher") {
    const t = await db.doc(`incidents/${id}/teams/${teamId}`).get();
    if (!t.exists) denied();
    team = teamId!;
  }
  // Count a use of a limited invite atomically, refusing if another caller took the last one meanwhile.
  if (code.get("maxUses") != null) {
    const ok = await db.runTransaction(async tx => {
      const fresh = await tx.get(codeRef);
      if (!inviteUsable(fresh)) return false;
      tx.update(codeRef, { uses: FieldValue.increment(1) });
      return true;
    });
    if (!ok) denied();
  }
  await getAuth().setCustomUserClaims(uid, { inc: id, role, team });
  return { ok: true, incidentId: id };
}
