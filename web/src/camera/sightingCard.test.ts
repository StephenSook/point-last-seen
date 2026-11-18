import { describe, expect, it } from "vitest";
import { cardFacts, compassName } from "./SightingCard";

const s = {
  personVisible: true, firstSeen: "00:03", lastSeen: "00:12", entryEdge: "right" as const, exitEdge: "left" as const,
  topColor: "blue", bottomColor: "black", topType: "rain jacket", footwear: "boots", headwear: "",
  carriedItems: ["umbrella"], keyFrame: { time: "00:07", box2d: [100, 200, 900, 400] },
  lighting: "day" as const, legibility: "clear" as const, evidence: "x",
};
const START = Date.UTC(2026, 10, 22, 14, 5, 0);

describe("compassName", () => {
  it("names the eight points", () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(compassName)).toEqual(["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]);
  });
});

describe("cardFacts", () => {
  it("gives the last-seen time from the clip start, the heading and the clothing", () => {
    expect(cardFacts(s, START, 0, false, "UTC")).toEqual({ time: "Last seen 14:05:12", direction: "Heading north", clothing: "Blue rain jacket, black bottoms, boots, carrying umbrella" });
  });
  it("says when there is no direction, and leaves out what is not known", () => {
    const f = cardFacts({ ...s, topColor: "unknown", footwear: "", carriedItems: [] }, START, null, false, "UTC");
    expect(f.direction).toBe("Direction not known");
    expect(f.clothing).toBe("Rain jacket, black bottoms");
  });
  it("says colors were not read in night infrared", () => {
    const f = cardFacts({ ...s, topColor: "unknown", bottomColor: "unknown" }, START, 270, true, "UTC");
    expect(f.clothing).toBe("Rain jacket, boots, carrying umbrella (night: no colors)");
    expect(f.direction).toBe("Heading west");
  });
});
