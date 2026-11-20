import { describe, expect, it } from "vitest";
import vector from "../../test-vectors/grounding.json";
import { groundReading, type ReportReading } from "../src/index";

const BLANK: ReportReading = {
  kind: "cleared", segmentIds: [], method: "unknown", coverage: null, minutes: null, searchers: null, searchType: "unknown",
  detectionRangeM: null, item: "", feature: "none", direction: "unknown", topColor: "unknown", bottomColor: "unknown",
  footwear: "", carried: "", matchesProfile: "unknown", evidenceQuote: "",
};
const FIELDS = ["topColor", "bottomColor", "direction", "footwear", "carried"] as const;

describe("grounding a reading in its note (shared/test-vectors/grounding.json)", () => {
  for (const field of FIELDS) {
    const cases = vector.cases.filter(c => c.field === field);
    it(`has cases for ${field}`, () => expect(cases.length).toBeGreaterThan(0));
    it.each(cases.map(c => [c.name, c]))(`${field}: %s`, (_name, c) => {
      const reading = { ...BLANK, [field]: c.value } as ReportReading;
      const out = groundReading(reading, c.note);
      expect(out[field]).toBe(c.expected);
      for (const other of FIELDS.filter(f => f !== field)) expect(out[other]).toBe(BLANK[other]);
    });
  }
  it("leaves every other field and the input reading untouched", () => {
    const reading: ReportReading = { ...BLANK, kind: "clue", item: "glove", topColor: "blue", evidenceQuote: "a glove" };
    const out = groundReading(reading, "Found a glove");
    expect(out).toEqual({ ...reading, topColor: "unknown" });
    expect(reading.topColor).toBe("blue");
  });
});
