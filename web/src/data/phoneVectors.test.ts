// The shared phone-number cases (shared/test-vectors/phone-numbers.json, contract in its README) run against
// the web's scrubber. A case that names "web" in pendingOn must still fail here: once the web rule passes it, the
// test says "un-pend <name>", so a stale mark never hides a fixed case. PLS_FORCE_PENDING=1 runs those cases as
// ordinary ones, to see how far the web rule is from passing them.

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

type Case = { kind: "mustRemove"; c: MustRemove } | { kind: "mustKeep"; c: Base } | { kind: "exact"; c: Exact };

/** Whether the web rule passes a case, by the same contract the per-case tests below hold it to. */
function passes(x: Case): boolean {
  const out = removePhoneNumbers(x.c.input);
  if (x.kind === "mustKeep") return out === x.c.input;
  if (x.kind === "exact") return out === x.c.output;
  return !out.includes(x.c.number) && !ANY_DIGIT.test(out)
    && x.c.forbidden.every((f) => !out.toLowerCase().includes(f.toLowerCase())) && x.c.keep.every((k) => out.includes(k));
}

/** The cases marked pending on the web that it passes after all, each as the line that says what to do. */
function stalePending(cases: Case[]): string[] {
  return cases.filter((x) => (x.c.pendingOn ?? []).includes("web") && passes(x)).map((x) => `un-pend ${x.c.name}`);
}

const all: Case[] = [
  ...v.mustRemove.map((c) => ({ kind: "mustRemove" as const, c })),
  ...v.mustKeep.map((c) => ({ kind: "mustKeep" as const, c })),
  ...v.exact.map((c) => ({ kind: "exact" as const, c })),
];

describe("shared phone-number cases on the web scrubber", () => {
  it("the file has every case type, and the web runs at least one case of each", () => {
    expect(v.replacement).toBe("[number removed]");
    for (const cases of [v.mustRemove, v.mustKeep, v.exact] as Base[][]) {
      expect(cases.length).toBeGreaterThan(0);
      expect(cases.filter(runs).length).toBeGreaterThan(0);
    }
  });

  it("every case pending on the web still fails here", () => {
    expect(stalePending(all)).toEqual([]);
  });

  it("the pending check catches a case the web already passes", () => {
    const fixed: Case = { kind: "mustKeep", c: { name: "already_fixed", input: "Seen at 14:03 near the creek.", pendingOn: ["web"] } };
    const broken: Case = { kind: "exact", c: { name: "still_broken", input: "Call 404 555 0142", output: "Call 404 555 0142", pendingOn: ["web"] } };
    const elsewhere: Case = { kind: "mustKeep", c: { name: "pending_on_ios", input: "Seen at 14:03.", pendingOn: ["ios"] } };
    expect(stalePending([fixed, broken, elsewhere])).toEqual(["un-pend already_fixed"]);
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
