import { describe, expect, it } from "vitest";
import { labelOrder, overlapping } from "./labelDensity";

const r = (left: number, top: number, w = 40, h = 16) => ({ left, top, right: left + w, bottom: top + h });

describe("overlapping", () => {
  it("hides a cell's labels when any of them would cover a label placed before it", () => {
    // Placed in order: the first two sit apart, the third collides with the first.
    const units = [[r(0, 0)], [r(100, 0)], [r(20, 8)], [r(0, 40)]];
    expect([...overlapping(units)]).toEqual([2]);
  });
  it("treats a cell's code and percent as one unit", () => {
    expect([...overlapping([[r(0, 0), r(0, 20)], [r(100, 0), r(10, 25)]])]).toEqual([1]);
  });
  it("hides nothing when no labels touch", () => {
    expect(overlapping([[r(0, 0)], [r(0, 30)], [r(60, 0)]]).size).toBe(0);
  });
});

describe("labelOrder", () => {
  it("places the most likely cells first, ties by id", () => {
    expect(labelOrder({ AA: 0.1, AB: 0.3, AC: 0.3, AD: 0.05 }, ["AA", "AB", "AC", "AD", "AE"])).toEqual(["AB", "AC", "AA", "AD", "AE"]);
  });
});
