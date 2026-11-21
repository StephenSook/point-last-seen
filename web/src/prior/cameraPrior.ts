// Confirming a camera sighting rebuilds the ring prior in one batch with the incident's new
// start (the camera, when it was placed), the sighting added to the prior's inputs, and the
// direction-of-travel wedge on when the clip gives a bearing.

import { bearingFromExit, type EngineParams, type EventDoc, type PriorLayers, type Terrain } from "@pls/engine";
import { buildCameraSighting, cameraReading, cameraStartPatch, type ClipFacts } from "../data/cameraSighting";
import { buildConfirmation, type CommandWriter } from "../data/sightings";
import type { SegmentDoc } from "../data/incident";
import type { LatLon } from "../map/geo";
import { elevationDropNote, elevationDropReason, priorWrites, rebuildPrior, usableLayers, type PriorWrites } from "./rebuild";

export type CameraPriorIncident = {
  gridId: string;
  gridAttribution?: string;
  ipp: LatLon;
  terrain?: Terrain;
  priorLayers?: PriorLayers;
  priorVersion: number;
  priorInputEventIds?: string[];
  engineParams?: EngineParams;
  /** Each segment's elevation in metres (the site's elevation file); needed when the elevation layer is on. */
  elevationM?: Readonly<Record<string, number>>;
};

/** The prior a confirm writes, and, when it turned the elevation layer off, a line saying why (shown to command, not stored). */
export type CameraPriorWrites = PriorWrites & { layersNote?: string };

export function cameraPriorWrites(segments: readonly SegmentDoc[], incident: CameraPriorIncident, cam: EventDoc, bearingDeg: number | null): CameraPriorWrites {
  const patch = cameraStartPatch(cam, incident);
  const ipp = patch.ipp ?? incident.ipp;
  const stored = incident.priorLayers ?? { linear: false, wedge: false };
  // The newest camera sighting decides the direction: with none, the wedge goes off (a stored
  // wedge with no bearing would make the rebuild refuse).
  // The elevation layer measures from the new start; where it cannot, the rebuild drops it rather than refusing.
  const layers = usableLayers({ ...stored, wedge: bearingDeg !== null }, segments, ipp, incident.elevationM);
  const terrain = incident.terrain ?? "temperate_flat";
  const rebuilt = rebuildPrior(segments, { gridId: incident.gridId, attribution: incident.gridAttribution ?? "", ipp, terrain, elevationM: incident.elevationM, priorVersion: incident.priorVersion }, layers, bearingDeg, incident.engineParams);
  const w = priorWrites(rebuilt, incident, layers, terrain);
  const note = elevationDropNote(elevationDropReason({ ...stored, wedge: bearingDeg !== null }, segments, ipp, incident.elevationM));
  return {
    ...w, incident: { ...w.incident, priorModel: "rings", ipp, priorInputEventIds: patch.priorInputEventIds },
    ...(note ? { layersNote: note } : {}),
  };
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
): { events: EventDoc[]; prior: CameraPriorWrites } {
  const cam = buildCameraSighting(clip, writers[0]);
  const conf = buildConfirmation(cam, "confirmed", writers[1]);
  const prior = cameraPriorWrites(segments, incident, cam, bearingDeg);
  return { events: [cam, conf], prior };
}

/**
 * Confirming a camera clip the family app read. Its camera_sighting is already written (the family's own, which
 * cannot rebuild the prior), so command writes its confirmation and the camera prior in one batch: the start
 * point is the clip's camera place, or the one command picked when the family gave none; the direction comes
 * from the clip's camera facing and the side the person left by.
 */
export function familyCameraConfirmWrites(
  familyCam: EventDoc,
  placed: LatLon | null,
  writer: CommandWriter,
  segments: readonly SegmentDoc[],
  incident: CameraPriorIncident,
): { events: EventDoc[]; prior: CameraPriorWrites } {
  const reading = cameraReading(familyCam);
  if (!reading) throw new Error("This is not a camera clip reading.");
  const at = familyCam.position ?? (placed ? { lat: placed.lat, lon: placed.lon, accuracyM: null } : null);
  if (!at) throw new Error("Place the camera on the map first.");
  const bearing = bearingFromExit(reading.cameraFacingDeg, reading.sighting.exitEdge);
  const conf = buildConfirmation(familyCam, "confirmed", writer);
  const prior = cameraPriorWrites(segments, incident, { ...familyCam, position: at }, bearing);
  return { events: [conf], prior };
}
