// This browser's sign-in holds one search at a time: its claims name one incident and one role. Starting a practice
// search or joining another drill in another tab moves them, and every write from a command post still open for the
// first drill is then refused. These lines say why, instead of a bare refusal.

import { onIdTokenChanged, type Auth } from "firebase/auth";

export const OTHER_SEARCH_LINE = "You're signed in to another search in this browser. Reopen this drill with its command code to act as command.";
export const OTHER_ROLE_LINE = "This browser is signed in to this drill in another role. Reopen it with its command code to act as command.";

/** Null while the sign-in acts as command for `incidentId`, else the line that says why it does not. */
export function claimsLine(claims: Record<string, unknown>, incidentId: string): string | null {
  if (claims["inc"] !== incidentId) return OTHER_SEARCH_LINE;
  return claims["role"] === "command" ? null : OTHER_ROLE_LINE;
}

/**
 * Calls `onLine` with claimsLine each time this browser's sign-in changes, in any tab (the SDK shares the signed-in
 * user across tabs); `recheck` asks the server for fresh claims, for after a refusal. Returns the unsubscribe.
 */
export function watchClaims(auth: Auth, incidentId: string, onLine: (line: string | null) => void): { stop: () => void; recheck: () => void } {
  const read = (force: boolean) => {
    const user = auth.currentUser;
    if (!user) return;
    user.getIdTokenResult(force).then((r) => onLine(claimsLine(r.claims, incidentId)), () => {});
  };
  const stop = onIdTokenChanged(auth, (user) => {
    if (user) read(false);
  });
  return { stop, recheck: () => read(true) };
}
