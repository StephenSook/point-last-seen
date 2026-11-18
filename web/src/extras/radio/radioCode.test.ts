import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { convergenceCode } from "../laneC";
import { compareCodes, CROCKFORD, normalizeHeardCode, PHONETIC, spellCode } from "./radioCode";

it("accepts lower case, spaces and hyphens", () => {
  expect(normalizeHeardCode(" k7-q4 ")).toEqual({ ok: true, code: "K7Q4" });
  expect(normalizeHeardCode(" k7 q4 ")).toEqual({ ok: true, code: "K7Q4" });
});

it("reads I and L as 1 and O as 0", () => {
  expect(normalizeHeardCode("io1l")).toEqual({ ok: true, code: "1011" });
});

it("refuses U, symbols and a wrong length", () => {
  expect(normalizeHeardCode("KU7Q")).toEqual({ ok: false, reason: "letter_u" });
  expect(normalizeHeardCode("K7Q")).toEqual({ ok: false, reason: "length" });
  expect(normalizeHeardCode("K7Q*")).toEqual({ ok: false, reason: "symbol" });
  expect(normalizeHeardCode("K7Q\u017f")).toEqual({ ok: false, reason: "symbol" });
});

it("the alphabet is the engine's", () => {
  const seen = new Set<string>();
  for (let index = 0; index < 500; index++) {
    const hash = createHash("sha256").update(String(index)).digest("hex");
    const code = convergenceCode(hash);
    expect(code).toHaveLength(4);
    for (const character of code) {
      expect(CROCKFORD).toContain(character);
      seen.add(character);
    }
  }
  expect(seen).toEqual(new Set(CROCKFORD));
});

it("every character has one phonetic word and the words are unique", () => {
  expect(Object.keys(PHONETIC)).toHaveLength(32);
  expect(new Set(Object.keys(PHONETIC))).toEqual(new Set(CROCKFORD));
  expect(new Set(Object.values(PHONETIC)).size).toBe(32);
  expect(spellCode("AJ0X")).toEqual(["Alfa", "Juliett", "Zero", "Xray"]);
  expect(spellCode("K7Q*")).toEqual([]);
});

it("compareCodes says no_code_here when command has no code yet", () => {
  expect(compareCodes("K7Q4", null)).toBe("no_code_here");
});

it("compares the cleaned code exactly", () => {
  expect(compareCodes(" k7-q4 ", "K7Q4")).toBe("same");
  expect(compareCodes("io1l", "1011")).toBe("same");
  expect(compareCodes("K7Q5", "K7Q4")).toBe("different");
  expect(compareCodes("K7Q", "K7Q4")).toBe("different");
});
