import rawParams from "../../constants/walker-params.json";
import { mulberry32 } from "./prng";
import type { GridSegment, LatLon, RouteStation, SegmentPrior, Terrain } from "./types";

export type WalkerParams = Omit<typeof rawParams, "compassUnits">;
export const DEFAULT_WALKER_PARAMS: WalkerParams = rawParams;
type Unit = readonly [number, number];
export const COMPASS_UNITS = rawParams.compassUnits as unknown as Readonly<Record<keyof typeof rawParams.compassUnits, Unit>>;

type Point = { x: number; y: number };
type Station = RouteStation & { edgeId: number };
type EdgeClass = "road" | "trail" | "stream" | "water_edge";
type Edge = { id: number; cls: EdgeClass; from: number; to: number; stationIds: number[] };
type Node = { id: number; edgeIds: number[]; boundary: boolean };

export interface WalkerProjection {
  origin: LatLon;
  metresPerDegreeLon: number;
  metresPerDegreeLat: number;
}

/** Station IDs are array indexes. Edge and node IDs are explicit. */
export interface WalkerRouteGraph {
  stations: Station[];
  edges: Edge[];
  nodes: Node[];
  /** Built graphs use this to project the grid. Local fixtures may omit it. */
  projection?: WalkerProjection;
}

export interface WalkerGrid {
  segments: Pick<GridSegment, "segmentId" | "geometry">[];
}

export interface WalkerOptions {
  n?: number;
  seed?: number;
  startStationId: number;
  travelUnit: Unit | null;
  terrain: Terrain;
  params?: WalkerParams;
  sampleTracks?: number;
  attractors: Point[];
  lowMobility: boolean;
}

export interface WalkerTrack {
  stationIds: number[];
  /** Offset point in local metres, or null when the track exits the graph. */
  endpoint: Point | null;
}

export interface WalkerResult {
  segments: SegmentPrior[];
  row: number;
  stdErr: Record<string, number>;
  sampleTracks: WalkerTrack[];
  n: number;
}

function squaredDistance(a: Point, b: Point): number {
  const x = a.x - b.x, y = a.y - b.y;
  return x * x + y * y;
}

/** Normalize to [1, 4) so a fixed number of Newton steps gives full double precision. */
function squareRoot(value: number): number {
  if (value === 0 || !Number.isFinite(value)) return value;
  let scaled = value, scale = 1;
  while (scaled < 1) {
    scaled *= 4;
    scale /= 2;
  }
  while (scaled >= 4) {
    scaled /= 4;
    scale *= 2;
  }
  let root = 2;
  for (let i = 0; i < 6; i++) root = (root + scaled / root) / 2;
  return root * scale;
}

/** Returns the nearest station array index, or null for an empty graph. */
export function nearestWalkerStation(graph: WalkerRouteGraph, point: Point): number | null {
  let nearest = null;
  let minDistance = Infinity;
  graph.stations.forEach((station, id) => {
    const distance = squaredDistance(station, point);
    if (distance < minDistance) {
      nearest = id;
      minDistance = distance;
    }
  });
  return nearest;
}

export function projectWalkerPoint(projection: WalkerProjection, { lon, lat }: LatLon): Point {
  return {
    x: (lon - projection.origin.lon) * projection.metresPerDegreeLon,
    y: (lat - projection.origin.lat) * projection.metresPerDegreeLat,
  };
}

function between(value: number, a: number, b: number): boolean {
  return (value >= a && value <= b) || (value >= b && value <= a);
}

function ringLocation(ring: Point[], { x, y }: Point): "inside" | "outside" | "boundary" {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1]!, b = ring[i]!;
    if (a.x === b.x && a.y === b.y) continue;
    if ((b.x - a.x) * (y - a.y) === (b.y - a.y) * (x - a.x)
      && between(x, a.x, b.x) && between(y, a.y, b.y)) return "boundary";
    if ((a.y > y) !== (b.y > y) && x < a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y)) inside = !inside;
  }
  return inside ? "inside" : "outside";
}

/** Prepares a lookup in local metres. Shared polygon boundaries resolve in grid order. */
export function walkerSegmentLookup(grid: WalkerGrid, projection?: WalkerProjection): (point: Point) => string | null {
  const polygons = grid.segments.flatMap(({ segmentId, geometry }) => {
    const [outer, ...holes] = geometry.coordinates.map(ring => ring.map(([lon, lat]) =>
      projection ? projectWalkerPoint(projection, { lon, lat }) : { x: lon, y: lat }));
    if (!outer?.length) return [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { x, y } of outer) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return [{ segmentId, outer, holes, minX, minY, maxX, maxY }];
  });

  return point => polygons.find(p =>
    point.x >= p.minX && point.x <= p.maxX && point.y >= p.minY && point.y <= p.maxY
    && ringLocation(p.outer, point) !== "outside" && p.holes.every(hole => ringLocation(hole, point) !== "inside")
  )?.segmentId ?? null;
}

function interpolate(q: number, quantiles: number[], distances: number[]): number {
  for (let i = 1; i < quantiles.length; i++) {
    const hi = quantiles[i]!;
    if (q <= hi) {
      const lo = quantiles[i - 1]!, near = distances[i - 1]!;
      return near + (q - lo) * (distances[i]! - near) / (hi - lo);
    }
  }
  // The track-offset table ends at 307 m. Cap the unsourced tail there.
  return distances[distances.length - 1]!;
}

type MeasuredEdge = Edge & { stepsM: number[] };
type Move = { edge: MeasuredEdge; at: number; step: 1 | -1; hx: number; hy: number };

function departure(stations: Station[], edge: MeasuredEdge, at: number, step: Move["step"]): Move {
  const station = stations[edge.stationIds[at]!]!;
  return { edge, at, step, hx: station.hx * step, hy: station.hy * step };
}

function weightedChoice(moves: Move[], weight: (move: Move) => number, draw: () => number): Move {
  const sample = draw();
  if (moves.length === 1) return moves[0]!;
  const weights = moves.map(weight);
  let choice = sample * weights.reduce((total, value) => total + value, 0);
  for (let i = 0; i < moves.length - 1; i++) {
    choice -= weights[i]!;
    if (choice < 0) return moves[i]!;
  }
  return moves[moves.length - 1]!;
}

function turnWeight(move: Move, incoming: Move, station: Station, opts: WalkerOptions, params: WalkerParams): number {
  const cosine = incoming.step * (station.hx * move.hx + station.hy * move.hy);
  const { turnCos, turnWeights } = params;
  let weight = cosine >= turnCos.straight ? turnWeights.straight
    : cosine >= turnCos.slight ? turnWeights.slight : turnWeights.sharp;
  if (move.edge.cls === "stream" || move.edge.cls === "water_edge") weight *= params.waterAttraction;

  if (opts.attractors.some(attractor => {
    const x = attractor.x - station.x, y = attractor.y - station.y;
    const dot = x * move.hx + y * move.hy;
    const lenSquared = x * x + y * y;
    return lenSquared > 0 && dot >= 0 && dot * dot >= params.attractorCosSquared * lenSquared;
  })) weight *= params.attractorWeight;
  return weight;
}

/** A seeded planning prior. All route choices and stops use local metre arithmetic. */
export function simulateWalkers(graph: WalkerRouteGraph, grid: WalkerGrid, opts: WalkerOptions): WalkerResult {
  const params = opts.params ?? DEFAULT_WALKER_PARAMS;
  const n = opts.n ?? params.defaultN;
  const trackLimit = opts.sampleTracks ?? params.defaultSampleTracks;
  if (!Number.isSafeInteger(n) || n <= 0) throw new RangeError("Walker count must be a positive integer");
  if (!Number.isSafeInteger(trackLimit) || trackLimit < 0) throw new RangeError("Sample track count must be a nonnegative integer");

  const { stations } = graph;
  const edges = new Map(graph.edges.map(edge => [edge.id, {
    ...edge,
    stepsM: edge.stationIds.slice(1).map((id, i) =>
      squareRoot(squaredDistance(stations[id]!, stations[edge.stationIds[i]!]!))),
  }]));
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const exits = new Map(graph.nodes.map(node => [node.id, node.edgeIds.flatMap(id => {
    const edge = edges.get(id)!;
    const moves: Move[] = [];
    if (edge.from === node.id) moves.push(departure(stations, edge, 0, 1));
    if (edge.to === node.id) moves.push(departure(stations, edge, edge.stationIds.length - 1, -1));
    return moves;
  })]));

  const start = stations[opts.startStationId];
  let firstMoves: Move[] = [];
  if (start) {
    const edge = edges.get(start.edgeId)!;
    const at = edge.stationIds.indexOf(opts.startStationId);
    const last = edge.stationIds.length - 1;
    firstMoves = at === 0 ? exits.get(edge.from)! : at === last ? exits.get(edge.to)!
      : [departure(stations, edge, at, 1), departure(stations, edge, at, -1)];
  } else if (stations.length > 0) {
    throw new RangeError("Start station is outside the route graph");
  }

  const draw = mulberry32(opts.seed ?? params.defaultSeed);
  const findSegment = walkerSegmentLookup(grid, graph.projection);
  const counts = new Map(grid.segments.map(segment => [segment.segmentId, 0]));
  const sampleTracks: WalkerTrack[] = [];
  let rowCount = 0;
  const quantiles = params.distanceQuantiles;
  const maxQuantile = quantiles[quantiles.length - 1]!;
  const travel = opts.travelUnit;
  const firstWeight = (move: Move) => {
    if (!travel) return 1;
    const cosine = travel[0] * move.hx + travel[1] * move.hy;
    return cosine >= params.wedgeCos ? params.wedgeWeights.inside : params.wedgeWeights.outside;
  };

  for (let i = 0; i < n; i++) {
    const q = draw() * (opts.lowMobility ? params.lowMobilityQuantile : 1);
    if (!start || firstMoves.length === 0 || q > maxQuantile) {
      rowCount++;
      continue;
    }

    const targetM = interpolate(q, quantiles, params.distanceM[opts.terrain]);
    const targetSquared = targetM * targetM, pathCapM = params.tortuosityCap * targetM;
    const stationIds = sampleTracks.length < trackLimit ? [opts.startStationId] : null;
    let move = { ...weightedChoice(firstMoves, firstWeight, draw) };
    let pathM = 0;
    let endpoint: Point | null = null;
    while (true) {
      const next = move.at + move.step;
      const stationId = move.edge.stationIds[next]!;
      const station = stations[stationId]!;
      stationIds?.push(stationId);
      pathM += move.edge.stepsM[move.step === 1 ? move.at : next]!;
      const nodeId = next === 0 ? move.edge.from : next === move.edge.stationIds.length - 1 ? move.edge.to : null;
      if (nodeId !== null && nodes.get(nodeId)!.boundary) break;

      if (squaredDistance(start, station) >= targetSquared || pathM >= pathCapM) {
        const offset = interpolate(draw(), quantiles, params.offsetM) * (draw() < 0.5 ? -1 : 1);
        endpoint = { x: station.x + station.nx * offset, y: station.y + station.ny * offset };
        break;
      }

      if (nodeId === null) {
        move.at = next;
      } else {
        const outgoing = exits.get(nodeId)!;
        const nonReversing = outgoing.filter(candidate => candidate.edge !== move.edge || candidate.step === move.step);
        const available = nonReversing.length > 0 ? nonReversing : outgoing;
        move = { ...weightedChoice(available, candidate => turnWeight(candidate, move, station, opts, params), draw) };
      }
    }

    const segmentId = endpoint && findSegment(endpoint);
    if (segmentId === null) rowCount++;
    else counts.set(segmentId, counts.get(segmentId)! + 1);
    if (stationIds) sampleTracks.push({ stationIds, endpoint });
  }

  const segments = grid.segments.map(({ segmentId }) => ({ segmentId, priorPoa: counts.get(segmentId)! / n }));
  const stdErr = Object.fromEntries(segments.map(({ segmentId, priorPoa: p }) => [segmentId, squareRoot(p * (1 - p) / n)]));
  return { segments, row: rowCount / n, stdErr, sampleTracks, n };
}
