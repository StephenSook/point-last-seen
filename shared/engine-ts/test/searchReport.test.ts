import { describe, expect, it } from "vitest";
import vector from "../../test-vectors/search-report.json";
import { readsAsSearchReport, SEARCH_REPORT_LINE } from "../src/index";

type Case = { name: string; note: string; report: boolean; clause: string };
const cases = vector.cases as Case[];

describe("whether a sighting note reads as a search report (shared/test-vectors/search-report.json)", () => {
  it("has reports and sightings, the line the form shows, and a case on each side of every clause that has two", () => {
    expect(vector.line).toBe(SEARCH_REPORT_LINE);
    for (const clause of ["result_phrase", "segment_done", "found_negated", "negation", "pronoun", "whole_words"]) {
      const sides = new Set(cases.filter((c) => c.clause === clause).map((c) => c.report));
      expect(sides, clause).toEqual(new Set([true, false]));
    }
  });

  it.each(cases.map((c) => [c.name, c]))("%s", (_name, c) => {
    expect(readsAsSearchReport(c.note)).toBe(c.report);
  });
});
