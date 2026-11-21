// The reports command can retract: every clue, sighting, camera sighting, cleared and found report, newest first.
// A retraction is a new event that points at the report; the report itself is never edited or deleted, so a retracted
// report stays in the list, struck through. Which retractions count is the map's own rule (toEngineEvents): one from
// command, or one from the report's own author; anyone else's changes nothing.

import type { EventDoc } from "@pls/engine";

const REPORT_TYPES: ReadonlySet<string> = new Set(["clue", "sighting", "camera_sighting", "cleared", "found"]);

export type ReportCard = {
  report: EventDoc;
  /** Who retracted it, by the map's rule: command first, else its own author. Null while it counts. */
  retractedBy: "command" | "author" | null;
  /** It set the current start point (a prior input): retracting it would not move the start. */
  startPoint: boolean;
};

export function reportCards(docs: readonly EventDoc[], priorInputEventIds: readonly string[]): ReportCard[] {
  const byId = new Map<string, EventDoc>();
  for (const d of docs) if (!byId.has(d.eventId)) byId.set(d.eventId, d);
  const byCommand = new Set<string>();
  const byAuthor = new Set<string>();
  // A family report command placed is shown once, as command's placement (which points at it).
  const placed = new Set<string>();
  for (const d of byId.values()) {
    if (!d.targetEventId) continue;
    const t = byId.get(d.targetEventId);
    if (d.type === "retraction" && t) {
      if (d.role === "command") byCommand.add(t.eventId);
      else if (d.authorUid === t.authorUid) byAuthor.add(t.eventId);
    } else if (d.role === "command" && REPORT_TYPES.has(d.type)) placed.add(d.targetEventId);
  }
  const inputs = new Set(priorInputEventIds);
  return [...byId.values()]
    .filter((d) => REPORT_TYPES.has(d.type) && !placed.has(d.eventId))
    .sort((a, b) => b.clientTimeMs - a.clientTimeMs || (a.eventId < b.eventId ? 1 : -1))
    .map((d) => ({
      report: d,
      retractedBy: byCommand.has(d.eventId) ? "command" : byAuthor.has(d.eventId) ? "author" : null,
      startPoint: inputs.has(d.eventId),
    }));
}
