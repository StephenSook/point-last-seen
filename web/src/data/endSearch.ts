// Command ends a search: the incident closes with a reason, every seat shows it ended, and the rules take no new
// reports, plans or edits. Closing is final.

import { doc, updateDoc, type Firestore } from "firebase/firestore";

export type EndReason = "found" | "suspended" | "training_ended";

/** The reasons command can give, in the order the confirm offers them; the rules accept exactly these. */
export const END_REASONS: readonly { value: EndReason; label: string }[] = [
  { value: "found", label: "Person found" },
  { value: "suspended", label: "Search suspended" },
  { value: "training_ended", label: "Training ended" },
];

export function endSearchPatch(reason: EndReason): { status: "closed"; closedReason: EndReason } {
  return { status: "closed", closedReason: reason };
}

/**
 * The line every seat shows once the search has ended; null while it is open. `serverHasIt` is false while the close
 * is only this browser's pending write (Firestore shows it to the listener at once), so the post never says ended
 * before the server has accepted it.
 */
export function endedLine(status: string | undefined, reason: unknown, serverHasIt = true): string | null {
  if (status !== "closed" || !serverHasIt) return null;
  const label = END_REASONS.find((r) => r.value === reason)?.label;
  return label ? `Search ended: ${label.toLowerCase()}. No new reports are taken.` : "Search ended. No new reports are taken.";
}

/** Resolves when the server has the close (offline, it waits for the link). */
export function endSearch(db: Firestore, incidentId: string, reason: EndReason): Promise<void> {
  return updateDoc(doc(db, "incidents", incidentId), endSearchPatch(reason));
}

/** The incident status the server last confirmed: a snapshot holding this browser's pending write leaves it as it was. */
export function confirmedStatus(prev: string | undefined, status: string | undefined, pending: boolean): string | undefined {
  return pending ? prev : status;
}
