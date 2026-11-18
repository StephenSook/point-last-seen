import { describe, expect, it } from "vitest";
import { rippleDelayMs } from "./ripple";

describe("rippleDelayMs", () => {
  it("starts at the point last seen and grows with distance", () => {
    const o = { col: 4, row: 4 };
    expect(rippleDelayMs(o, o)).toBe(0);
    expect(rippleDelayMs({ col: 5, row: 4 }, o)).toBe(25);
    expect(rippleDelayMs({ col: 7, row: 8 }, o)).toBe(125); // distance 5 cells
  });
});
