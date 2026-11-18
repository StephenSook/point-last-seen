import { describe, expect, it } from "vitest";
import { bearingDeg, effectSegments, segmentChoices, segmentContaining, type GridSegmentDoc } from "./geo";

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
    geometry: { type: "Polygon" as const, coordinates: [[[lon - 0.001, lat - 0.001], [lon + 0.001, lat - 0.001], [lon + 0.001, lat + 0.001], [lon - 0.001, lat - 0.001]]] },
    centroid: { lat, lon },
  });

  it("lists every segment by id with its centre, so a sighting can be placed from the keyboard", () => {
    expect(segmentChoices([seg("AC", 1, 3), seg("AA", 1, 1), seg("AB", 1, 2)])).toEqual([
      { segmentId: "AA", centre: { lat: 1, lon: 1 } },
      { segmentId: "AB", centre: { lat: 1, lon: 2 } },
      { segmentId: "AC", centre: { lat: 1, lon: 3 } },
    ]);
  });
});
