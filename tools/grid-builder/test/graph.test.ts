import { expect, it } from "vitest";
import { simulateWalkers } from "@pls/engine";
import type { RouteGraph, WalkerRouteGraph } from "@pls/engine";
import { buildCells } from "../src/cells";
import { buildGraph, buildRouteGraph, indexRouteGraph } from "../src/graph";
import { at, line, ORIGIN, squareSite } from "./fixtures";

const straightRoad1km = [line("road", [[0, 0], [1000, 0]])];
const roadCrossingStream = [
  line("road", [[0, 500], [1000, 500]]),
  line("stream", [[500, -2000], [500, 3000]]),
];

function edgeClasses(graph: WalkerRouteGraph, node: WalkerRouteGraph["nodes"][number]) {
  return new Set(node.edgeIds.map(id => graph.edges[id]!.cls));
}

function runCrossing({ n, seed }: { n: number; seed: number }) {
  const grid = buildCells(squareSite(1000), "crossing");
  const g = buildGraph(roadCrossingStream, grid, { origin: ORIGIN, bounds: [...at(0, -2000), ...at(1000, 3000)] });
  const startStationId = g.stations.findIndex(s => g.edges[s.edgeId]!.cls === "road" && Math.abs(s.x - 475) < 0.01);
  expect(startStationId).toBeGreaterThanOrEqual(0);
  const r = simulateWalkers(g, grid, {
    n, seed, startStationId, travelUnit: [1, 0], terrain: "temperate_flat",
    sampleTracks: n, attractors: [], lowMobility: false,
  });
  const streamCount = r.sampleTracks.filter(track => {
    const end = g.stations[track.stationIds.at(-1)!]!;
    return track.endpoint !== null && g.edges[end.edgeId]!.cls === "stream";
  }).length;
  return { endedOnStreamShare: streamCount / n };
}

it("stations are 25 m apart with unit headings", () => {
  const g = buildGraph(straightRoad1km, undefined, { origin: ORIGIN });
  expect(g.stations).toHaveLength(41);
  expect(g.stations[1]!.hx ** 2 + g.stations[1]!.hy ** 2).toBeCloseTo(1, 9);
  for (let i = 1; i < g.stations.length; i++) {
    const a = g.stations[i - 1]!, b = g.stations[i]!;
    expect(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 25)).toBeLessThan(1e-6);
  }
});

it("a road crossing a stream gets one shared junction", () => {
  const g = buildGraph(roadCrossingStream, undefined, { origin: ORIGIN });
  expect(g.nodes.filter(n => edgeClasses(g, n).has("road") && edgeClasses(g, n).has("stream"))).toHaveLength(1);
});

it("a walker on the road can turn onto the stream at the crossing", () => {
  const r = runCrossing({ n: 10000, seed: 6 });
  if (process.env.PLS_WALKER_REPORT === "1") console.info(JSON.stringify(r));
  expect(r.endedOnStreamShare).toBeGreaterThan(0.2);
});

it("a trail meeting a water edge keeps its junctions after a graph JSON round trip", () => {
  const grid = buildCells(squareSite(500), "water");
  const water = { ...squareSite(200), properties: { class: "water" } };
  const features = [line("trail", [[-200, 100], [0, 100], [300, 100]]), water];
  const bounds: typeof grid.bbox = [...at(-100, -100), ...at(500, 500)];
  const options = { bounds, origin: ORIGIN };
  const document = buildRouteGraph(features, grid, options);
  const reloaded: RouteGraph = JSON.parse(JSON.stringify(document));
  expect(reloaded).toEqual(document);

  // The stored graph carries its own extract bounds and projection, so a reload needs no outside input.
  expect(reloaded.bounds).toEqual(bounds);
  expect(reloaded.projection.metresPerDegreeLat).toBeGreaterThan(0);
  const graph = indexRouteGraph(reloaded);
  const junctions = graph.nodes.filter(node => {
    const classes = edgeClasses(graph, node);
    return classes.has("water_edge") && classes.has("trail");
  });
  expect(junctions).toHaveLength(2);
  expect(graph.nodes.filter(node => node.boundary)).toHaveLength(1);
  expect(graph.stations.some(station => station.segmentId !== null)).toBe(true);
});

it("a graph built without bounds stores null and has no exits, said explicitly", () => {
  const document = buildRouteGraph(straightRoad1km, undefined, { origin: ORIGIN });
  expect(document.bounds).toBeNull();
  expect(indexRouteGraph(JSON.parse(JSON.stringify(document))).nodes.filter(n => n.boundary)).toHaveLength(0);
});

it("a stored graph without bounds or projection is refused, never read as having no exits", () => {
  const document: Record<string, unknown> = JSON.parse(JSON.stringify(buildRouteGraph(straightRoad1km, undefined, { origin: ORIGIN })));
  const { bounds: _b, ...noBounds } = document;
  const { projection: _p, ...noProjection } = document;
  expect(() => indexRouteGraph(noBounds as never)).toThrow(/bounds/);
  expect(() => indexRouteGraph(noProjection as never)).toThrow(/projection/);
});
