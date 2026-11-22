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

/**
 * A point inside the segment: its centroid when that lies inside, else the middle of the widest stretch of the
 * segment along one of 15 lines of latitude across it. An irregular segment's centroid can fall outside it (EN and EQ
 * in the Kennesaw grid), and a sighting placed there would be stored outside the segment it was placed in.
 */
function insidePoint(s: MapSegment): LatLon {
  const c = { lat: s.centroid.lat, lon: s.centroid.lon };
  const polys = s.geometry.type === "Polygon" ? [s.geometry.coordinates] : s.geometry.coordinates;
  if (polys.some((rings) => inPolygon(c, rings))) return c;
  let best: { p: LatLon; width: number } | null = null;
  for (const rings of polys) {
    const lats = (rings[0] ?? []).map((pt) => pt[1] as number);
    if (lats.length === 0) continue;
    const lo = Math.min(...lats);
    const hi = Math.max(...lats);
    for (let k = 1; k < 16; k++) {
      const lat = lo + ((hi - lo) * k) / 16;
      // Where this line crosses every ring (holes too), in order: each pair bounds a stretch inside the segment.
      const xs: number[] = [];
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i] as [number, number];
          const [xj, yj] = ring[j] as [number, number];
          if (yi > lat !== yj > lat) xs.push(xi + ((lat - yi) * (xj - xi)) / (yj - yi));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const width = xs[i + 1]! - xs[i]!;
        const p = { lat, lon: (xs[i]! + xs[i + 1]!) / 2 };
        if (width > (best?.width ?? 0) && inPolygon(p, rings)) best = { p, width };
      }
    }
  }
  return best?.p ?? c;
}

/**
 * Every segment by id with a point inside it: the keyboard way to place a sighting. The point is the segment's centre
 * when that lies inside it, so it is where a map click on the label lands.
 */
export function segmentChoices(segments: readonly MapSegment[]): { segmentId: string; centre: LatLon }[] {
  return [...segments].sort((a, b) => a.segmentId.localeCompare(b.segmentId)).map((s) => ({ segmentId: s.segmentId, centre: insidePoint(s) }));
}

/** Great-circle distance in metres. */
export function metresBetween(a: LatLon, b: LatLon): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Metres from the report to each changed segment's centre, for the beat's nearest-first
 * order. A report with no position is measured from the largest move's centre.
 */
export function beatDistances(origin: LatLon | null, changedIds: readonly string[], segments: readonly MapSegment[]): Record<string, number> {
  const byId = new Map(segments.map((s) => [s.segmentId, s.centroid]));
  const from = origin ?? (changedIds[0] ? byId.get(changedIds[0]) : undefined);
  if (!from) return {};
  return Object.fromEntries(changedIds.flatMap((id) => {
    const c = byId.get(id);
    return c ? [[id, metresBetween(from, c)]] : [];
  }));
}
