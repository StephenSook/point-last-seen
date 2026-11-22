import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bearingDeg, beatDistances, effectSegments, type GridSegmentDoc, segmentChoices, segmentContaining } from "./geo";

// Two 0.01-degree squares side by side, west (AA) and east (AB), and one north of AA (AC).
const sq = (lon: number, lat: number) => ({ type: "Polygon" as const, coordinates: [[[lon, lat], [lon + 0.01, lat], [lon + 0.01, lat + 0.01], [lon, lat + 0.01], [lon, lat]]] });
const segs: GridSegmentDoc[] = [
  { segmentId: "AA", geometry: sq(-84.0, 33.0), centroid: { lat: 33.005, lon: -83.995 }, areaM2: 1, neighbors: ["AB", "AC"], upstream: [], downstream: ["AB"] },
  { segmentId: "AB", geometry: sq(-83.99, 33.0), centroid: { lat: 33.005, lon: -83.985 }, areaM2: 1, neighbors: ["AA"], upstream: ["AA"], downstream: [] },
  { segmentId: "AC", geometry: sq(-84.0, 33.01), centroid: { lat: 33.015, lon: -83.995 }, areaM2: 1, neighbors: ["AA"], upstream: [], downstream: [] },
];

describe("segmentContaining", () => {
  it("finds the segment under a point", () => {
    expect(segmentContaining({ lat: 33.004, lon: -83.996 }, segs)).toBe("AA");
    expect(segmentContaining({ lat: 33.004, lon: -83.984 }, segs)).toBe("AB");
    expect(segmentContaining({ lat: 33.012, lon: -83.996 }, segs)).toBe("AC");
  });

  it("is null outside every segment", () => {
    expect(segmentContaining({ lat: 34, lon: -83.996 }, segs)).toBeNull();
  });

  it("handles a multipolygon", () => {
    const multi = { ...segs[0]!, geometry: { type: "MultiPolygon" as const, coordinates: [sq(-84.0, 33.0).coordinates, sq(-83.9, 33.0).coordinates] } };
    expect(segmentContaining({ lat: 33.005, lon: -83.895 }, [multi])).toBe("AA");
  });
});

describe("bearingDeg", () => {
  it("is 90 to the east and 0 to the north, in 0 to 360", () => {
    expect(bearingDeg({ lat: 33.005, lon: -83.995 }, { lat: 33.005, lon: -83.985 })).toBeCloseTo(90, 0);
    expect(bearingDeg({ lat: 33.005, lon: -83.995 }, { lat: 33.015, lon: -83.995 })).toBeCloseTo(0, 5);
    expect(bearingDeg({ lat: 33.005, lon: -83.985 }, { lat: 33.005, lon: -83.995 })).toBeCloseTo(270, 0);
  });
});

describe("effectSegments", () => {
  it("gives the engine each segment's neighbours with bearings, and its streams", () => {
    const ctx = effectSegments(segs);
    expect(ctx["AA"]!.neighbors.map((n) => n.segmentId)).toEqual(["AB", "AC"]);
    expect(ctx["AA"]!.neighbors[0]!.bearingDeg).toBeCloseTo(90, 0);
    expect(ctx["AA"]!.neighbors[1]!.bearingDeg).toBeCloseTo(0, 5);
    expect(ctx["AA"]!.downstream).toEqual(["AB"]);
  });

  it("drops a neighbour id that is not in the grid", () => {
    expect(effectSegments([{ ...segs[1]!, neighbors: ["AA", "ZZ"] }, segs[0]!])["AB"]!.neighbors.map((n) => n.segmentId)).toEqual(["AA"]);
  });
});

describe("segmentChoices", () => {
  const seg = (segmentId: string, lat: number, lon: number) => ({
    segmentId,
    geometry: { type: "Polygon" as const, coordinates: [[[lon - 0.001, lat - 0.001], [lon + 0.001, lat - 0.001], [lon + 0.001, lat + 0.001], [lon - 0.001, lat + 0.001], [lon - 0.001, lat - 0.001]]] },
    centroid: { lat, lon },
  });

  it("lists every segment by id with its centre, so a sighting can be placed from the keyboard", () => {
    expect(segmentChoices([seg("AC", 1, 3), seg("AA", 1, 1), seg("AB", 1, 2)])).toEqual([
      { segmentId: "AA", centre: { lat: 1, lon: 1 } },
      { segmentId: "AB", centre: { lat: 1, lon: 2 } },
      { segmentId: "AC", centre: { lat: 1, lon: 3 } },
    ]);
  });

  it("places a segment whose centroid lies outside it (a U shape) at a point inside it", () => {
    // A U open to the north: its centroid sits in the notch, outside the segment.
    const u = {
      segmentId: "AU",
      geometry: { type: "Polygon" as const, coordinates: [[[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3], [0, 0]]] },
      centroid: { lat: 1.36, lon: 1.5 },
    };
    expect(segmentContaining(u.centroid, [u])).toBeNull();
    const [c] = segmentChoices([u]);
    expect(segmentContaining(c!.centre, [u])).toBe("AU");
  });

  it("places a segment whose centroid lies on an edge it shares with a neighbour inside itself, not in the neighbour", () => {
    // AA and BB share the edge from (0.1, 0) to (0.2, 1); BB's stored centroid lies on it, which counts as AA first.
    const aa = { segmentId: "AA", geometry: { type: "Polygon" as const, coordinates: [[[0, 0], [0.1, 0], [0.2, 1], [0, 1], [0, 0]]] }, centroid: { lat: 0.5, lon: 0.07 } };
    const bb = { segmentId: "BB", geometry: { type: "Polygon" as const, coordinates: [[[0.1, 0], [1, 0], [1, 1], [0.2, 1], [0.1, 0]]] }, centroid: { lat: 0.7, lon: 0.16999999999999998 } };
    expect(segmentContaining(bb.centroid, [aa, bb])).toBe("AA");
    const choices = segmentChoices([aa, bb]);
    for (const c of choices) expect(segmentContaining(c.centre, [aa, bb]), c.segmentId).toBe(c.segmentId);
  });

  it("handles a ring of 150,000 points without throwing", () => {
    const ring: number[][] = [];
    for (let i = 0; i < 150_000; i++) ring.push([Math.cos((2 * Math.PI * i) / 150_000), Math.sin((2 * Math.PI * i) / 150_000)]);
    ring.push(ring[0]!);
    const hole = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]];
    const big = { segmentId: "BG", geometry: { type: "Polygon" as const, coordinates: [ring, hole] }, centroid: { lat: 0, lon: 0 } };
    const [c] = segmentChoices([big]);
    expect(segmentContaining(c!.centre, [big])).toBe("BG");
  });

  it("places every segment of both shipped grids inside itself, so a sighting placed from the list lands in it", () => {
    for (const name of ["kennesaw-mountain-drill", "piedmont-park-dev"]) {
      const grid = JSON.parse(readFileSync(new URL(`../../../shared/grid/${name}.grid.json`, import.meta.url), "utf8")) as { segments: GridSegmentDoc[] };
      const outside = segmentChoices(grid.segments).filter((c) => segmentContaining(c.centre, grid.segments) !== c.segmentId).map((c) => c.segmentId);
      expect(outside, name).toEqual([]);
      expect(grid.segments.length, name).toBeGreaterThan(50);
    }
  });
});

describe("beatDistances", () => {
  const seg = (segmentId: string, lat: number, lon: number) => ({
    segmentId,
    geometry: { type: "Polygon" as const, coordinates: [[[lon, lat], [lon + 0.001, lat], [lon, lat + 0.001], [lon, lat]]] },
    centroid: { lat, lon },
  });
  const segs = [seg("AA", 33.78, -84.38), seg("AB", 33.78, -84.37), seg("AC", 33.79, -84.38)];

  it("measures metres from the report's position to each changed segment's centre", () => {
    const d = beatDistances({ lat: 33.78, lon: -84.38 }, ["AA", "AB", "AC"], segs);
    expect(d["AA"]).toBeCloseTo(0, 6);
    expect(d["AB"]).toBeGreaterThan(900);
    expect(d["AB"]).toBeLessThan(940); // 0.01 degree of longitude at 33.78 N is about 925 m
    expect(d["AC"]).toBeGreaterThan(1100); // 0.01 degree of latitude is about 1112 m
  });

  it("measures from the largest move's centre when the report has no position", () => {
    expect(beatDistances(null, ["AB", "AA"], segs)["AB"]).toBe(0);
  });
});
