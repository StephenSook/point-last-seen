import { describe, expect, it } from "vitest";
import { harnessRun } from "./testdata/replayIncident";
import { runNumbers, runNumbersLine } from "./runNumbers";

describe("runNumbers", () => {
  it("counts the run's events, its distinct plan versions and its search segments (not ROW)", () => {
    const run = harnessRun();
    const n = runNumbers(run);
    expect(n).toEqual({
      events: run.events.length,
      planVersions: new Set(run.plans.map((p) => p.version)).size,
      searchSegments: run.segments.filter((s) => s.segmentId !== "ROW").length,
    });
  });
  it("counts a repeated plan version once", () => {
    const run = harnessRun();
    const plans = [...run.plans, run.plans[0]];
    expect(runNumbers({ ...run, plans })?.planVersions).toBe(new Set(run.plans.map((p) => p.version)).size);
  });
  it("leaves ROW, the area outside the grid, out of the search segments", () => {
    expect(runNumbers({ events: [], plans: [], segments: [{ segmentId: "AA" }, { segmentId: "ROW" }, { segmentId: "AB" }] })?.searchSegments).toBe(2);
  });
  it("reads nothing from a value that is not a run", () => {
    expect(runNumbers(null)).toBeNull();
    expect(runNumbers({ events: "x", plans: [], segments: [] })).toBeNull();
  });
});

describe("runNumbersLine", () => {
  it("says each count with its unit, singular for one", () => {
    expect(runNumbersLine({ events: 24, planVersions: 18, searchSegments: 67 })).toBe("24 events, 18 plan versions and 67 search segments in this run.");
    expect(runNumbersLine({ events: 1, planVersions: 1, searchSegments: 1 })).toBe("1 event, 1 plan version and 1 search segment in this run.");
  });
});
