// This browser's sign-in holds one search at a time: its claims name one incident and one role. Starting a practice
// search or joining another drill in another tab moves them, and every write from a command post still open for the
// first search is then refused. These lines say why, instead of a bare refusal.

import { onIdTokenChanged, type Auth } from "firebase/auth";

/** The open post: its incident, and whether it is a practice search (which has no join code to reopen it with). */
export type ClaimsContext = { incidentId: string; practice: boolean };

export const OTHER_SEARCH_LINE = "You're signed in to another search in this browser. Reopen this drill with its command code to act as command.";
export const OTHER_ROLE_LINE = "This browser is signed in to this drill in another role. Reopen it with its command code to act as command.";
export const NOT_SIGNED_IN_LINE = "This browser is no longer signed in to this drill. Reopen it with its command code to act as command.";
export const PRACTICE_LINE = "This browser is no longer signed in to this practice search. Open it again from the judge's page.";

/** Null while the sign-in (null when signed out) acts as command for the open post, else the line that says why not. */
export function claimsLine(claims: Record<string, unknown> | null, ctx: ClaimsContext): string | null {
  if (claims && claims["inc"] === ctx.incidentId && claims["role"] === "command") return null;
  if (ctx.practice) return PRACTICE_LINE;
  if (!claims || typeof claims["inc"] !== "string") return NOT_SIGNED_IN_LINE;
  return claims["inc"] !== ctx.incidentId ? OTHER_SEARCH_LINE : OTHER_ROLE_LINE;
}

/**
 * Calls `onLine` with claimsLine each time this browser's sign-in changes, in any tab (the SDK shares the signed-in
 * user across tabs); `recheck` asks the server for fresh claims, for after a refusal or when the tab is shown again.
 * A read that finishes after `stop` is dropped, so it never overwrites the next watch's line.
 */
export function watchClaims(auth: Auth, ctx: ClaimsContext, onLine: (line: string | null) => void): { stop: () => void; recheck: () => void } {
  let stopped = false;
  const read = (force: boolean) => {
    const user = auth.currentUser;
    if (!user) {
      onLine(claimsLine(null, ctx));
      return;
    }
    user.getIdTokenResult(force).then((r) => {
      if (!stopped) onLine(claimsLine(r.claims, ctx));
    }, () => {});
  };
  const unsubscribe = onIdTokenChanged(auth, () => {
    if (!stopped) read(false);
  });
  return {
    stop: () => {
      stopped = true;
      unsubscribe();
    },
    recheck: () => {
      if (!stopped) read(true);
    },
  };
}
