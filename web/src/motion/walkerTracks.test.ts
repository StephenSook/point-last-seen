import type { WalkerRouteGraph, WalkerTrack } from "@pls/engine";
import { describe, expect, it } from "vitest";
import { walkerTracksToLngLat } from "./walkerTracks";

const station = (x: number, y: number) => ({ x, y, hx: 1, hy: 0, nx: 0, ny: 1, segmentId: null, edgeId: 0 });
const graph: WalkerRouteGraph = {
  stations: [station(0, 0), station(100, 0), station(100, 200)],
  edges: [],
  nodes: [],
  projection: { origin: { lat: 33.78, lon: -84.38 }, metresPerDegreeLon: 92_500, metresPerDegreeLat: 111_000 },
};

describe("walkerTracksToLngLat", () => {
  it("turns station ids and the end point into longitude and latitude, released in cohorts of 25", () => {
    const tracks: WalkerTrack[] = Array.from({ length: 26 }, () => ({ stationIds: [0, 1, 2], endpoint: { x: 110, y: 200 } }));
    const out = walkerTracksToLngLat(tracks, graph, 2000);
    expect(out).toHaveLength(26);
    expect(out[0]!.pts[0]).toEqual([-84.38, 33.78]);
    expect(out[0]!.pts[1]![0]).toBeCloseTo(-84.38 + 100 / 92_500, 12);
    expect(out[0]!.pts[3]![0]).toBeCloseTo(-84.38 + 110 / 92_500, 12);
    expect(out[0]!.pts[3]![1]).toBeCloseTo(33.78 + 200 / 111_000, 12);
    expect(out.map((t) => t.releaseMs).slice(23, 26)).toEqual([0, 0, 100]);
    expect(out[0]!.durationMs).toBe(2000);
  });

  it("leaves out the end point of a track that left the graph", () => {
    expect(walkerTracksToLngLat([{ stationIds: [0, 1], endpoint: null }], graph, 2000)[0]!.pts).toHaveLength(2);
  });
});
