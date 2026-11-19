import { describe, expect, it } from "vitest";
import { KEY_LABELS, keyIds, labelsDense } from "./labelDensity";

describe("labelsDense", () => {
  it("is true when the typical cell is too narrow on screen for its code and percent", () => {
    expect(labelsDense([30, 34, 38, 200])).toBe(true);
    expect(labelsDense([60, 70, 80])).toBe(false);
    expect(labelsDense([])).toBe(false);
  });
});

describe("keyIds", () => {
  it("names the most likely cells, ties by id, so they keep their labels on a crowded map", () => {
    const poa = { AA: 0.1, AB: 0.3, AC: 0.3, AD: 0.05 };
    expect([...keyIds(poa, ["AA", "AB", "AC", "AD"], 2)]).toEqual(["AB", "AC"]);
    expect(KEY_LABELS).toBe(8);
  });
});
