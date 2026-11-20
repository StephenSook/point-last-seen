// The shared phone-number cases (shared/test-vectors/phone-numbers.json, contract in its README) run against
// the web's scrubber. A case that names "web" in pendingOn is skipped: the web rule does not pass it yet.
// PLS_FORCE_PENDING=1 runs those too, to see how far the web rule is from passing them.

import { describe, expect, it } from "vitest";
import vectors from "../../../shared/test-vectors/phone-numbers.json";
import { removePhoneNumbers } from "./sightings";

type Base = { name: string; input: string; pendingOn?: string[] };
type MustRemove = Base & { number: string; forbidden: string[]; keep: string[] };
type Exact = Base & { output: string };

const forced = process.env["PLS_FORCE_PENDING"] === "1";
const runs = (c: Base) => forced || !(c.pendingOn ?? []).includes("web");
// A number character in any script: decimal digits, letter-like numerals and other numerals (circled, fractions).
const ANY_DIGIT = /[\p{Nd}\p{Nl}\p{No}]/u;
const v = vectors as unknown as { replacement: string; mustRemove: MustRemove[]; mustKeep: Base[]; exact: Exact[] };

describe("shared phone-number cases on the web scrubber", () => {
  it("the file has every case type, and the web runs at least one case of each", () => {
    expect(v.replacement).toBe("[number removed]");
    for (const cases of [v.mustRemove, v.mustKeep, v.exact] as Base[][]) {
      expect(cases.length).toBeGreaterThan(0);
      expect(cases.filter(runs).length).toBeGreaterThan(0);
    }
  });

  for (const c of v.mustRemove.filter(runs)) {
    it(`removes: ${c.name}`, () => {
      const out = removePhoneNumbers(c.input);
      expect(out).not.toContain(c.number);
      expect(out).not.toMatch(ANY_DIGIT);
      for (const f of c.forbidden) expect(out.toLowerCase()).not.toContain(f.toLowerCase());
      for (const k of c.keep) expect(out).toContain(k);
    });
  }

  for (const c of v.mustKeep.filter(runs)) {
    it(`keeps: ${c.name}`, () => {
      expect(removePhoneNumbers(c.input)).toBe(c.input);
    });
  }

  for (const c of v.exact.filter(runs)) {
    it(`exact: ${c.name}`, () => {
      expect(removePhoneNumbers(c.input)).toBe(c.output);
    });
  }
});
