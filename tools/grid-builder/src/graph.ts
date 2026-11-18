import { DEFAULT_WALKER_PARAMS, projectWalkerPoint, walkerSegmentLookup } from "@pls/engine";
import type { Grid, LatLon, RouteGraph, RouteStation, WalkerProjection, WalkerRouteGraph } from "@pls/engine";
import type { Feature, Geometry, Position } from "geojson";
import { ATTRIBUTION } from "./cells";

type Point = { x: number; y: number };
type EdgeClass = RouteGraph["edges"][number]["class"];
type Bounds = Grid["bbox"];
type Extent = { min: Point; max: Point };

export interface GraphOptions {
  origin?: LatLon;
  /** Bounds of the OSM extract including its margin, in [minLon, minLat, maxLon, maxLat] order. */
  bounds?: Bounds;
}

const M_PER_DEG = (6371008.8 * Math.PI) / 180;
const SPACING_M = DEFAULT_WALKER_PARAMS.stationSpacingM as 25;
const SNAP_M = 1e-6;

// JSON has one zero. Build the same coordinates and headings that a reload gives.
function jsonNumber(value: number): number {
  return value === 0 ? 0 : value;
}

function projectionAt(origin: LatLon): WalkerProjection {
  return { origin, metresPerDegreeLat: M_PER_DEG, metresPerDegreeLon: M_PER_DEG * Math.cos(origin.lat * Math.PI / 180) };
}

function toExtent(projection: WalkerProjection, bounds?: Bounds): Extent | undefined {
  if (!bounds) return undefined;
  const [minLon, minLat, maxLon, maxLat] = bounds;
  return { min: projectWalkerPoint(projection, { lon: minLon, lat: minLat }),
    max: projectWalkerPoint(projection, { lon: maxLon, lat: maxLat }) };
}

function onBoundary(p: Point, extent?: Extent): boolean {
  return !!extent && (Math.abs(p.x - extent.min.x) < SNAP_M || Math.abs(p.x - extent.max.x) < SNAP_M
    || Math.abs(p.y - extent.min.y) < SNAP_M || Math.abs(p.y - extent.max.y) < SNAP_M);
}

function key(p: Point): string {
  return `${Math.round(p.x / SNAP_M)},${Math.round(p.y / SNAP_M)}`;
}

function pointAt(a: Point, b: Point, t: number): Point {
  if (t === 0) return a;
  if (t === 1) return b;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function clip(a: Point, b: Point, extent?: Extent): [Point, Point] | null {
  if (!extent) return [a, b];
  let from = 0, to = 1;
  for (const axis of ["x", "y"] as const) {
    const delta = b[axis] - a[axis];
    if (delta === 0) {
      if (a[axis] < extent.min[axis] || a[axis] > extent.max[axis]) return null;
      continue;
    }
    const near = (extent.min[axis] - a[axis]) / delta, far = (extent.max[axis] - a[axis]) / delta;
    from = Math.max(from, Math.min(near, far));
    to = Math.min(to, Math.max(near, far));
    if (from >= to) return null;
  }
  return [pointAt(a, b, from), pointAt(a, b, to)];
}

type Leg = { a: Point; b: Point; cls: EdgeClass; cuts: { t: number; point: Point }[] };

function extractLines(feature: Feature<Geometry>): { cls: EdgeClass; points: Position[] }[] {
  const cls = feature.properties?.class;
  const g = feature.geometry;
  if (cls === "road" || cls === "trail" || cls === "stream") {
    if (g.type === "LineString") return [{ cls, points: g.coordinates }];
    if (g.type === "MultiLineString") return g.coordinates.map(points => ({ cls, points }));
  }
  if (cls === "water" || cls === "water_edge") {
    const water = (points: Position[]) => ({ cls: "water_edge" as const, points });
    if (g.type === "LineString") return [water(g.coordinates)];
    if (g.type === "MultiLineString" || g.type === "Polygon") return g.coordinates.map(water);
    if (g.type === "MultiPolygon") return g.coordinates.flatMap(polygon => polygon.map(water));
  }
  return [];
}

function buildPaths(lines: ReturnType<typeof extractLines>, projection: WalkerProjection, extent?: Extent): Leg[][] {
  const paths: Leg[][] = [];
  for (const { points, cls } of lines) {
    const xy = points.map(([lon, lat]) => projectWalkerPoint(projection, { lon: lon!, lat: lat! }));
    let path: Leg[] = [];
    for (let i = 1; i < xy.length; i++) {
      const clipped = clip(xy[i - 1]!, xy[i]!, extent);
      if (!clipped) continue;
      const [a, b] = clipped;
      if (key(a) === key(b)) continue;
      if (path.length === 0 || key(path[path.length - 1]!.b) !== key(a)) {
        path = [];
        paths.push(path);
      }
      path.push({ a, b, cls, cuts: [] });
    }
  }
  return paths;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function cutAt(leg: Leg, t: number, point: Point): void {
  if (key(point) !== key(leg.a) && key(point) !== key(leg.b)) leg.cuts.push({ t, point });
}

function cutAtContact(leg: Leg, p: Point): void {
  const dx = leg.b.x - leg.a.x, dy = leg.b.y - leg.a.y;
  const x = p.x - leg.a.x, y = p.y - leg.a.y;
  const t = (x * dx + y * dy) / (dx * dx + dy * dy);
  if (t <= 0 || t >= 1) return;
  const projected = pointAt(leg.a, leg.b, t);
  if (Math.hypot(p.x - projected.x, p.y - projected.y) <= SNAP_M) cutAt(leg, t, p);
}

function cutCrossing(a: Leg, b: Leg): void {
  const ax = a.b.x - a.a.x, ay = a.b.y - a.a.y;
  const bx = b.b.x - b.a.x, by = b.b.y - b.a.y;
  const x = b.a.x - a.a.x, y = b.a.y - a.a.y;
  const det = cross(ax, ay, bx, by);
  if (det !== 0) {
    const t = cross(x, y, bx, by) / det, u = cross(x, y, ax, ay) / det;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      const p = pointAt(a.a, a.b, t);
      cutAt(a, t, p);
      cutAt(b, u, p);
      return;
    }
  }
  // Include a contact at an existing endpoint, including collinear water edges.
  cutAtContact(a, b.a);
  cutAtContact(a, b.b);
  cutAtContact(b, a.a);
  cutAtContact(b, a.b);
}

function insertWaterJunctions(paths: Leg[][]): void {
  const spans = paths.flat().map(leg => ({
    leg, water: leg.cls === "stream" || leg.cls === "water_edge",
    minX: Math.min(leg.a.x, leg.b.x), maxX: Math.max(leg.a.x, leg.b.x),
    minY: Math.min(leg.a.y, leg.b.y), maxY: Math.max(leg.a.y, leg.b.y),
  })).sort((a, b) => a.minX - b.minX);
  let active: typeof spans = [];
  for (const span of spans) {
    active = active.filter(other => other.maxX + SNAP_M >= span.minX);
    for (const other of active) {
      if (span.water !== other.water && other.minY <= span.maxY + SNAP_M && other.maxY + SNAP_M >= span.minY) {
        cutCrossing(other.leg, span.leg);
      }
    }
    active.push(span);
  }
}

function stationsFor(points: Point[], findSegment: (point: Point) => string | null): RouteStation[] {
  const stations: RouteStation[] = [];
  let travelled = 0;
  let next: number = SPACING_M;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const hx = jsonNumber(dx / length), hy = jsonNumber(dy / length);
    const end = travelled + length;
    const station = (p: Point): RouteStation => ({
      x: jsonNumber(p.x), y: jsonNumber(p.y), hx, hy, nx: jsonNumber(-hy), ny: hx, segmentId: findSegment(p),
    });
    if (i === 1) stations.push(station(a));
    while (next < end - SNAP_M) {
      stations.push(station(pointAt(a, b, Math.max(0, next - travelled) / length)));
      next += SPACING_M;
    }
    if (i === points.length - 1) stations.push(station(b));
    travelled = end;
  }
  return stations;
}

/** Builds the on-disk RouteGraph contract from the same classified features as the grid builder. */
export function buildRouteGraph(features: Feature<Geometry>[], grid?: Grid, options: GraphOptions = {}): RouteGraph {
  const lines = features.flatMap(extractLines);
  const first = lines[0]?.points[0];
  const reference = options.origin ?? {
    lon: grid?.bbox[0] ?? options.bounds?.[0] ?? first?.[0] ?? 0,
    lat: grid?.bbox[1] ?? options.bounds?.[1] ?? first?.[1] ?? 0,
  };
  const origin = { lon: jsonNumber(reference.lon), lat: jsonNumber(reference.lat) };
  const projection = projectionAt(origin);
  const paths = buildPaths(lines, projection, toExtent(projection, options.bounds));
  insertWaterJunctions(paths);

  const edges: RouteGraph["edges"] = [], nodes: RouteGraph["nodes"] = [];
  const nodeIds = new Map<string, number>();
  const resolved = new Map<string, Point>();
  const visits = new Map<string, number>();
  const findSegment = walkerSegmentLookup(grid ?? { segments: [] }, projection);

  const routes = paths.map(path => {
    const points = path.flatMap(leg => [leg.a, ...leg.cuts.sort((a, b) => a.t - b.t).map(cut => cut.point)]);
    points.push(path[path.length - 1]!.b);
    const distinct = points.filter((p, i) => i === 0 || key(p) !== key(points[i - 1]!));
    for (const p of distinct) {
      const k = key(p);
      visits.set(k, (visits.get(k) ?? 0) + 1);
      if (!resolved.has(k)) resolved.set(k, p);
    }
    return { points: distinct, cls: path[0]!.cls };
  });

  function nodeAt(p: Point): number {
    const k = key(p);
    const existing = nodeIds.get(k);
    if (existing !== undefined) return existing;
    const nodeId = nodes.length;
    nodeIds.set(k, nodeId);
    nodes.push({ nodeId, x: jsonNumber(p.x), y: jsonNumber(p.y) });
    return nodeId;
  }

  for (const route of routes) {
    const points = route.points.map(p => resolved.get(key(p))!);
    let from = 0;
    for (let i = 1; i < points.length; i++) {
      if (i === points.length - 1 || visits.get(key(points[i]!))! > 1) {
        edges.push({ edgeId: edges.length, class: route.cls, from: nodeAt(points[from]!), to: nodeAt(points[i]!),
          stations: stationsFor(points.slice(from, i + 1), findSegment) });
        from = i;
      }
    }
  }

  const bounds = options.bounds ? options.bounds.map(jsonNumber) as [number, number, number, number] : null;
  return {
    graphId: grid?.gridId ?? "routes", gridId: grid?.gridId ?? "routes", stationSpacingM: SPACING_M,
    origin, nodes, edges, bounds,
    projection: { metresPerDegreeLat: jsonNumber(projection.metresPerDegreeLat), metresPerDegreeLon: jsonNumber(projection.metresPerDegreeLon) },
    attribution: ATTRIBUTION,
  };
}

/**
 * Adapt stored edges to station IDs. The graph carries its own extract bounds and projection, so a reload
 * rebuilds the same exits with no outside input; a graph without them is refused, because reading it as
 * "no exits" would silently keep walkers that should leave the area on the graph.
 */
export function indexRouteGraph(graph: RouteGraph): WalkerRouteGraph {
  if (graph.bounds === undefined) throw new Error(`route graph ${graph.graphId} has no bounds field: rebuild it with the grid builder`);
  if (!graph.projection) throw new Error(`route graph ${graph.graphId} has no projection: rebuild it with the grid builder`);
  const projection = { origin: graph.origin, ...graph.projection };
  const extent = toExtent(projection, graph.bounds ?? undefined);
  const nodes = graph.nodes.map(node => ({ id: node.nodeId, edgeIds: [] as number[], boundary: onBoundary(node, extent) }));
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const stations: WalkerRouteGraph["stations"] = [];
  const edges = graph.edges.map(edge => {
    nodesById.get(edge.from)!.edgeIds.push(edge.edgeId);
    if (edge.from !== edge.to) nodesById.get(edge.to)!.edgeIds.push(edge.edgeId);
    const stationIds = edge.stations.map(station => stations.push({ ...station, edgeId: edge.edgeId }) - 1);
    return { id: edge.edgeId, cls: edge.class, from: edge.from, to: edge.to, stationIds };
  });
  return { stations, edges, nodes, projection };
}

export function buildGraph(features: Feature<Geometry>[], grid?: Grid, options: GraphOptions = {}): WalkerRouteGraph {
  return indexRouteGraph(buildRouteGraph(features, grid, options));
}

/** Write the site's graph next to its grid, independent of the caller's working directory. */
export async function writeRouteGraph(site: string, graph: RouteGraph): Promise<void> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(site)) throw new Error("Invalid graph site name");
  const { mkdir, writeFile } = await import("node:fs/promises");
  const directory = new URL("../../../shared/grid/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(`${site}.graph.json`, directory), JSON.stringify(graph) + "\n");
}
