// Small geometry for the command post: which segment a map click falls in,
// and the bearing from one segment centre to another (the engine uses it to
// decide which neighbours a reported direction points at).

import type { ContextSegment } from "@pls/engine";
import type { MapSegment } from "./poaStyle";

export type LatLon = { lat: number; lon: number };
export type GridSegmentDoc = MapSegment & { areaM2: number; neighbors: string[]; upstream: string[]; downstream: string[] };

/** Even-odd ray casting on one ring of [lon, lat] points. */
function inRing(p: LatLon, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(p: LatLon, rings: number[][][]): boolean {
  const [outer, ...holes] = rings;
  return outer !== undefined && inRing(p, outer) && !holes.some((h) => inRing(p, h));
}

export function segmentContaining(p: LatLon, segments: readonly MapSegment[]): string | null {
  for (const s of segments) {
    const polys = s.geometry.type === "Polygon" ? [s.geometry.coordinates] : s.geometry.coordinates;
    if (polys.some((rings) => inPolygon(p, rings))) return s.segmentId;
  }
  return null;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Initial great-circle bearing from a to b, in degrees clockwise from north, 0 to 360. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** The engine's effect context segments, built from the grid's segment docs. */
export function effectSegments(segments: readonly GridSegmentDoc[]): Record<string, ContextSegment> {
  const byId = new Map(segments.map((s) => [s.segmentId, s]));
  return Object.fromEntries(
    segments.map((s) => [
      s.segmentId,
      {
        areaM2: s.areaM2,
        neighbors: s.neighbors.flatMap((id) => {
          const n = byId.get(id);
          return n ? [{ segmentId: id, bearingDeg: bearingDeg(s.centroid, n.centroid) }] : [];
        }),
        upstream: s.upstream.filter((id) => byId.has(id)),
        downstream: s.downstream.filter((id) => byId.has(id)),
      },
    ]),
  );
}

/** Every segment by id with its centre: the keyboard way to place a sighting (the same point a map click there gives). */
export function segmentChoices(segments: readonly MapSegment[]): { segmentId: string; centre: LatLon }[] {
  return [...segments].sort((a, b) => a.segmentId.localeCompare(b.segmentId)).map((s) => ({ segmentId: s.segmentId, centre: { lat: s.centroid.lat, lon: s.centroid.lon } }));
}
