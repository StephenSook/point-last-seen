import { area } from "@turf/area";
import { describe, expect, it } from "vitest";
import { buildCells } from "../src/cells";
import { squareSite } from "./fixtures";

const squareSite500m = squareSite(500);

describe("grid cells (spec section 10.5, plan Task 10)", () => {
  it("cells are 125 m, two-letter ids, neighbours share an edge", () => {
    const g = buildCells(squareSite500m, "test-site");
    expect(g.segments).toHaveLength(16);
    expect(g.segments.find(s => s.segmentId === "AA")!.neighbors.sort()).toEqual(["AB", "AE"]);
    expect(g.segments.find(s => s.segmentId === "AF")!.neighbors.sort()).toEqual(["AB", "AE", "AG", "AJ"]);
    expect(g.cellM).toBe(125);
    expect(g.attribution).toMatch(/OpenStreetMap/);
  });
  it("rows run north to south, so AE is directly south of AA", () => {
    const g = buildCells(squareSite500m, "test-site");
    const aa = g.segments.find(s => s.segmentId === "AA")!, ae = g.segments.find(s => s.segmentId === "AE")!;
    expect(ae.centroid.lat).toBeLessThan(aa.centroid.lat);
    expect(ae.centroid.lon).toBeCloseTo(aa.centroid.lon, 6);
  });
  it("cell areas add up to the site's area, each about 15,625 m2", () => {
    const g = buildCells(squareSite500m, "test-site");
    const total = g.segments.reduce((n, s) => n + s.areaM2, 0);
    expect(total / area(squareSite500m)).toBeCloseTo(1, 5);
    for (const s of g.segments) expect(s.areaM2 / 15625).toBeCloseTo(1, 2);
  });
  it("cells are clipped to the site and empty cells are dropped", () => {
    const g = buildCells(squareSite(300), "small");
    expect(g.segments).toHaveLength(9);
    const corner = g.segments.find(s => s.segmentId === "AI")!;
    expect(corner.areaM2 / (50 * 50)).toBeCloseTo(1, 2);
  });
  it("new cells carry no features or stream links until those steps run", () => {
    const s = buildCells(squareSite500m, "test-site").segments[0]!;
    expect([s.nearFrac, s.featureClasses, s.upstream, s.downstream]).toEqual([0, [], [], []]);
  });
});
