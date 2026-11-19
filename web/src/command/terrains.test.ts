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
