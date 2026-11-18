// Rebuilding the prior at the command post when a person switches a layer or the
// terrain column: the stored segments become the engine's grid again, buildPrior
// (the same function the grid tools seeded the incident with) gives the new prior,
// and the writes raise the prior version so every seat's match code changes.

import { buildPrior, DEFAULT_PARAMS, type Grid, type PriorLayers, type SegmentPrior, type Terrain } from "@pls/engine";
import type { SegmentDoc } from "../data/incident";

export function gridFromDocs(segments: readonly SegmentDoc[], gridId: string, attribution: string): Grid {
  return {
    gridId,
    cellM: 125,
    bbox: [0, 0, 0, 0],
    attribution,
    segments: segments.map((s) => ({
      segmentId: s.segmentId,
      areaM2: s.areaM2,
      centroid: { lat: s.centroid.lat, lon: s.centroid.lon },
      // The grid builder keeps one polygon per cell; a multipolygon keeps its first part.
      geometry: { type: "Polygon", coordinates: (s.geometry.type === "Polygon" ? s.geometry.coordinates : s.geometry.coordinates[0]!) as [number, number][][] },
      neighbors: [...s.neighbors],
      downstream: [...s.downstream],
      upstream: [...s.upstream],
      nearFrac: s.nearFrac ?? 0,
      featureClasses: [...(s.featureClasses ?? [])],
    })),
  };
}

export type RebuiltPrior = { segments: SegmentPrior[]; row: number; ring: SegmentPrior[] };

export function rebuildPrior(
  segments: readonly SegmentDoc[],
  site: { gridId: string; attribution: string; ipp: { lat: number; lon: number }; terrain: Terrain },
  layers: PriorLayers,
  travelBearingDeg: number | null,
): RebuiltPrior {
  if (layers.wedge && travelBearingDeg === null) throw new Error("The wedge needs a confirmed direction of travel.");
  const grid = gridFromDocs(segments, site.gridId, site.attribution);
  const prior = buildPrior(grid, site.ipp, site.terrain, layers, travelBearingDeg, DEFAULT_PARAMS);
  // The ring prior is stored beside it as the baseline (spec 10.5); it depends on the terrain only.
  const ring = buildPrior(grid, site.ipp, site.terrain, { linear: false, wedge: false }, null, DEFAULT_PARAMS);
  return { segments: prior.segments, row: prior.row, ring: ring.segments };
}

export type PriorWrites = {
  segments: { segmentId: string; data: { priorPoa: number; ringPoa: number; priorVersion: number } }[];
  row: { priorPoa: number; priorVersion: number };
  incident: { priorLayers: PriorLayers; terrain: Terrain; priorVersion: number };
};

export function priorWrites(r: RebuiltPrior, incident: { priorVersion: number }, layers: PriorLayers, terrain: Terrain): PriorWrites {
  const priorVersion = incident.priorVersion + 1;
  const ring = new Map(r.ring.map((s) => [s.segmentId, s.priorPoa]));
  return {
    segments: r.segments.map((s) => ({ segmentId: s.segmentId, data: { priorPoa: s.priorPoa, ringPoa: ring.get(s.segmentId) ?? 0, priorVersion } })),
    row: { priorPoa: r.row, priorVersion },
    incident: { priorLayers: { ...layers }, terrain, priorVersion },
  };
}
