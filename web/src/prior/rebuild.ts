// Rebuilding the prior at the command post when a person switches a layer or the
// terrain column: the stored segments become the engine's grid again, buildPrior
// (the same function the grid tools seeded the incident with) gives the new prior,
// and the writes raise the prior version so every seat's match code changes.

import { buildPrior, DEFAULT_PARAMS, type EngineParams, type Grid, type PriorLayers, type SegmentElevations, type SegmentPrior, type Terrain } from "@pls/engine";
import type { SegmentDoc } from "../data/incident";
import { segmentContaining } from "../map/geo";

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

/**
 * The elevation layer's input for a rebuild: each segment's elevation (the site's elevation file) and the elevation of
 * the segment the start point is in, so a rebuild from a new last known point measures from that point.
 */
export function segmentElevations(segments: readonly SegmentDoc[], ipp: { lat: number; lon: number },
  elevationM: Readonly<Record<string, number>> | undefined): SegmentElevations {
  if (!elevationM) throw new Error("The elevation layer needs this site's elevation file.");
  const start = segmentContaining(ipp, segments);
  const startM = start === null ? undefined : elevationM[start];
  if (startM === undefined) throw new Error("The elevation layer needs the start point inside a mapped segment that has an elevation.");
  return { startM, bySegment: elevationM };
}

/**
 * The layers a rebuild can use here: the elevation layer stays on only when this site's elevations are loaded and the
 * start point is inside a segment that has one. A confirmation that moves the start outside the mapped area, or one
 * made while the file is missing, rebuilds with the layer off (and saves it off) rather than being refused.
 */
export function usableLayers(layers: PriorLayers, segments: readonly SegmentDoc[], ipp: { lat: number; lon: number },
  elevationM: Readonly<Record<string, number>> | undefined): PriorLayers {
  if (!layers.elevation) return layers;
  const start = elevationM ? segmentContaining(ipp, segments) : null;
  return start !== null && elevationM?.[start] !== undefined ? layers : { ...layers, elevation: false };
}

/**
 * Whether the segments on hand are the whole current grid, checked before any rebuild or walker run writes a prior.
 * Segments arrive through their own listener: before they load, a rebuild would save every mass outside the grid. A
 * snapshot can also hold only some (a cached one, or one with an unreadable document dropped); the grid is closed, so
 * a neighbour, upstream or downstream name with no segment is a missing segment. And every prior write stamps its
 * version on every segment, so a segment older than the incident's version is from an older grid (a cached snapshot
 * after a reseed). A newer one is allowed: a copy taken mid-rebuild must not leave an incident that can never rebuild.
 */
export function assertCurrentGrid(segments: readonly SegmentDoc[], priorVersion?: number): void {
  if (segments.length === 0) throw new Error("The map's segments have not loaded yet.");
  const have = new Set(segments.map((s) => s.segmentId));
  if (segments.some((s) => [...s.neighbors, ...s.upstream, ...s.downstream].some((id) => !have.has(id)))) {
    throw new Error("The map's segments have not all loaded yet.");
  }
  if (priorVersion !== undefined && segments.some((s) => s.priorVersion === undefined || s.priorVersion < priorVersion)) {
    throw new Error("The map's segments have not all loaded yet.");
  }
}

export function rebuildPrior(
  segments: readonly SegmentDoc[],
  site: {
    gridId: string; attribution: string; ipp: { lat: number; lon: number }; terrain: Terrain;
    /** Each segment's elevation in metres, from the site's elevation file; needed only by the elevation layer. */
    elevationM?: Readonly<Record<string, number>>;
    /** The incident's prior version: every segment must carry it, or the grid on hand is an older one. */
    priorVersion?: number;
  },
  layers: PriorLayers,
  travelBearingDeg: number | null,
  /** The incident's engine parameters (its ring radii and layer weights); the defaults only when it has none. */
  params: EngineParams = DEFAULT_PARAMS,
): RebuiltPrior {
  if (layers.wedge && travelBearingDeg === null) throw new Error("The wedge needs a confirmed direction of travel.");
  assertCurrentGrid(segments, site.priorVersion);
  const grid = gridFromDocs(segments, site.gridId, site.attribution);
  const elevations = layers.elevation ? segmentElevations(segments, site.ipp, site.elevationM) : undefined;
  const prior = buildPrior(grid, site.ipp, site.terrain, layers, travelBearingDeg, params, elevations);
  // The ring prior is stored beside it as the baseline (spec 10.5); it depends on the terrain only.
  const ring = buildPrior(grid, site.ipp, site.terrain, { linear: false, wedge: false }, null, params);
  return { segments: prior.segments, row: prior.row, ring: ring.segments };
}

export type PriorWrites = {
  segments: { segmentId: string; data: { priorPoa: number; ringPoa: number; priorVersion: number } }[];
  row: { priorPoa: number; priorVersion: number };
  incident: { priorLayers: PriorLayers; terrain: Terrain; priorVersion: number; priorModel?: "rings"; ipp?: { lat: number; lon: number }; priorInputEventIds?: string[] };
};

export function priorWrites(r: RebuiltPrior, incident: { priorVersion: number }, layers: PriorLayers, terrain: Terrain): PriorWrites {
  const priorVersion = incident.priorVersion + 1;
  const ring = new Map(r.ring.map((s) => [s.segmentId, s.priorPoa]));
  return {
    segments: r.segments.map((s) => ({ segmentId: s.segmentId, data: { priorPoa: s.priorPoa, ringPoa: ring.get(s.segmentId) ?? 0, priorVersion } })),
    row: { priorPoa: r.row, priorVersion },
    // Ring probabilities: the stored model says so, whichever model was on before.
    incident: { priorLayers: { ...layers }, terrain, priorVersion, priorModel: "rings" },
  };
}
