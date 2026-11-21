// deleteMyAccount: a searcher or family member deletes its own sign-in when it leaves a search.
import type { Auth } from "firebase-admin/auth";
import { HttpsError } from "firebase-functions/v2/https";

const gone = (e: unknown) => (e as { code?: string }).code === "auth/user-not-found";

/**
 * Deletes the caller's own Firebase Auth user, and only the caller's. Its reports stay in the incident until the
 * drill's retention removes them, as the privacy policy says. Idempotent: a caller whose user is already gone (a
 * delete whose reply was lost) gets { ok: true }, so the phone is never stuck in a search it already left.
 *
 * A command account is refused and keeps its sign-in: command never leaves this way, and its ID token would keep
 * command's rule access for up to an hour after the delete.
 */
export async function handleDeleteMyAccount(auth: Pick<Auth, "deleteUser" | "getUser">, uid: string | null): Promise<{ ok: true }> {
  if (uid === null) throw new HttpsError("unauthenticated", "Sign in before deleting this sign-in.", { reason: "not_signed_in" });
  const user = await auth.getUser(uid).catch((e: unknown) => {
    if (gone(e)) return null;
    throw e;
  });
  if (user === null) return { ok: true };
  if (user.customClaims?.["role"] === "command") {
    throw new HttpsError("failed-precondition", "Command keeps its sign-in.", { reason: "command_account" });
  }
  try {
    await auth.deleteUser(uid);
  } catch (e: unknown) {
    if (!gone(e)) throw e;
  }
  return { ok: true };
}
