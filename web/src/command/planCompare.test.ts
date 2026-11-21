import type { RankedSegment } from "@pls/engine";
import { describe, expect, it } from "vitest";
import { planCompare } from "./planCompare";

const rank = (poa: Record<string, number>): RankedSegment[] =>
  Object.entries(poa).map(([segmentId, p], i) => ({ segmentId, rank: i + 1, poa: p, priorPoa: p, deltaPoa: 0 }));

describe("planCompare: the approved plan and a suggested one, team by team, on the current map", () => {
  const r = rank({ CC: 0.014, CD: 0.0139, AE: 0.006, AD: 0.004 });

  it("pairs each team's segments now and suggested, with the probability each holds on the current map", () => {
    const c = planCompare([{ teamId: "T1", segmentIds: ["AE"] }, { teamId: "T2", segmentIds: ["AD"] }], [{ teamId: "T1", segmentIds: ["CC"] }, { teamId: "T2", segmentIds: ["CD"] }], r);
    expect(c.rows).toEqual([
      { teamId: "T1", now: ["AE"], next: ["CC"], nowPoa: 0.006, nextPoa: 0.014, changed: true },
      { teamId: "T2", now: ["AD"], next: ["CD"], nowPoa: 0.004, nextPoa: 0.0139, changed: true },
    ]);
    expect(c.nowTotal).toBeCloseTo(0.01, 9);
    expect(c.nextTotal).toBeCloseTo(0.0279, 9);
  });

  it("marks a team whose segments stay the same, and lists a team only one plan names", () => {
    const c = planCompare([{ teamId: "T1", segmentIds: ["CC"] }], [{ teamId: "T1", segmentIds: ["CC"] }, { teamId: "T2", segmentIds: ["CD"] }], r);
    expect(c.rows.map((x) => [x.teamId, x.now, x.next, x.changed])).toEqual([
      ["T1", ["CC"], ["CC"], false],
      ["T2", [], ["CD"], true],
    ]);
  });

  it("counts a segment two teams share once in a plan's total, and a segment off the map as 0", () => {
    const c = planCompare([], [{ teamId: "T1", segmentIds: ["CC", "ZZ"] }, { teamId: "T2", segmentIds: ["CC"] }], r);
    expect(c.rows[0]!.nextPoa).toBeCloseTo(0.014, 9);
    expect(c.nextTotal).toBeCloseTo(0.014, 9);
    expect(c.nowTotal).toBe(0);
  });
});
