import { describe, expect, it } from "vitest";
import { inventedWords, signRead } from "./photoTruth";

describe("inventedWords", () => {
  it("lists each word of a read that the picture does not show, once, ignoring case and punctuation", () => {
    expect(inventedWords("Pine Ridge Trail, 2.4 mi", ["PINE RIDGE TRAIL", "2.4 MI"])).toEqual([]);
    expect(inventedWords("PINE RIDGE LOOP loop", ["PINE RIDGE TRAIL"])).toEqual(["LOOP"]);
    expect(inventedWords("Oak Street", [])).toEqual(["OAK", "STREET"]);
    expect(inventedWords("", [])).toEqual([]);
  });
});

describe("signRead", () => {
  it("says whether a read carries all, some or none of the sign's words", () => {
    expect(signRead("Pine Ridge Trail 2.4 MI", ["PINE RIDGE TRAIL", "2.4 MI"])).toBe("all");
    expect(signRead("PINE RIDGE", ["PINE RIDGE TRAIL", "2.4 MI"])).toBe("some");
    expect(signRead("", ["MAPLE AVE"])).toBe("none");
  });
  it("has nothing to read when the picture has no text", () => {
    expect(signRead("anything", [])).toBe("no-text");
  });
});
