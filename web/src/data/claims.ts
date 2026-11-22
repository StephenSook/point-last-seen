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
 * user across tabs); `recheck` asks the server for fresh claims, for when the tab is shown or focused again or after
 * a refusal. The newest token decides the line, by when it was issued, for the account signed in now: a token issued
 * before the newest one applied is ignored even when its read comes last (a refresh that started before another window
 * moved this account to another search), a newer one applies even if a later read started first, a token for an account
 * no longer signed in is dropped, and another account starts again. Each sign-in is its own session: a reply from a read
 * started before a sign-out is dropped even when the same account signs in again. A reply with no readable issue time
 * applies only from the newest read, and while the line comes from such a reply, a timed reply applies only if its read
 * started later and its token was issued after the newest token applied. Nothing is applied after `stop`. A forced read runs at most once in 30 seconds and not while another is running, except that an urgent
 * recheck (after a refusal) skips the spacing, and one that comes while a forced read runs waits for it and then runs.
 * A forced read still running after 30 seconds is treated as stalled and no longer holds the next one back.
 */
export function watchClaims(auth: Auth, ctx: ClaimsContext, onLine: (line: string | null) => void, now: () => number = Date.now): { stop: () => void; recheck: (urgent?: boolean) => void } {
  const SPACING_MS = 30_000;
  let stopped = false;
  let latest = 0;
  // The forced read in flight (its number, 0 when none), when the last one started, and an urgent recheck waiting.
  let forcing = 0;
  let lastForced = -Infinity;
  let queued = false;
  // When the newest token this watch applied was issued (ms), and for which account, so an older token can never take
  // its place; another account starts again.
  let newestIssued = -Infinity;
  let newestSeq = 0;
  // Whether the line now shown came from a reply with no readable issue time, so only read order can rank it.
  let newestUntimed = false;
  let owner: string | null | undefined = null;
  // Counts sign-in sessions: a sign-out or another account starts a new one, and a reply from an older one is dropped.
  let session = 0;
  const settled = (seq: number) => {
    if (forcing !== seq) return;
    forcing = 0;
    if (queued && !stopped) {
      queued = false;
      read(true);
    }
  };
  const read = (force: boolean) => {
    const seq = ++latest;
    const user = auth.currentUser;
    if (!user) {
      newestIssued = -Infinity;
      newestSeq = 0;
      newestUntimed = false;
      owner = null;
      session++;
      onLine(claimsLine(null, ctx));
      return;
    }
    if (user.uid !== owner) {
      owner = user.uid;
      newestIssued = -Infinity;
      newestSeq = 0;
      newestUntimed = false;
      session++;
    }
    const readSession = session;
    if (force) {
      forcing = seq;
      lastForced = now();
    }
    user.getIdTokenResult(force).then(
      (r) => {
        const issued = Date.parse(r.issuedAtTime ?? "");
        const signedIn = auth.currentUser?.uid === user.uid && readSession === session;
        // A token issued later wins whatever order the reads finish in; within the same second (the issue time's
        // resolution) the newer read does. While the line comes from a reply with no readable issue time, a timed
        // reply must also come from a later read.
        const timed = Number.isFinite(issued);
        const laterToken = issued > newestIssued || (issued === newestIssued && seq > newestSeq);
        const newest = !timed ? seq === latest : laterToken && (!newestUntimed || seq > newestSeq);
        if (!stopped && signedIn && newest) {
          if (timed) newestIssued = issued;
          newestUntimed = !timed;
          newestSeq = seq;
          onLine(claimsLine(r.claims, ctx));
        }
        if (force) settled(seq);
      },
      () => {
        if (force) settled(seq);
      },
    );
  };
  const unsubscribe = onIdTokenChanged(auth, () => {
    if (!stopped) read(false);
  });
  return {
    stop: () => {
      stopped = true;
      unsubscribe();
    },
    recheck: (urgent = false) => {
      if (stopped) return;
      const since = now() - lastForced;
      if (forcing !== 0 && since < SPACING_MS) {
        if (urgent) queued = true;
        return;
      }
      if (!urgent && since < SPACING_MS) return;
      read(true);
    },
  };
}
