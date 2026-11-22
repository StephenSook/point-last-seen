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
 * A point that the Place list and a map click both read as this segment: its centroid when that resolves to it among
 * all segments, else the middle of the widest stretch of the segment along one of a set of lines of latitude across it
 * that resolves to it. An irregular segment's centroid can fall outside it (EN and EQ in the Kennesaw grid) or on an
 * edge a neighbour claims first, and a sighting placed there would be stored in the wrong place.
 */
export function insidePoint(s: MapSegment, all: readonly MapSegment[]): LatLon {
  const own = (p: LatLon) => segmentContaining(p, all) === s.segmentId;
  const c = { lat: s.centroid.lat, lon: s.centroid.lon };
  if (own(c)) return c;
  const polys = s.geometry.type === "Polygon" ? [s.geometry.coordinates] : s.geometry.coordinates;
  // 15 lines first, then 63 for a thin segment; the 0.37 offset keeps the lines off the round latitudes vertices sit on.
  for (const lines of [15, 63]) {
    let best: { p: LatLon; width: number } | null = null;
    for (const rings of polys) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const pt of rings[0] ?? []) {
        lo = Math.min(lo, pt[1] as number);
        hi = Math.max(hi, pt[1] as number);
      }
      if (!(hi > lo)) continue;
      for (let k = 0; k < lines; k++) {
        const lat = lo + ((hi - lo) * (k + 0.37 + 0.13 * (k % 2))) / lines;
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
          if (width > (best?.width ?? 0) && own(p)) best = { p, width };
        }
      }
    }
    if (best) return best.p;
  }
  return c;
}

/**
 * Every segment by id with a point inside it (insidePoint): the keyboard way to place a sighting. The point is the
 * segment's centre whenever that resolves to it, so it is where a map click on the centre dot lands.
 */
export function segmentChoices(segments: readonly MapSegment[]): { segmentId: string; centre: LatLon }[] {
  return [...segments].sort((a, b) => a.segmentId.localeCompare(b.segmentId)).map((s) => ({ segmentId: s.segmentId, centre: insidePoint(s, segments) }));
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
