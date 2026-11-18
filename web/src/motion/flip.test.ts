import { describe, expect, it } from "vitest";
import { flipOffsets } from "./flip";

describe("flipOffsets", () => {
  it("gives each row that moved the distance from its old place to its new one", () => {
    const before = new Map([["AA", 0], ["AB", 24], ["AC", 48]]);
    const after = new Map([["AC", 0], ["AA", 24], ["AB", 48]]);
    expect(flipOffsets(before, after)).toEqual([
      { id: "AC", dy: 48 },
      { id: "AA", dy: -24 },
      { id: "AB", dy: -24 },
    ]);
  });

  it("leaves out rows that did not move and rows that are new", () => {
    expect(flipOffsets(new Map([["AA", 0]]), new Map([["AA", 0], ["AD", 24]]))).toEqual([]);
  });
});
