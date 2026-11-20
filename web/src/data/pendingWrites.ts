// Reports the server has not answered yet. Firestore keeps them in this browser and sends them when it can,
// but only while this page (or the next one opened in this browser) is running, so the post says so and asks
// before the page closes.

import type { WriteState } from "./events";

/** Ids of writes still waiting for the server: just sent ("pending") or being read back after an error ("checking"). */
export function unansweredIds(writes: Record<string, { state: WriteState }>): string[] {
  return Object.entries(writes)
    .filter(([, w]) => w.state === "pending" || w.state === "checking")
    .map(([id]) => id);
}

/**
 * What the post says about unanswered writes, and whether it asks before the page closes. `storedHere` holds the
 * ids Firestore already shows from this browser's own copy, which it raises only once the write is stored here.
 * Offline, a stored report is safe to close on (it sends the next time the post opens here), so the post says so
 * and does not ask; a person offline for a while would otherwise be asked on every close and learn to ignore it.
 */
export function writeNotice(unanswered: readonly string[], storedHere: ReadonlySet<string>, online: boolean): { line: string; ask: boolean } | null {
  const n = unanswered.length;
  if (n === 0) return null;
  if (!online && unanswered.every((id) => storedHere.has(id))) {
    return { line: n === 1 ? "Saved in this browser. It sends when you're back online." : `${n} reports saved in this browser. They send when you're back online.`, ask: false };
  }
  return { line: savingLine(n) ?? "", ask: true };
}

/** The line the post shows while reports are being saved, or null when there are none. */
export function savingLine(pending: number): string | null {
  if (pending === 0) return null;
  return pending === 1 ? "Saving one report. Keep this page open." : `Saving ${pending} reports. Keep this page open.`;
}

/**
 * While `active`, a close or reload of the page asks first (the browser shows its own question). Returns the
 * function that removes the guard.
 */
export function guardLeave(target: EventTarget, active: boolean): () => void {
  if (!active) return () => undefined;
  const ask = (e: Event) => {
    e.preventDefault();
    // Older browsers ask only when returnValue is set; only a real BeforeUnloadEvent lets it be set.
    if (typeof BeforeUnloadEvent !== "undefined" && e instanceof BeforeUnloadEvent) e.returnValue = "";
  };
  target.addEventListener("beforeunload", ask);
  return () => target.removeEventListener("beforeunload", ask);
}
