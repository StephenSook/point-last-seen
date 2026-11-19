import { DEFAULT_PARAMS } from "@pls/engine";
import { describe, expect, it } from "vitest";
import params from "../../../shared/constants/engine-params.json";
import { RING_SAMPLE, TERRAINS, ringSourceLine } from "./terrains";

describe("terrain choices", () => {
  it("list urban first, then flat, then mountain", () => {
    expect(TERRAINS.map(([v]) => v)).toEqual(["urban", "temperate_flat", "temperate_mountain"]);
    expect(TERRAINS[0]![1]).toBe("Urban (suburb, town, big park)");
  });

  it("carry each column's sample size as the shared source states it", () => {
    const source = Object.values(params as Record<string, unknown>)
      .flatMap((v) => (v && typeof v === "object" ? Object.values(v as Record<string, unknown>) : []))
      .find((v): v is string => typeof v === "string" && v.startsWith("SOURCED: ISRID dementia distance"));
    expect(source).toBeDefined();
    for (const [name, key] of [["urban", "urban"], ["temperate flat", "temperate_flat"], ["temperate mountain", "temperate_mountain"]] as const) {
      const m = new RegExp(`${name} n = (\\d+)`).exec(source!);
      expect(m, name).not.toBeNull();
      expect(RING_SAMPLE[key]).toBe(Number(m![1]));
    }
  });

  it("name the column in use on the source line", () => {
    expect(ringSourceLine("urban")).toBe("Urban rings, ISRID dementia (n = 336), measured in a straight line.");
    expect(ringSourceLine("temperate_flat")).toBe("Temperate flat rings, ISRID dementia (n = 175), measured in a straight line.");
    expect(ringSourceLine("temperate_mountain")).toBe("Temperate mountain rings, ISRID dementia (n = 95), measured in a straight line.");
  });
});

describe("the source line with stored radii", () => {
  it("credits ISRID only while the stored radii are the sourced ones", () => {
    expect(ringSourceLine("urban", DEFAULT_PARAMS.rings.urban)).toBe("Urban rings, ISRID dementia (n = 336), measured in a straight line.");
  });
  it("says custom radii, and shows them, when they differ", () => {
    expect(ringSourceLine("urban", [0.5, 1, 2.5, 10])).toBe("Urban rings, custom radii (0.5, 1, 2.5, 10 km), not the ISRID table, measured in a straight line.");
  });
});

describe("the source line with stored radii the engine cannot use", () => {
  const invalid = "Urban rings: the radii stored for this incident are not valid settings (4 increasing positive distances are needed).";
  it("says invalid settings instead of throwing for a column that is not a list", () => {
    for (const bad of ["1,2,3", null, { a: 1 }, 7]) expect(ringSourceLine("urban", bad)).toBe(invalid);
  });
  it("says invalid settings for an empty, short, non-finite, non-positive or unordered column", () => {
    for (const bad of [[], [1, 2, 3], [1, Number.NaN, 2, 3], [1, 2, 3, Number.POSITIVE_INFINITY], [0, 1, 2, 3], [3, 2, 1, 0.5]]) {
      expect(ringSourceLine("urban", bad)).toBe(invalid);
    }
  });
});
