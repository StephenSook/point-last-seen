import { along } from "@turf/along";
import { bbox } from "@turf/bbox";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { lineString, polygon } from "@turf/helpers";
import { length } from "@turf/length";
import type { Grid } from "@pls/engine";
import type { Feature, LineString } from "geojson";

const STEP_M = 10;

/**
 * Fills downstream and upstream from OSM waterways, whose way direction is the flow direction: walk each
 * stream every 10 m, list the segments it passes in order, and link each to the next one.
 */
export function applyStreams(grid: Grid, streams: Feature<LineString>[]): Grid {
  const cells = grid.segments.map(s => ({ id: s.segmentId, poly: polygon(s.geometry.coordinates), box: bbox(polygon(s.geometry.coordinates)) }));
  const down = new Map<string, Set<string>>(), up = new Map<string, Set<string>>();
  for (const s of grid.segments) { down.set(s.segmentId, new Set()); up.set(s.segmentId, new Set()); }
  for (const f of streams) {
    if (f.geometry.coordinates.length < 2) continue;
    const ls = lineString(f.geometry.coordinates);
    const total = length(ls, { units: "meters" });
    const path: string[] = [];
    for (let d = 0; d <= total; d += STEP_M) {
      const p = along(ls, d, { units: "meters" });
      const [lon, lat] = p.geometry.coordinates as [number, number];
      const hit = cells.find(c => lon >= c.box[0] && lon <= c.box[2] && lat >= c.box[1] && lat <= c.box[3]
        && booleanPointInPolygon(p, c.poly));
      if (hit && path[path.length - 1] !== hit.id) path.push(hit.id);
    }
    for (let i = 0; i + 1 < path.length; i++) {
      if (path[i] === path[i + 1]) continue;
      down.get(path[i]!)!.add(path[i + 1]!);
      up.get(path[i + 1]!)!.add(path[i]!);
    }
  }
  return { ...grid, segments: grid.segments.map(s => ({
    ...s, downstream: [...down.get(s.segmentId)!].sort(), upstream: [...up.get(s.segmentId)!].sort(),
  })) };
}
