// Confirming a camera sighting rebuilds the ring prior in one batch with the incident's new
// start (the camera, when it was placed), the sighting added to the prior's inputs, and the
// direction-of-travel wedge on when the clip gives a bearing.

import type { EventDoc, PriorLayers, Terrain } from "@pls/engine";
import { cameraStartPatch } from "../data/cameraSighting";
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
  const layers = bearingDeg === null ? stored : { ...stored, wedge: true };
  const terrain = incident.terrain ?? "temperate_flat";
  const rebuilt = rebuildPrior(segments, { gridId: incident.gridId, attribution: incident.gridAttribution ?? "", ipp, terrain }, layers, bearingDeg);
  const w = priorWrites(rebuilt, incident, layers, terrain);
  return { ...w, incident: { ...w.incident, priorModel: "rings", ipp, priorInputEventIds: patch.priorInputEventIds } };
}
