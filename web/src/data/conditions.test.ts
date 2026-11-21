import { describe, expect, it } from "vitest";
import urgency from "../../../shared/constants/urgency.json";
import { conditionsOf, parseConditions, urgencyChip, URGENCY_SOURCE_LINE } from "./conditions";

describe("the incident's typed conditions", () => {
  it("reads a temperature, a wet answer and the time they were typed", () => {
    expect(parseConditions("38", false, 1000)).toEqual({ ok: true, conditions: { tempF: 38, wet: false, setAtMs: 1000 } });
    expect(parseConditions(" 41.5 ", true, 5)).toEqual({ ok: true, conditions: { tempF: 41.5, wet: true, setAtMs: 5 } });
    expect(parseConditions("-12", null, 5)).toEqual({ ok: true, conditions: { tempF: -12, wet: null, setAtMs: 5 } });
  });

  it("keeps an empty temperature as not known", () => {
    expect(parseConditions("  ", true, 7)).toEqual({ ok: true, conditions: { tempF: null, wet: true, setAtMs: 7 } });
  });

  it("refuses a temperature that is not a number from -80 to 140, as the rules do", () => {
    for (const bad of ["abc", "38F", "141", "-81", "1e3", "NaN", "Infinity"]) {
      const r = parseConditions(bad, false, 1);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.message).toBe("Type the temperature as a number from -80 to 140.");
    }
  });

  it("reads conditions from the incident only when they have the shared shape", () => {
    expect(conditionsOf({ conditions: { tempF: 38, wet: false, setAtMs: 9 } })).toEqual({ tempF: 38, wet: false, setAtMs: 9 });
    expect(conditionsOf({ conditions: { tempF: null, wet: null, setAtMs: 0 } })).toEqual({ tempF: null, wet: null, setAtMs: 0 });
    expect(conditionsOf({})).toBeNull();
    expect(conditionsOf(null)).toBeNull();
    expect(conditionsOf({ conditions: { tempF: "38", wet: false, setAtMs: 9 } })).toBeNull();
    expect(conditionsOf({ conditions: { tempF: 38, wet: "no", setAtMs: 9 } })).toBeNull();
    expect(conditionsOf({ conditions: { tempF: 38, wet: false } })).toBeNull();
  });

  it("names the phones' urgency chip with the same words and rule as the iPhone", () => {
    expect(urgencyChip({ tempF: 40, wet: false, setAtMs: 1 })).toBe("Cold raises urgency");
    expect(urgencyChip({ tempF: 41, wet: true, setAtMs: 1 })).toBe("Cool and wet raises urgency");
    expect(urgencyChip({ tempF: 41, wet: false, setAtMs: 1 })).toBeNull();
    expect(urgencyChip({ tempF: null, wet: true, setAtMs: 1 })).toBeNull();
    expect(urgencyChip(null)).toBeNull();
  });

  it("cites the chip's source the way the iPhone does", () => {
    expect(URGENCY_SOURCE_LINE).toBe(`CDC: "${urgency.quote}" (read ${urgency.readOn})`);
  });
});
