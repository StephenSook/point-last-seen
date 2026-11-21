// Checks for privileged callables that go beyond the caller's ID token.
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * The caller is this incident's command NOW: its current custom claims (not only the ID token it sent, which can
 * carry an older role for up to an hour) name the incident and the command role, and command has not removed it.
 */
export async function assertCurrentCommand(db: Firestore, auth: Pick<Auth, "getUser">, uid: string, incidentId: string, refusal: string): Promise<void> {
  const deny = (): never => {
    throw new HttpsError("permission-denied", refusal, { reason: "not_command" });
  };
  const user = await auth.getUser(uid).catch((e: unknown) => {
    if ((e as { code?: string }).code === "auth/user-not-found") return null;
    throw e;
  });
  const claims = user?.customClaims ?? {};
  if (user === null || claims["inc"] !== incidentId || claims["role"] !== "command") deny();
  if ((await db.doc(`incidents/${incidentId}/removed/${uid}`).get()).exists) deny();
}
