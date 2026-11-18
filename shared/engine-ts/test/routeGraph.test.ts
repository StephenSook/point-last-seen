// The stored RouteGraph (shared/schemas/route-graph.schema.json) is indexed in the engine, so the web worker
// and the grid builder read the same file the same way.
import { describe, expect, it } from "vitest";
import { indexRouteGraph } from "../src/index";
import type { RouteGraph } from "../src/index";

const M = (6371008.8 * Math.PI) / 180;
const origin = { lat: 33.7, lon: -84.3 };
const projection = { metresPerDegreeLat: M, metresPerDegreeLon: M * Math.cos((origin.lat * Math.PI) / 180) };
// A 100 m road from x = 0 (on the west bound) to x = 100 (inside).
const graph: RouteGraph = {
  graphId: "toy", gridId: "toy", stationSpacingM: 25, origin,
  nodes: [{ nodeId: 0, x: 0, y: 0 }, { nodeId: 1, x: 100, y: 0 }],
  edges: [{ edgeId: 0, class: "road", from: 0, to: 1, stations: [
    { x: 0, y: 0, hx: 1, hy: 0, nx: 0, ny: 1, segmentId: null }, { x: 100, y: 0, hx: 1, hy: 0, nx: 0, ny: 1, segmentId: null }] }],
  bounds: [origin.lon, origin.lat - 0.01, origin.lon + 0.01, origin.lat + 0.01], projection, attribution: "x",
};

describe("indexRouteGraph in the engine", () => {
  it("marks the node on the stored bounds as an exit and uses the stored projection", () => {
    const g = indexRouteGraph(graph);
    expect(g.nodes.map(n => n.boundary)).toEqual([true, false]);
    expect(g.projection?.metresPerDegreeLon).toBe(projection.metresPerDegreeLon);
    expect(g.stations).toHaveLength(2);
  });
  it("refuses a graph without bounds or projection", () => {
    const { bounds: _b, ...noBounds } = graph;
    expect(() => indexRouteGraph(noBounds as never)).toThrow(/bounds/);
  });
});
