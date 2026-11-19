// A drill site from an OpenStreetMap park relation: outer rings stitched from their ways, inner rings kept as holes,
// optionally clipped to a window [south, west, north, east] so the grid fits one prior batch.
import { area } from "@turf/area";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { featureCollection, polygon } from "@turf/helpers";
import { intersect } from "@turf/intersect";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";

interface OsmPoint { lat: number; lon: number }
interface OsmMember { type: string; role?: string; geometry?: OsmPoint[] }
interface OsmElement { type: string; id: number; tags?: Record<string, string>; members?: OsmMember[] }

const same = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/** Joins ways end to end into closed rings; throws when a ring cannot be closed. */
function stitch(ways: Position[][], what: string): Position[][] {
  const pool = ways.map(w => [...w]), rings: Position[][] = [];
  while (pool.length > 0) {
    const ring = pool.shift()!;
    while (!same(ring[0]!, ring[ring.length - 1]!)) {
      const i = pool.findIndex(w => same(w[0]!, ring[ring.length - 1]!) || same(w[w.length - 1]!, ring[ring.length - 1]!));
      if (i < 0) throw new Error(`${what}: a ring is not closed`);
      const w = pool.splice(i, 1)[0]!;
      ring.push(...(same(w[0]!, ring[ring.length - 1]!) ? w : [...w].reverse()).slice(1));
    }
    rings.push(ring);
  }
  return rings;
}

function largest(f: Feature<Polygon | MultiPolygon>): Position[][] {
  if (f.geometry.type === "Polygon") return f.geometry.coordinates;
  return [...f.geometry.coordinates].sort((a, b) => area(polygon(b)) - area(polygon(a)))[0]!;
}

export function siteFromOsm(osm: { elements: OsmElement[] }, relationId: number, window?: [number, number, number, number]): Feature<Polygon> {
  const rel = osm.elements.find(e => e.type === "relation" && e.id === relationId);
  if (!rel) throw new Error(`relation ${relationId} is not in the extract`);
  const ways = (role: string) => (rel.members ?? []).filter(m => m.type === "way" && (m.role || "outer") === role && m.geometry)
    .map(m => m.geometry!.map(p => [p.lon, p.lat] as Position));
  const what = `relation ${relationId}`;
  const outers = stitch(ways("outer"), what), inners = stitch(ways("inner"), what);
  // Each hole belongs to the outer ring that holds its first point; the park is its largest outer ring.
  const parts = outers.map(o => [o, ...inners.filter(h => booleanPointInPolygon(h[0]!, polygon([o])))]);
  let rings = [...parts].sort((a, b) => area(polygon(b)) - area(polygon(a)))[0]!;
  if (window) {
    const [s, w, n, e] = window;
    const box = polygon([[[w, s], [e, s], [e, n], [w, n], [w, s]]]);
    const clipped = intersect(featureCollection([polygon(rings), box]));
    if (!clipped) throw new Error(`${what}: the window ${JSON.stringify(window)} does not meet the park`);
    rings = largest(clipped);
  }
  const name = rel.tags?.name ?? `relation ${relationId}`;
  return { type: "Feature", properties: { name, source: `OpenStreetMap relation ${relationId} (ODbL)`, ...(window ? { window } : {}) },
    geometry: { type: "Polygon", coordinates: rings } };
}
