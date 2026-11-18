import { describe, expect, it } from "vitest";
import { rippleDelayMs, rippleDelays } from "./ripple";

describe("rippleDelayMs", () => {
  it("starts at the point last seen and grows with distance", () => {
    const o = { col: 4, row: 4 };
    expect(rippleDelayMs(o, o)).toBe(0);
    expect(rippleDelayMs({ col: 5, row: 4 }, o)).toBe(25);
    expect(rippleDelayMs({ col: 7, row: 8 }, o)).toBe(125); // distance 5 cells
  });
});

describe("rippleDelays", () => {
  it("delays each centre by its distance from the point last seen, in 125 m cells", () => {
    const origin = { lat: 33.78, lon: -84.38 };
    const north = { lat: origin.lat + 250 / 111_320, lon: origin.lon }; // 2 cells north
    const east = { lat: origin.lat, lon: origin.lon + 375 / (111_320 * Math.cos((origin.lat * Math.PI) / 180)) }; // 3 cells east
    const d = rippleDelays([origin, north, east], origin);
    expect(d[0]).toBe(0);
    expect(d[1]).toBeGreaterThanOrEqual(49);
    expect(d[1]).toBeLessThanOrEqual(51);
    expect(d[2]).toBeGreaterThanOrEqual(74);
    expect(d[2]).toBeLessThanOrEqual(76);
  });
});
