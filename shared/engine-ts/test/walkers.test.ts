import { expect, it } from "vitest";
import toyFixture from "./fixtures/toy-graph.json";
import golden from "./fixtures/toy-walker-table.json";
import { DEFAULT_WALKER_PARAMS, simulateWalkers } from "../src/index";
import type { WalkerOptions, WalkerRouteGraph, WalkerTrack } from "../src/index";

const { graph: toy, grid: toyGrid } = toyFixture as unknown as {
  graph: WalkerRouteGraph;
  grid: Parameters<typeof simulateWalkers>[1];
};

const opts: WalkerOptions = {
  n: 10_000, seed: 20261122, startStationId: 0, travelUnit: null, terrain: "temperate_flat",
  params: undefined, sampleTracks: 300, attractors: [], lowMobility: false,
};

const flatGrid: Parameters<typeof simulateWalkers>[1] = {
  segments: [{
    segmentId: "AA",
    geometry: { type: "Polygon", coordinates: [[[-1000, -1000], [15000, -1000], [15000, 15000], [-1000, 15000], [-1000, -1000]]] },
  }],
};

type Point = [number, number];
type EdgeSpec = [from: number, to: number, cls: "road" | "stream"];

function routes(points: Point[], links: EdgeSpec[]): WalkerRouteGraph {
  const stations: WalkerRouteGraph["stations"] = [];
  const nodes = points.map((_, id) => ({ id, edgeIds: [] as number[], boundary: false }));
  const edges = links.map(([from, to, cls], id) => {
    const [x, y] = points[from]!;
    const [endX, endY] = points[to]!;
    const length = Math.hypot(endX - x, endY - y);
    const hx = (endX - x) / length, hy = (endY - y) / length;
    const distances = Array.from({ length: Math.ceil(length / 25) }, (_, i) => i * 25).concat(length);
    const stationIds = distances.map(d => stations.push({ x: x + hx * d, y: y + hy * d, hx, hy,
      nx: -hy, ny: hx, segmentId: "AA", edgeId: id }) - 1);
    nodes[from]!.edgeIds.push(id);
    nodes[to]!.edgeIds.push(id);
    return { id, from, to, cls, stationIds };
  });
  return { stations, nodes, edges };
}

function simulateAll(graph: WalkerRouteGraph, options: Partial<WalkerOptions>) {
  const n = options.n ?? opts.n;
  return simulateWalkers(graph, flatGrid, { ...opts, params: DEFAULT_WALKER_PARAMS, ...options, n, sampleTracks: n });
}

function lastEdge(graph: WalkerRouteGraph, track: WalkerTrack): number {
  return graph.stations[track.stationIds.at(-1)!]!.edgeId;
}

function runStraight(options: Partial<WalkerOptions>) {
  const graph = routes([[0, 0], [14000, 0]], [[0, 1, "road"]]);
  graph.nodes[1]!.boundary = true;
  const result = simulateAll(graph, options);
  const stops = result.sampleTracks.map(t => graph.stations[t.stationIds.at(-1)!]!.x);
  return {
    fractionStoppedWithinM: (m: number) => stops.filter(x => x <= m).length / result.n,
    maxStopM: Math.max(...stops),
    rowShare: result.row,
  };
}

function runFork({ plain = false, attractorOnA = false, ...options }: Partial<WalkerOptions> & {
  plain?: boolean; attractorOnA?: boolean;
}) {
  const graph = routes([[0, -25], [0, 0], [14000, 0], [-14000, 0]],
    [[0, 1, "road"], [1, 2, plain ? "road" : "stream"], [1, 3, "road"]]);
  const result = simulateAll(graph, { ...options, attractors: attractorOnA ? [{ x: 100, y: 0 }] : [] });
  const branches = result.sampleTracks.map(track => lastEdge(graph, track)).filter(edge => edge !== 0);
  const aShare = branches.filter(edge => edge === 1).length / branches.length;
  return { streamShare: aShare, aShare };
}

function runStart(options: Partial<WalkerOptions>) {
  const graph = routes([[0, 0], [0, 14000], [14000, 0]], [[0, 1, "road"], [0, 2, "road"]]);
  const result = simulateAll(graph, options);
  const north = result.sampleTracks.filter(t => graph.stations[t.stationIds[1]!]!.y > 0).length;
  return { inWedgeShare: north / result.sampleTracks.length };
}

function report(stats: object) {
  if (process.env.PLS_WALKER_REPORT === "1") console.info(JSON.stringify(stats));
}

it("the same seed gives the same table, bit for bit; another seed differs", () => {
  expect(simulateWalkers(toy, toyGrid, opts)).toEqual(simulateWalkers(toy, toyGrid, opts));
  expect(simulateWalkers(toy, toyGrid, { ...opts, seed: 7 }).segments).not.toEqual(simulateWalkers(toy, toyGrid, opts).segments);
});

it("matches the committed golden table", () => {
  const result = simulateWalkers(toy, toyGrid, opts);
  expect(result.segments).toEqual(golden.segments);
  expect(result.row).toBe(golden.row);
});

it("mass sums to one", () => {
  const result = simulateWalkers(toy, toyGrid, opts);
  const sum = result.segments.reduce((total, segment) => total + segment.priorPoa, 0);
  expect(sum + result.row).toBeCloseTo(1, 12);
});

it("on one straight 14 km road a quarter stop within 300 m and 5 percent leave", () => {
  const r = runStraight({ n: 10000, seed: 1 });
  report({ straightWithin300M: r.fractionStoppedWithinM(300), row: r.rowShare });
  expect(Math.abs(r.fractionStoppedWithinM(300) - 0.25)).toBeLessThan(0.013);
  expect(Math.abs(r.rowShare - 0.05)).toBeLessThan(0.007);
});

it("at a symmetric fork the stream branch gets two thirds", () => {
  const r = runFork({ n: 10000, seed: 2 });
  report({ forkStreamShare: r.streamShare });
  expect(Math.abs(r.streamShare - 2 / 3)).toBeLessThan(0.015);
});

it("with a travel direction 84 percent start inside the wedge", () => {
  const r = runStart({ n: 10000, seed: 3, travelUnit: [0, 1] });
  report(r);
  expect(Math.abs(r.inWedgeShare - 0.838)).toBeLessThan(0.012);
});

it("an attractor pulls 60 percent at a plain fork", () => {
  const r = runFork({ n: 10000, seed: 4, plain: true, attractorOnA: true });
  report({ attractorShare: r.aShare });
  expect(Math.abs(r.aShare - 0.6)).toBeLessThan(0.015);
});

it("low mobility keeps every walker inside the 75 percent ring", () => {
  const r = runStraight({ n: 10000, seed: 5, lowMobility: true });
  report({ lowMobilityMaxStopM: r.maxStopM, row: r.rowShare });
  expect(r.maxStopM).toBeLessThanOrEqual(2425);
  expect(r.rowShare).toBe(0);
});

it("standard error is sqrt(p(1-p)/n)", () => {
  const r = simulateWalkers(toy, toyGrid, opts), s = r.segments[0]!;
  expect(r.stdErr[s.segmentId]).toBeCloseTo(Math.sqrt(s.priorPoa * (1 - s.priorPoa) / r.n), 12);
});

it("reports progress every 1,000 walkers and at the end without changing the table (web worker)", () => {
  const seen: number[] = [];
  const withProgress = simulateWalkers(toy, toyGrid, { ...opts, n: 2500, onProgress: done => seen.push(done) });
  expect(seen).toEqual([1000, 2000, 2500]);
  expect(withProgress).toEqual(simulateWalkers(toy, toyGrid, { ...opts, n: 2500 }));
});
