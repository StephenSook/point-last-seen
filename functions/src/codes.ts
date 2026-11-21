// rotateJoinCode: command gives one role of its incident a new join code, so a code that got out (or a person command
// removed, who could join again with a new sign-in) no longer admits anyone.
import { randomInt } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { assertCurrentCommand } from "./authz.js";
import { hashJoinCode } from "./join.js";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
/** The join code alphabet (join.ts CODE_FORMAT): digits and capitals without I, L, O and U. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ROTATABLE = ["searcher", "family"] as const;

function newCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/**
 * Makes a new code for one role (searcher or family) of the caller's incident and, in the same transaction, deletes
 * every code of that role for the incident (the seeded one and any extra, such as a reviewer's or judges' code), so
 * only the new code admits that role. The new code is returned once, to command; only its hash is stored. Command's
 * own code is rotated with the operator tool, never here. The caller must be the incident's command now (its current
 * claims, not only its token), and the incident must be an open drill: a practice sandbox has no join codes, and a
 * closed search takes no new members.
 */
export async function handleRotateJoinCode(db: Firestore, auth: Pick<Auth, "getUser">,
  caller: { uid: string; token: Record<string, unknown> } | null, data: { incidentId?: unknown; role?: unknown } | null,
): Promise<{ code: string; role: string; replaced: number }> {
  const incidentId = data && typeof data === "object" ? data.incidentId : undefined;
  const role = data && typeof data === "object" ? data.role : undefined;
  if (typeof incidentId !== "string" || !ID.test(incidentId)) {
    throw new HttpsError("invalid-argument", "incidentId is malformed.", { reason: "bad_incident_id" });
  }
  if (typeof role !== "string" || !(ROTATABLE as readonly string[]).includes(role)) {
    throw new HttpsError("invalid-argument", "Only a searcher or family code can be replaced here.", { reason: "bad_role" });
  }
  if (caller === null) throw new HttpsError("unauthenticated", "Sign in before replacing a join code.", { reason: "not_signed_in" });
  const refusal = "Only the incident's command can replace its join codes.";
  if (caller.token["inc"] !== incidentId || caller.token["role"] !== "command") {
    throw new HttpsError("permission-denied", refusal, { reason: "not_command" });
  }
  await assertCurrentCommand(db, auth, caller.uid, incidentId, refusal);

  // As in media.ts: claims outlive an incident, so a missing or expired one refuses its command too.
  const incident = await db.doc(`incidents/${incidentId}`).get();
  const exp = incident.get("expiresAt") as { toMillis(): number } | null | undefined;
  if (!incident.exists || (exp != null && exp.toMillis() <= Date.now())) {
    throw new HttpsError("permission-denied", refusal, { reason: "not_command" });
  }
  if (incident.get("mode") !== "drill") {
    throw new HttpsError("failed-precondition", "A practice search has no join codes.", { reason: "practice_search" });
  }
  if (incident.get("status") !== "open") {
    throw new HttpsError("failed-precondition", "This search has ended, so it takes no new members.", { reason: "not_open" });
  }

  const old = db.collection("joinCodes").where("incidentId", "==", incidentId);
  return db.runTransaction(async tx => {
    const current = (await tx.get(old)).docs.filter(d => {
      const roles = d.get("roles");
      return Array.isArray(roles) && roles.length === 1 && roles[0] === role;
    });
    // A new code's hash is checked before it is written: a collision (about 1 in 10^12 per draw) draws again.
    let code = newCode();
    for (let i = 0; (await tx.get(db.doc(`joinCodes/${hashJoinCode(code)}`))).exists; i++) {
      if (i >= 4) throw new HttpsError("aborted", "Could not make a new code. Try again.", { reason: "collision" });
      code = newCode();
    }
    tx.create(db.doc(`joinCodes/${hashJoinCode(code)}`), {
      incidentId, roles: [role], createdAt: FieldValue.serverTimestamp(), rotatedBy: caller.uid,
    });
    for (const d of current) tx.delete(d.ref);
    return { code, role, replaced: current.length };
  });
}
