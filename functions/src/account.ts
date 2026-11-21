// deleteMyAccount: a member deletes its own sign-in when it leaves a search.
import type { Auth } from "firebase-admin/auth";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Deletes the caller's own Firebase Auth user, and only the caller's. Its reports stay in the incident until the
 * drill's retention removes them, as the privacy policy says. Idempotent: a caller whose user is already gone (a
 * delete whose reply was lost) gets { ok: true }, so the phone is never stuck in a search it already left.
 */
export async function handleDeleteMyAccount(auth: Pick<Auth, "deleteUser">, uid: string | null): Promise<{ ok: true }> {
  if (uid === null) throw new HttpsError("unauthenticated", "Sign in before deleting this sign-in.", { reason: "not_signed_in" });
  try {
    await auth.deleteUser(uid);
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
  }
  return { ok: true };
}
