import { describe, expect, it } from "vitest";
import { plateShown, screenBox } from "./plateRule";

const box = { left: 0, top: 0, right: 60, bottom: 30 };

describe("plateShown", () => {
  it("shows a plate at 1.0% or more when it fits inside its segment's box", () => {
    expect(plateShown({ poa: 0.01, label: "1.0%", plate: { w: 60, h: 30 }, box, every: false })).toBe(true);
    expect(plateShown({ poa: 0.2, label: "20.0%", plate: { w: 40, h: 18 }, box, every: false })).toBe(true);
  });

  it("hides a plate below 1.0%, or one wider or taller than its segment's box", () => {
    expect(plateShown({ poa: 0.0099, label: "1.0%", plate: { w: 10, h: 10 }, box, every: false })).toBe(false);
    expect(plateShown({ poa: 0.2, label: "20.0%", plate: { w: 61, h: 18 }, box, every: false })).toBe(false);
    expect(plateShown({ poa: 0.2, label: "20.0%", plate: { w: 40, h: 31 }, box, every: false })).toBe(false);
  });

  it("with every percent on, shows all plates whatever their size, but never <0.1% or an empty one", () => {
    expect(plateShown({ poa: 0.002, label: "0.2%", plate: { w: 400, h: 400 }, box, every: true })).toBe(true);
    expect(plateShown({ poa: 0.0001, label: "<0.1%", plate: { w: 1, h: 1 }, box, every: true })).toBe(false);
    expect(plateShown({ poa: 0, label: "", plate: { w: 1, h: 1 }, box, every: true })).toBe(false);
  });
});

describe("screenBox", () => {
  it("is the axis-aligned box around the projected points", () => {
    expect(screenBox([[10, 40], [70, 5], [30, 90]])).toEqual({ left: 10, top: 5, right: 70, bottom: 90 });
  });
  it("is null with no points", () => {
    expect(screenBox([])).toBeNull();
  });
});
