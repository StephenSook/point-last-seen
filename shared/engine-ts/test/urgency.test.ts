// P-12 urgency chip (coordinator ruling): typed temperature and typed wet yes/no; clothing does not enter.
import { describe, expect, it } from "vitest";
import constants from "../../constants/urgency.json";
import vectors from "../../test-vectors/urgency.json";
import { urgencyLevel } from "../src/index";

describe("urgency chip", () => {
  it("cites the CDC sentence it rests on, with the date it was read", () => {
    expect(constants.coldF).toBe(40);
    expect(constants.sourceUrl).toBe("https://www.cdc.gov/winter-weather/prevention/index.html");
    expect(constants.quote).toContain("(above 40°F) if a person becomes chilled from rain, sweat, or submersion in cold water.");
    expect(constants.readOn).toBe("2026-11-18");
  });
  it("has the agreed cases", () => {
    expect(vectors.cases.map(c => c.name)).toEqual(["40F_dry_cold", "41F_wet_cool_wet", "41F_dry_none", "39F_wet_cold",
      "40F_wet_cold", "no_temperature_none", "wet_unanswered_counts_dry"]);
  });
  for (const c of vectors.cases) {
    it(c.name, () => expect(urgencyLevel(c.input.tempF, c.input.wet)).toBe(c.expected));
  }
});
