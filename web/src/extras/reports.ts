// How many reports a person would count: what teams, the family and cameras sent, each once. The match code covers
// every event (confirmations, retractions, plan acknowledgements too), so its event count is the wrong number to
// call "reports" on paper or over the radio.

const REPORT_TYPES: ReadonlySet<string> = new Set(["clue", "sighting", "camera_sighting", "cleared", "found", "destination"]);

type EventLike = { eventId: string } & Record<string, unknown>;

/**
 * The reports in `events`: report kinds only, each event id once, leaving out a report that was retracted and the
 * family's half of a sighting command placed (command's placement points at the family's report with targetEventId).
 */
export function reportsIn(events: readonly EventLike[]): number {
  const byId = new Map<string, EventLike>();
  for (const e of events) if (!byId.has(e.eventId)) byId.set(e.eventId, e);
  const gone = new Set<string>();
  for (const e of byId.values()) {
    const target = typeof e["targetEventId"] === "string" ? e["targetEventId"] : null;
    if (!target) continue;
    // A retraction removes its target; a command report that points at another report is that report, placed.
    if (e["type"] === "retraction") gone.add(target);
    else if (e["role"] === "command" && REPORT_TYPES.has(String(e["type"]))) gone.add(target);
  }
  let n = 0;
  for (const e of byId.values()) if (REPORT_TYPES.has(String(e["type"])) && !gone.has(e.eventId)) n += 1;
  return n;
}
