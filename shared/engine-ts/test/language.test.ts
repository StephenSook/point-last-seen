import { describe, expect, it } from "vitest";
import vector from "../../test-vectors/language.json";
import wordsFile from "../../constants/language-words.json";
import { looksEnglish } from "../src/index";

describe("language screen (shared/test-vectors/language.json)", () => {
  it.each(vector.mustAllow.map(c => [c.name, c.input]))("allows %s", (_name, input) => {
    expect(looksEnglish(input)).toBe(true);
  });
  it.each(vector.mustRefuse.map(c => [c.name, c.input]))("refuses %s", (_name, input) => {
    expect(looksEnglish(input)).toBe(false);
  });
  it.each(vector.knownMiss.map(c => [c.name, c.input]))("lets the known miss %s through, as every platform does", (_name, input) => {
    expect(looksEnglish(input)).toBe(true);
  });
  it("keeps the two word lists apart, so one word never counts both ways", () => {
    const english = new Set(wordsFile.english);
    expect(wordsFile.foreign.filter(w => english.has(w))).toEqual([]);
  });
  it("allows a note with no words at all (only numbers or ids)", () => {
    expect(looksEnglish("")).toBe(true);
    expect(looksEnglish("14:03 80%")).toBe(true);
  });
});
