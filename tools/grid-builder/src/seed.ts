import { buildPrior, type Grid, type LatLon, type PriorLayers } from "@pls/engine";

type Terrain = Parameters<typeof buildPrior>[2];

export interface SegmentSeedDoc {
  segmentId: string;
  priorPoa: number;
  geometryJson: string;
  centroid: LatLon;
  areaM2: number;
  neighbors: string[];
  upstream: string[];
  downstream: string[];
  nearFrac: number;
  featureClasses: string[];
}
export interface RowSeedDoc { segmentId: "ROW"; priorPoa: number }

/**
 * The docs the apps read under incidents/{id}/segments: one per segment (geometry as a GeoJSON string, the
 * engine's prior) and ROW last with the mass outside the mapped area. The prior is the engine's own
 * buildPrior, so the seeded numbers are the numbers every client would compute.
 */
export function priorDocs(grid: Grid, ipp: LatLon, terrain: Terrain, layers: PriorLayers, travelBearingDeg: number | null):
  (SegmentSeedDoc | RowSeedDoc)[] {
  const prior = buildPrior(grid, ipp, terrain, layers, travelBearingDeg);
  const poa = new Map(prior.segments.map(p => [p.segmentId, p.priorPoa]));
  const docs: (SegmentSeedDoc | RowSeedDoc)[] = grid.segments.map(s => ({
    segmentId: s.segmentId, priorPoa: poa.get(s.segmentId) ?? 0, geometryJson: JSON.stringify(s.geometry),
    centroid: s.centroid, areaM2: s.areaM2, neighbors: s.neighbors, upstream: s.upstream, downstream: s.downstream,
    nearFrac: s.nearFrac, featureClasses: s.featureClasses,
  }));
  docs.push({ segmentId: "ROW", priorPoa: prior.row });
  return docs;
}
