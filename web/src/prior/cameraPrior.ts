// Confirming a camera sighting rebuilds the ring prior in one batch with the incident's new
// start (the camera, when it was placed), the sighting added to the prior's inputs, and the
// direction-of-travel wedge on when the clip gives a bearing.

import type { EventDoc, PriorLayers, Terrain } from "@pls/engine";
import { buildCameraSighting, cameraStartPatch, type ClipFacts } from "../data/cameraSighting";
import { buildConfirmation, type CommandWriter } from "../data/sightings";
import type { SegmentDoc } from "../data/incident";
import type { LatLon } from "../map/geo";
import { priorWrites, rebuildPrior, type PriorWrites } from "./rebuild";

export type CameraPriorIncident = {
  gridId: string;
  gridAttribution?: string;
  ipp: LatLon;
  terrain?: Terrain;
  priorLayers?: PriorLayers;
  priorVersion: number;
  priorInputEventIds?: string[];
};

export function cameraPriorWrites(segments: readonly SegmentDoc[], incident: CameraPriorIncident, cam: EventDoc, bearingDeg: number | null): PriorWrites {
  const patch = cameraStartPatch(cam, incident);
  const ipp = patch.ipp ?? incident.ipp;
  const stored = incident.priorLayers ?? { linear: false, wedge: false };
  // The newest camera sighting decides the direction: with none, the wedge goes off (a stored
  // wedge with no bearing would make the rebuild refuse).
  const layers = { ...stored, wedge: bearingDeg !== null };
  const terrain = incident.terrain ?? "temperate_flat";
  const rebuilt = rebuildPrior(segments, { gridId: incident.gridId, attribution: incident.gridAttribution ?? "", ipp, terrain }, layers, bearingDeg);
  const w = priorWrites(rebuilt, incident, layers, terrain);
  return { ...w, incident: { ...w.incident, priorModel: "rings", ipp, priorInputEventIds: patch.priorInputEventIds } };
}

/**
 * Everything Confirm writes, built before any of it is written: the camera sighting, its
 * confirmation and the rebuilt prior. If any part cannot be built, it throws and nothing is written.
 */
export function cameraConfirmWrites(
  clip: ClipFacts,
  writers: [CommandWriter, CommandWriter],
  segments: readonly SegmentDoc[],
  incident: CameraPriorIncident,
  bearingDeg: number | null,
): { events: EventDoc[]; prior: PriorWrites } {
  const cam = buildCameraSighting(clip, writers[0]);
  const conf = buildConfirmation(cam, "confirmed", writers[1]);
  const prior = cameraPriorWrites(segments, incident, cam, bearingDeg);
  return { events: [cam, conf], prior };
}
