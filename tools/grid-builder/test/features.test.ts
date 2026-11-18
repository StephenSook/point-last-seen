import { describe, expect, it } from "vitest";
import { buildCells } from "../src/cells";
import { applyFeatures, classifyOsm } from "../src/features";
import { applyStreams } from "../src/streams";
import { line, squareSite } from "./fixtures";

describe("near-feature fraction (71 m buffer)", () => {
  it("a trail along a cell's west edge puts about 71/125 of the cell near a feature", () => {
    const g = applyFeatures(buildCells(squareSite(125), "one"), [line("trail", [[0, -10], [0, 135]])]);
    expect(g.segments[0]!.nearFrac).toBeCloseTo(71 / 125, 1);
    expect(g.segments[0]!.featureClasses).toEqual(["trail"]);
  });
  it("a feature far away leaves nearFrac at 0 and no classes", () => {
    const g = applyFeatures(buildCells(squareSite(125), "one"), [line("road", [[1000, 0], [1000, 125]])]);
    expect(g.segments[0]!.nearFrac).toBe(0);
    expect(g.segments[0]!.featureClasses).toEqual([]);
  });
  it("structures are listed but do not count toward nearFrac", () => {
    const g = applyFeatures(buildCells(squareSite(125), "one"), [line("structure", [[60, 0], [60, 125]])]);
    expect(g.segments[0]!.nearFrac).toBe(0);
    expect(g.segments[0]!.featureClasses).toEqual(["structure"]);
  });
});

describe("stream direction from OSM way order", () => {
  it("a stream flowing east through AA, AB and AC links downstream and upstream", () => {
    const g = applyStreams(buildCells(squareSite(375), "s"), [line("stream", [[10, 300], [360, 300]])]);
    const seg = (id: string) => g.segments.find(s => s.segmentId === id)!;
    expect(seg("AA").downstream).toEqual(["AB"]);
    expect(seg("AB").upstream).toEqual(["AA"]);
    expect(seg("AB").downstream).toEqual(["AC"]);
    expect(seg("AC").upstream).toEqual(["AB"]);
    expect(seg("AD").downstream).toEqual([]);
  });
});

describe("OSM tag classes", () => {
  it("maps highway, waterway, water and building tags to the grid classes", () => {
    expect(classifyOsm({ highway: "residential" })).toBe("road");
    expect(classifyOsm({ highway: "path" })).toBe("trail");
    expect(classifyOsm({ highway: "footway" })).toBe("trail");
    expect(classifyOsm({ waterway: "stream" })).toBe("stream");
    expect(classifyOsm({ natural: "water" })).toBe("water");
    expect(classifyOsm({ building: "yes" })).toBe("structure");
    expect(classifyOsm({ amenity: "bench" })).toBeNull();
  });
});
