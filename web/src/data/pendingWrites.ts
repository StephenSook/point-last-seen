// Reports the server has not answered yet. Firestore keeps them in this browser and sends them when it can,
// but only while this page (or the next one opened in this browser) is running, so the post says so and asks
// before the page closes.

import type { WriteState } from "./events";

/** Writes still waiting for the server: just sent ("pending") or being read back after an error ("checking"). */
export function pendingCount(writes: Record<string, { state: WriteState }>): number {
  return Object.values(writes).filter((w) => w.state === "pending" || w.state === "checking").length;
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
