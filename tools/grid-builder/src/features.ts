import { bbox } from "@turf/bbox";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { lineString, point, polygon } from "@turf/helpers";
import { pointToLineDistance } from "@turf/point-to-line-distance";
import type { Grid, GridSegment } from "@pls/engine";
import type { Feature, Geometry, Position } from "geojson";

export type FeatureClass = GridSegment["featureClasses"][number];
export const NEAR_FEATURE_M = 71;
const SAMPLES_PER_SIDE = 20;
const M_PER_DEG = (6371008.8 * Math.PI) / 180;
/** Classes that count toward nearFrac (ISRID track offset: roads, trails, streams and water edges). */
const NEAR_CLASSES = new Set<FeatureClass>(["road", "trail", "stream", "water"]);

const ROADS = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "service",
  "living_street", "road", "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"]);
const TRAILS = new Set(["path", "footway", "track", "bridleway", "cycleway", "steps", "pedestrian"]);
const STREAMS = new Set(["stream", "river", "brook", "ditch", "drain", "canal"]);

/** The grid class of an OSM element from its tags, or null when it is none of them. */
export function classifyOsm(tags: Record<string, string>): FeatureClass | null {
  if (tags.highway && ROADS.has(tags.highway)) return "road";
  if (tags.highway && TRAILS.has(tags.highway)) return "trail";
  if (tags.waterway && STREAMS.has(tags.waterway)) return "stream";
  if (tags.natural === "water" || tags.water !== undefined || tags.waterway === "riverbank") return "water";
  if (tags.building !== undefined) return "structure";
  return null;
}

type Shape = { cls: FeatureClass; lines: Position[][]; areas: Position[][][]; box: [number, number, number, number] };

function shapeOf(f: Feature<Geometry>): Shape | null {
  const cls = (f.properties?.class ?? null) as FeatureClass | null;
  if (!cls) return null;
  const g = f.geometry;
  const lines: Position[][] = [], areas: Position[][][] = [];
  if (g.type === "LineString") lines.push(g.coordinates);
  else if (g.type === "MultiLineString") lines.push(...g.coordinates);
  else if (g.type === "Polygon") { areas.push(g.coordinates); lines.push(...g.coordinates); }
  else if (g.type === "MultiPolygon") for (const p of g.coordinates) { areas.push(p); lines.push(...p); }
  else return null;
  return { cls, lines, areas, box: bbox(f) as [number, number, number, number] };
}

function within(shape: Shape, lon: number, lat: number, m: number): boolean {
  const pt = point([lon, lat]);
  if (shape.areas.some(a => booleanPointInPolygon(pt, polygon(a)))) return true;
  return shape.lines.some(l => l.length >= 2 && pointToLineDistance(pt, lineString(l), { units: "meters" }) <= m);
}

/**
 * Sets each segment's nearFrac (share of its area within 71 m of a road, trail, stream or water edge, from a
 * 20 x 20 sample grid) and featureClasses (every class within 71 m, structures included). Features carry
 * `properties.class`.
 */
export function applyFeatures(grid: Grid, features: Feature<Geometry>[], bufferM = NEAR_FEATURE_M): Grid {
  const shapes = features.map(shapeOf).filter((s): s is Shape => s !== null);
  const segments = grid.segments.map(seg => {
    const ring = seg.geometry.coordinates;
    const poly = polygon(ring);
    const [minLon, minLat, maxLon, maxLat] = bbox(poly) as [number, number, number, number];
    const padLat = bufferM / M_PER_DEG;
    const padLon = bufferM / (M_PER_DEG * Math.cos((seg.centroid.lat * Math.PI) / 180));
    const nearby = shapes.filter(s => s.box[0] <= maxLon + padLon && s.box[2] >= minLon - padLon
      && s.box[1] <= maxLat + padLat && s.box[3] >= minLat - padLat);
    let inside = 0, near = 0;
    const classes = new Set<FeatureClass>();
    for (let i = 0; i < SAMPLES_PER_SIDE; i++) {
      for (let j = 0; j < SAMPLES_PER_SIDE; j++) {
        const lon = minLon + ((i + 0.5) / SAMPLES_PER_SIDE) * (maxLon - minLon);
        const lat = minLat + ((j + 0.5) / SAMPLES_PER_SIDE) * (maxLat - minLat);
        if (!booleanPointInPolygon(point([lon, lat]), poly)) continue;
        inside++;
        let counted = false;
        for (const s of nearby) {
          if (!within(s, lon, lat, bufferM)) continue;
          classes.add(s.cls);
          if (NEAR_CLASSES.has(s.cls)) counted = true;
        }
        if (counted) near++;
      }
    }
    return { ...seg, nearFrac: inside > 0 ? near / inside : 0, featureClasses: [...classes].sort() };
  });
  return { ...grid, segments };
}
