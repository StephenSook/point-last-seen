// Confirming a sighting that has a place and a time makes it the new last known point, as a confirmed camera
// sighting is: one batch writes command's confirmation and the ring prior rebuilt from the sighting's place, with
// the direction-of-travel wedge on when the sighting says which way the person went. The sighting joins the
// prior's inputs, so the engine never applies it again as a clue. A sighting with no place stays a clue.

import type { EventDoc } from "@pls/engine";
import { readingBearingDeg } from "../data/direction";
import { buildConfirmation, type CommandWriter } from "../data/sightings";
import type { SegmentDoc } from "../data/incident";
import { cameraPriorWrites, type CameraPriorIncident } from "./cameraPrior";
import type { PriorWrites } from "./rebuild";

/** The compass bearing the sighting says the person went, or null (no direction, or upstream or downstream). */
export function sightingBearingDeg(s: EventDoc): number | null {
  return readingBearingDeg(s);
}

/** Whether command confirming this sighting should rebuild the prior from it: a place, a time seen, not yet an input. */
export function sightingNewLkp(s: EventDoc, priorInputEventIds: readonly string[]): boolean {
  return s.type === "sighting" && s.position !== null && Number.isFinite(s.observedAtMs ?? Number.NaN)
    && !priorInputEventIds.includes(s.eventId);
}

/**
 * Everything command's Confirm writes for a sighting with a place, built before any of it is written: the
 * confirmation and the rebuilt prior. If it cannot be built, it throws and nothing is written.
 */
export function sightingConfirmWrites(
  sighting: EventDoc,
  writer: CommandWriter,
  segments: readonly SegmentDoc[],
  incident: CameraPriorIncident,
): { events: EventDoc[]; prior: PriorWrites } {
  if (!sightingNewLkp(sighting, incident.priorInputEventIds ?? [])) {
    throw new Error("This sighting has no place or time on the map, so it cannot be the new last known point.");
  }
  const conf = buildConfirmation(sighting, "confirmed", writer);
  const prior = cameraPriorWrites(segments, incident, sighting, sightingBearingDeg(sighting));
  return { events: [conf], prior };
}
