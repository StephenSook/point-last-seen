import { area } from "@turf/area";
import { bbox } from "@turf/bbox";
import { centroid } from "@turf/centroid";
import { featureCollection, polygon } from "@turf/helpers";
import { intersect } from "@turf/intersect";
import type { Grid, GridSegment } from "@pls/engine";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";

export const CELL_M = 125;
const M_PER_DEG = (6371008.8 * Math.PI) / 180;
const MIN_AREA_M2 = 1;
export const ATTRIBUTION = "Map data from OpenStreetMap contributors (ODbL)";

/** Two-letter ids in row-major order: AA, AB, ... AZ, BA, ... (676 cells at most). */
export function segmentIdFor(index: number): string {
  if (index < 0 || index >= 26 * 26) throw new Error(`segment index ${index} needs more than two letters`);
  return String.fromCharCode(65 + Math.floor(index / 26)) + String.fromCharCode(65 + (index % 26));
}

function largestPolygon(f: Feature<Polygon | MultiPolygon>): Position[][] {
  if (f.geometry.type === "Polygon") return f.geometry.coordinates;
  return f.geometry.coordinates
    .map(c => ({ c, a: area(polygon(c)) }))
    .sort((x, y) => y.a - x.a)[0]!.c;
}

/**
 * 125 m cells over the site's bounding box, rows north to south, clipped to the site (spec section 10.5).
 * Empty or sliver cells (under 1 m2) are dropped before ids are given, so ids stay contiguous. A cell that
 * clips into several parts keeps its largest part.
 */
export function buildCells(site: Feature<Polygon>, gridId: string, cellM = CELL_M): Grid {
  const [minLon, minLat, maxLon, maxLat] = bbox(site) as [number, number, number, number];
  const midLat = (minLat + maxLat) / 2;
  const degLat = cellM / M_PER_DEG;
  const degLon = cellM / (M_PER_DEG * Math.cos((midLat * Math.PI) / 180));
  const nx = Math.ceil((maxLon - minLon) / degLon - 1e-3);
  const ny = Math.ceil((maxLat - minLat) / degLat - 1e-3);
  const kept: { r: number; c: number; coords: Position[][]; areaM2: number }[] = [];
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const lon0 = minLon + c * degLon, lon1 = lon0 + degLon;
      const lat1 = maxLat - r * degLat, lat0 = lat1 - degLat;
      const cell = polygon([[[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]]);
      const clipped = intersect(featureCollection([cell, site]));
      if (!clipped) continue;
      const coords = largestPolygon(clipped);
      const a = area(polygon(coords));
      if (a >= MIN_AREA_M2) kept.push({ r, c, coords, areaM2: a });
    }
  }
  const idAt = new Map<string, string>();
  kept.forEach((k, i) => idAt.set(`${k.r},${k.c}`, segmentIdFor(i)));
  const segments: GridSegment[] = kept.map(k => {
    const [lon, lat] = centroid(polygon(k.coords)).geometry.coordinates as [number, number];
    const neighbors = [[k.r - 1, k.c], [k.r + 1, k.c], [k.r, k.c - 1], [k.r, k.c + 1]]
      .map(([r, c]) => idAt.get(`${r},${c}`))
      .filter((id): id is string => id !== undefined);
    return {
      segmentId: idAt.get(`${k.r},${k.c}`)!, areaM2: k.areaM2, centroid: { lat, lon },
      geometry: { type: "Polygon", coordinates: k.coords as [number, number][][] },
      neighbors, downstream: [], upstream: [], nearFrac: 0, featureClasses: [],
    };
  });
  return { gridId, cellM: 125, bbox: [minLon, minLat, maxLon, maxLat], segments, attribution: ATTRIBUTION };
}
