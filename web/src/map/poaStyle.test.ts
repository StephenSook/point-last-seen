import { describe, expect, it } from "vitest";
import { POA_RAMP, formatPct, poaClass8, segmentFeatures } from "./poaStyle";

describe("poaClass8", () => {
  it("gives eight classes by share of the largest POA", () => {
    expect(poaClass8(0.31, 0.31)).toBe(7);
    expect(poaClass8(0, 0.31)).toBe(0);
    expect(poaClass8(0.155, 0.31)).toBe(4);
    expect(poaClass8(0.3099, 0.31)).toBe(7);
  });

  it("is 0 for a zero maximum, a negative value or NaN", () => {
    expect(poaClass8(0.1, 0)).toBe(0);
    expect(poaClass8(-0.1, 0.31)).toBe(0);
    expect(poaClass8(Number.NaN, 0.31)).toBe(0);
  });
});

describe("POA_RAMP", () => {
  it("is the eight lightness steps of the visual system, darkest first", () => {
    expect(POA_RAMP).toEqual(["#342D23", "#534229", "#765729", "#9A6E2A", "#BD8630", "#DEA143", "#FCC270", "#FFEAC2"]);
  });
});

describe("formatPct", () => {
  it("prints one decimal and marks tiny values", () => {
    expect(formatPct(0.1234)).toBe("12.3%");
    expect(formatPct(0.5)).toBe("50.0%");
    expect(formatPct(0.0004)).toBe("<0.1%");
    expect(formatPct(0)).toBe("0%");
  });
});

describe("segmentFeatures", () => {
  const segments = [
    { segmentId: "AA", geometry: { type: "Polygon" as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, centroid: { lat: 0.5, lon: 0.5 } },
    { segmentId: "AB", geometry: { type: "Polygon" as const, coordinates: [[[1, 0], [2, 0], [2, 1], [1, 0]]] }, centroid: { lat: 0.5, lon: 1.5 } },
  ];

  it("carries POA, class and label per segment and leaves ROW off the map", () => {
    const fc = segmentFeatures(segments, { AA: 0.3, AB: 0.1, ROW: 0.6 });
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features.map((f) => f.properties.segmentId)).toEqual(["AA", "AB"]);
    expect(fc.features[0]!.properties).toEqual({ segmentId: "AA", poa: 0.3, cls: 7, label: "30.0%" });
    expect(fc.features[1]!.properties.cls).toBe(2);
  });

  it("a segment with no POA yet draws as class 0 with no label", () => {
    const fc = segmentFeatures(segments, {});
    expect(fc.features[0]!.properties).toEqual({ segmentId: "AA", poa: 0, cls: 0, label: "" });
  });
});
