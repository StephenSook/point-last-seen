// Confirming a sighting that has a place and a time makes it the new last known point, as a confirmed camera
// sighting is: one batch writes command's confirmation and the ring prior rebuilt from the sighting's place, with
// the direction-of-travel wedge on when the sighting says which way the person went. The sighting joins the
// prior's inputs, so the engine never applies it again as a clue. A sighting with no place stays a clue, and so
// does one seen no later than the map's newest input: command confirms in the order reports are reviewed, not
// the order they were seen, and an older sighting must not move the start back.

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

const placedAndTimed = (s: EventDoc): s is EventDoc & { observedAtMs: number } =>
  s.type === "sighting" && s.position !== null && Number.isFinite(s.observedAtMs ?? Number.NaN);

/** The time seen of each prior input (a sighting's or a camera's), or null when one is not loaded or has none. */
function inputSeenTimes(events: readonly EventDoc[], priorInputEventIds: readonly string[]): number[] | null {
  const byId = new Map(events.map((e) => [e.eventId, e]));
  const times: number[] = [];
  for (const id of priorInputEventIds) {
    const t = byId.get(id)?.observedAtMs;
    if (typeof t !== "number" || !Number.isFinite(t)) return null;
    times.push(t);
  }
  return times;
}

/**
 * Whether command confirming this sighting should rebuild the prior from it: a place, a time seen later than every
 * prior input's, and not yet an input. Throws while an input is not loaded, so nothing is decided on a partial list.
 */
export function sightingNewLkp(s: EventDoc, priorInputEventIds: readonly string[], events: readonly EventDoc[]): boolean {
  if (!placedAndTimed(s) || priorInputEventIds.includes(s.eventId)) return false;
  const times = inputSeenTimes(events, priorInputEventIds);
  if (times === null) throw new Error("The map's last known point is still loading. Try again.");
  return times.every((t) => s.observedAtMs > t);
}

/** A sighting with a place and a time that was not seen after the map's newest input, so confirming it keeps it a clue. */
export function sightingSeenBeforeStart(s: EventDoc, priorInputEventIds: readonly string[], events: readonly EventDoc[]): boolean {
  if (!placedAndTimed(s) || priorInputEventIds.includes(s.eventId)) return false;
  const times = inputSeenTimes(events, priorInputEventIds);
  return times !== null && times.some((t) => s.observedAtMs <= t);
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
  events: readonly EventDoc[],
): { events: EventDoc[]; prior: PriorWrites } {
  const inputs = incident.priorInputEventIds ?? [];
  if (sightingSeenBeforeStart(sighting, inputs, events)) {
    throw new Error("This sighting was not seen after the current last known point, so it cannot replace it.");
  }
  if (!sightingNewLkp(sighting, inputs, events)) {
    throw new Error("This sighting has no place or time on the map, so it cannot be the new last known point.");
  }
  const conf = buildConfirmation(sighting, "confirmed", writer);
  const prior = cameraPriorWrites(segments, incident, sighting, sightingBearingDeg(sighting));
  return { events: [conf], prior };
}
