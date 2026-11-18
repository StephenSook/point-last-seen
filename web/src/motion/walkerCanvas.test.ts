import { describe, expect, it } from "vitest";
import { cohortReleaseMs, walkerFrame, type Track } from "./walkerCanvas";

describe("walker frames", () => {
  it("walkers are positions computed from tracks, released in cohorts", () => {
    expect(cohortReleaseMs(0)).toBe(0);
    expect(cohortReleaseMs(24)).toBe(0);
    expect(cohortReleaseMs(25)).toBe(100);
    expect(cohortReleaseMs(299)).toBe(1100);
    const t: Track = { pts: [[0, 0], [10, 0]], releaseMs: 100, durationMs: 1000 };
    expect(walkerFrame([t], 50)[0]).toEqual({ x: 0, y: 0, done: false });
    expect(walkerFrame([t], 600)[0]!.x).toBeCloseTo(5, 6);
    expect(walkerFrame([t], 2000)[0]).toEqual({ x: 10, y: 0, done: true });
  });

  it("moves at even speed along a bent track", () => {
    const t: Track = { pts: [[0, 0], [10, 0], [10, 10]], releaseMs: 0, durationMs: 2000 };
    expect(walkerFrame([t], 1500)[0]).toEqual({ x: 10, y: 5, done: false });
  });
});
