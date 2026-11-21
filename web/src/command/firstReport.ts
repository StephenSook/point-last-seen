// The practice search's one-click first report: a made-up sighting that command saves and confirms through the same
// write and the same confirmation as any report, so a first visit sees the map move. It is offered on a practice
// search until command has confirmed or rejected any report there.
//
// The place: segment CD, near the practice grid's south edge, about 370 m south of the seed's last known point. A
// local simulation on the seed drill (every segment tried as the confirmed place, through sightingConfirmWrites and
// viewState) found confirming at CD changes all three of the top three (BO, BP, BH to CC, CD, CE).

import type { EventDoc } from "@pls/engine";
import { isPracticeIncident } from "./connecting";
import type { SightingInput } from "../data/sightings";

export const FIRST_REPORT_SEGMENT = "CD";
export const FIRST_REPORT_LINE = "A park worker saw a man in a blue coat at the south end of the park, in segment CD, 10 minutes ago.";

export function offerFirstReport(incidentId: string, events: readonly EventDoc[]): boolean {
  return isPracticeIncident(incidentId) && !events.some((e) => e.type === "confirmation");
}

/** The report as the sighting form would save it, or null where the grid has no segment CD. */
export function firstReportInput(segments: readonly { segmentId: string; centroid: { lat: number; lon: number } }[], nowMs: number): SightingInput | null {
  const cd = segments.find((s) => s.segmentId === FIRST_REPORT_SEGMENT);
  if (!cd) return null;
  return {
    observedAtMs: nowMs - 10 * 60_000,
    position: { lat: cd.centroid.lat, lon: cd.centroid.lon },
    direction: "unknown",
    topColor: "blue",
    bottomColor: "unknown",
    footwear: "",
    carried: "",
    reportedBy: "staff",
    freeText: "Training drill inject. A man in a blue coat at the south end of the park, 10 minutes ago.",
  };
}
