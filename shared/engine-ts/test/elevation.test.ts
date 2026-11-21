import { describe, expect, it } from "vitest";
import { buildPrior, DEFAULT_PARAMS, ELEVATION_PARAMS } from "../src/index";
import { cell, grid, ipp } from "./gridFixtures";

// The elevation layer (Koester, Lost Person Behavior, dementia p.164): with it on, the grid's classified mass sits
// 19% uphill, 39% level and 42% downhill of the start. Level is within 3 m of the start: ours, since the source
// defines no band. It runs only where segment elevations exist and never on urban terrain (no urban split).
const g = grid([cell("UP", 0, 150, 125), cell("LV", 150, 0, 125), cell("DN", 0, -150, 125), cell("DD", -150, 0, 125)]);
const elev = { startM: 300, bySegment: { UP: 315, LV: 301, DN: 290, DD: 250 } };
const off = { linear: false, wedge: false };

describe("buildPrior's elevation layer", () => {
  it("puts the source's shares of the grid's mass uphill, level and downhill, and leaves ROW alone", () => {
    const ring = buildPrior(g, ipp, "temperate_flat", off, null);
    const on = buildPrior(g, ipp, "temperate_flat", { ...off, elevation: true }, null, DEFAULT_PARAMS, elev);
    const p = Object.fromEntries(on.segments.map(s => [s.segmentId, s.priorPoa]));
    const inGrid = 1 - ring.row;
    expect(on.row).toBeCloseTo(ring.row, 12);
    expect(p.UP! / inGrid).toBeCloseTo(0.19, 9);
    expect(p.LV! / inGrid).toBeCloseTo(0.39, 9);
    expect((p.DN! + p.DD!) / inGrid).toBeCloseTo(0.42, 9);
  });

  it("is off by default and ignores elevations when off", () => {
    const ring = buildPrior(g, ipp, "temperate_flat", off, null);
    expect(buildPrior(g, ipp, "temperate_flat", off, null, DEFAULT_PARAMS, elev).segments).toEqual(ring.segments);
  });

  it("refuses urban terrain, which the source gives no split for, and a site with no elevations", () => {
    expect(() => buildPrior(g, ipp, "urban", { ...off, elevation: true }, null, DEFAULT_PARAMS, elev)).toThrow(/urban/);
    expect(() => buildPrior(g, ipp, "temperate_flat", { ...off, elevation: true }, null)).toThrow(/elevation/);
  });

  it("takes its shares and band from its own constants, sourced to p.164, and leaves the stored params as they were", () => {
    expect(ELEVATION_PARAMS).toMatchObject({ levelBandM: 3, temperate: { up: 0.19, level: 0.39, down: 0.42 } });
    expect(ELEVATION_PARAMS.source).toMatch(/p\. 164/);
    expect(Object.keys(DEFAULT_PARAMS)).not.toContain("elevation");
  });
});
