import { describe, expect, it } from "vitest";
import { buildPrior, linearWeights } from "../src/index";
import { cell, grid, ipp } from "./gridFixtures";

const off = { linear: false, wedge: false };
const sum = (r: { segments: { priorPoa: number }[] }) => r.segments.reduce((n, s) => n + s.priorPoa, 0);
const poaOf = (r: { segments: { segmentId: string; priorPoa: number }[] }, id: string) => r.segments.find(s => s.segmentId === id)!.priorPoa;

const oneCellGrid = grid([cell("AA", 0, 0, 100)]);
const twoCellGrid = grid([cell("NEAR", -100, 0, 100, 1), cell("FAR", 100, 0, 100, 0)]);
const eastWestGrid = grid([cell("EAST", 200, 0, 100), cell("WEST", -200, 0, 100)]);
const ringGrid = grid([cell("R1", 0, 0, 100), cell("R2", 900, 0, 100), cell("R3", 2000, 0, 100), cell("R4", 5000, 0, 100)]);

describe("ISRID ring prior (spec section 10.5)", () => {
  it("ring layer gives mass by area inside the first ring", () => {
    const { segments, row } = buildPrior(oneCellGrid, ipp, "temperate_flat", off, null);
    expect(segments[0]!.priorPoa).toBeCloseTo((0.25 * 10000) / (Math.PI * 300 * 300), 4);
    expect(segments[0]!.priorPoa + row).toBeCloseTo(1, 12);
  });
  it("linear layer conserves grid mass, favours near-feature segments and leaves ROW alone", () => {
    const base = buildPrior(twoCellGrid, ipp, "temperate_flat", off, null);
    const lin = buildPrior(twoCellGrid, ipp, "temperate_flat", { linear: true, wedge: false }, null);
    expect(sum(lin)).toBeCloseTo(sum(base), 12);
    expect(lin.row).toBeCloseTo(base.row, 12);
    expect(poaOf(lin, "NEAR")).toBeGreaterThan(poaOf(base, "NEAR"));
    expect(poaOf(lin, "NEAR") / sum(lin)).toBeCloseTo(0.75, 9);
  });
  it("linear layer is neutral when the near share is already at or above 0.75 (coordinator ruling 2026-11-18)", () => {
    // A path-dense site (the Piedmont Park dev grid had nearFrac >= 0.927 everywhere): the 75/25 formula would
    // pile 25% of the mass onto the tiny far area, the opposite of the ISRID intent.
    const dense = grid([cell("A", -100, 0, 100, 1), cell("B", 100, 0, 100, 0.9), cell("C", 0, 100, 100, 0.8)]);
    expect(buildPrior(dense, ipp, "temperate_flat", { linear: true, wedge: false }, null))
      .toEqual(buildPrior(dense, ipp, "temperate_flat", off, null));
  });
  it("linearWeights is continuous at 0.75 and unchanged below it", () => {
    expect(linearWeights([1, 1], [1, 0.5], 0.75, 0.25)).toEqual([1, 1]);
    const below = linearWeights([1, 1], [1, 0.4999], 0.75, 0.25);
    for (const w of below) expect(w).toBeCloseTo(1, 3);
    expect(linearWeights([0.5, 0.5], [1, 0], 0.75, 0.25)).toEqual([1.5, 0.5]);
    expect(linearWeights([0, 0], [1, 0], 0.75, 0.25)).toEqual([1, 1]);
  });
  it("linear layer changes nothing when no segment, or every segment, is near a feature", () => {
    const none = grid([cell("A", -100, 0, 100, 0), cell("B", 100, 0, 100, 0)]);
    expect(buildPrior(none, ipp, "temperate_flat", { linear: true, wedge: false }, null))
      .toEqual(buildPrior(none, ipp, "temperate_flat", off, null));
  });
  it("wedge uses 2.045 inside 66 degrees and 0.395 outside, and conserves grid mass", () => {
    const base = buildPrior(eastWestGrid, ipp, "temperate_flat", off, null);
    const w = buildPrior(eastWestGrid, ipp, "temperate_flat", { linear: false, wedge: true }, 90);
    expect(poaOf(w, "EAST") / poaOf(w, "WEST")).toBeCloseTo(2.045 / 0.395, 3);
    expect(sum(w)).toBeCloseTo(sum(base), 12);
  });
  it("wedge is off without a travel bearing", () => {
    expect(buildPrior(eastWestGrid, ipp, "temperate_flat", { linear: false, wedge: true }, null))
      .toEqual(buildPrior(eastWestGrid, ipp, "temperate_flat", off, null));
  });
  it("mountain column gives different mass than flat", () => {
    expect(buildPrior(ringGrid, ipp, "temperate_mountain", off, null)).not.toEqual(buildPrior(ringGrid, ipp, "temperate_flat", off, null));
  });
  it("a cell in a later ring gets that ring's density, which falls with distance", () => {
    const r = buildPrior(ringGrid, ipp, "temperate_flat", off, null);
    expect(poaOf(r, "R1")).toBeGreaterThan(poaOf(r, "R2"));
    expect(poaOf(r, "R2")).toBeGreaterThan(poaOf(r, "R3"));
    expect(poaOf(r, "R3")).toBeGreaterThan(poaOf(r, "R4"));
    expect(r.row).toBeGreaterThan(0.95);
  });
});
