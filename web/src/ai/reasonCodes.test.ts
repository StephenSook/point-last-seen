import { describe, expect, it } from "vitest";
import { planFacts, renderReason, renderSummary, ringBand, teamFacts, type PlanFacts } from "./reasonCodes";
import type { PlanDraft } from "./replanWording";

const rank = [
  { segmentId: "AC", rank: 1, poa: 0.31, priorPoa: 0.2, deltaPoa: 0.11 },
  { segmentId: "AB", rank: 2, poa: 0.22, priorPoa: 0.25, deltaPoa: -0.03 },
  { segmentId: "CC", rank: 3, poa: 0.1, priorPoa: 0.08, deltaPoa: 0.02 },
  { segmentId: "AD", rank: 4, poa: 0.05, priorPoa: 0.05, deltaPoa: 0 },
];
const base: PlanDraft = {
  eventSetHash: "a".repeat(64),
  priorVersion: 2,
  rank,
  assignments: [
    { teamId: "T1", segmentIds: ["AC", "CC"] },
    { teamId: "T2", segmentIds: ["AB", "AD"] },
    { teamId: "T3", segmentIds: [] },
  ],
};
const facts: PlanFacts = {
  AC: { featureClasses: ["trail", "stream"], searched: false, raisedByLastReport: true, ring: { innerKm: 0.3, outerKm: 1, fromPct: 25, toPct: 50 } },
  CC: { featureClasses: ["trail"], searched: true, raisedByLastReport: false, ring: null },
  AB: { featureClasses: ["road", "structure"], searched: true, raisedByLastReport: false, ring: { innerKm: 0, outerKm: 0.3, fromPct: 0, toPct: 25 } },
  AD: { featureClasses: ["water"], searched: false, raisedByLastReport: false, ring: null },
};
const draft: PlanDraft = { ...base, facts };
const codesOf = (d: PlanDraft, teamId: string) => [...(teamFacts(d).get(teamId)?.keys() ?? [])];

describe("each team's facts come from its own segments only", () => {
  it("without segment facts, a team has only the ranking's facts", () => {
    expect(codesOf(base, "T1")).toEqual(["highest_poa", "top_three", "poa_rose", "poa_now"]);
    expect(teamFacts(base).get("T1")!.get("top_three")).toEqual(["CC"]);
    expect(codesOf(base, "T2")).toEqual(["top_three", "poa_now"]);
  });
  it("with segment facts, adds features, searched or not, the newest report and the distance band", () => {
    const t1 = teamFacts(draft).get("T1")!;
    expect(Object.fromEntries(t1)).toEqual({
      highest_poa: ["AC"], top_three: ["CC"], poa_rose: ["AC", "CC"], poa_now: ["AC", "CC"],
      not_yet_searched: ["AC"], searched_still_high: ["CC"], moved_by_last_report: ["AC"],
      near_trail: ["AC", "CC"], near_stream: ["AC"], in_ring: ["AC"],
    });
    const t2 = teamFacts(draft).get("T2")!;
    expect(Object.fromEntries(t2)).toEqual({
      top_three: ["AB"], poa_now: ["AB", "AD"], not_yet_searched: ["AD"], searched_still_high: ["AB"],
      near_road: ["AB"], near_water: ["AD"], near_building: ["AB"], in_ring: ["AB"],
    });
  });
  it("never offers the top three for the segment with the highest POA, which says it already", () => {
    expect(teamFacts(draft).get("T1")!.get("top_three")).toEqual(["CC"]);
    const onlyTop: PlanDraft = { ...base, assignments: [{ teamId: "T1", segmentIds: ["AC"] }] };
    expect(codesOf(onlyTop, "T1")).not.toContain("top_three");
  });
  it("a team with no segment has no facts", () => {
    expect(teamFacts(draft).has("T3")).toBe(false);
  });
  it("a searched segment outside the top three is neither searched-still-high nor not-yet-searched", () => {
    const d: PlanDraft = { ...draft, facts: { ...facts, AD: { ...facts.AD!, searched: true } } };
    expect(codesOf(d, "T2")).not.toContain("not_yet_searched");
    expect(teamFacts(d).get("T2")!.get("searched_still_high")).toEqual(["AB"]);
  });
});

describe("code writes each reason from the chosen facts", () => {
  it("renders each fact from the plan's own values", () => {
    expect(renderReason(draft, "T1", ["highest_poa"])).toBe("AC has the highest POA, 31.0%.");
    expect(renderReason(draft, "T1", ["top_three"])).toBe("CC is in the top three by POA.");
    expect(renderReason(draft, "T1", ["poa_rose"])).toBe("AC and CC rose since the starting map; AC from 20.0% to 31.0%.");
    expect(renderReason(draft, "T1", ["poa_now"])).toBe("POA now AC 31.0%, CC 10.0%.");
    expect(renderReason(draft, "T1", ["not_yet_searched"])).toBe("AC has not been searched yet.");
    expect(renderReason(draft, "T1", ["searched_still_high"])).toBe("CC was searched and is still in the top three.");
    expect(renderReason(draft, "T1", ["moved_by_last_report"])).toBe("The newest report raised AC.");
    expect(renderReason(draft, "T1", ["near_trail"])).toBe("AC and CC are near a trail.");
    expect(renderReason(draft, "T1", ["near_stream"])).toBe("AC is near a stream.");
    expect(renderReason(draft, "T1", ["in_ring"])).toBe("AC is 0.3 to 1.0 km from the last-seen point, in the ISRID 25 to 50% distance band.");
    expect(renderReason(draft, "T2", ["in_ring"])).toBe("AB is within 0.3 km of the last-seen point, in the ISRID first 25% distance band.");
    expect(renderReason(draft, "T2", ["near_road", "near_building"])).toBe("AB is near a road. AB is near a building.");
    expect(renderReason(draft, "T2", ["near_water"])).toBe("AD is near water.");
  });
  it("joins two chosen facts in the order chosen", () => {
    expect(renderReason(draft, "T1", ["not_yet_searched", "highest_poa"])).toBe("AC has not been searched yet. AC has the highest POA, 31.0%.");
  });
  it("names at most three segments, then counts the rest", () => {
    const ids = ["AA", "AB", "AC", "AD", "AE", "AF"];
    const d: PlanDraft = {
      eventSetHash: "x", priorVersion: 1,
      rank: ids.map((segmentId, i) => ({ segmentId, rank: i + 1, poa: 0.1, priorPoa: 0.05, deltaPoa: 0.05 })),
      assignments: [{ teamId: "T1", segmentIds: ids }],
      facts: Object.fromEntries(ids.map((id) => [id, { featureClasses: ["trail"], searched: false, raisedByLastReport: true, ring: null }])),
    };
    expect(renderReason(d, "T1", ["near_trail"])).toBe("AA, AB, AC and 3 more are near a trail.");
  });
  it("a reason always fits the 200 characters a plan doc allows", () => {
    const ids = ["SEGMENT0000000A", "SEGMENT0000000B", "SEGMENT0000000C", "SEGMENT0000000D", "SEGMENT0000000E", "SEGMENT0000000F"];
    const d: PlanDraft = {
      eventSetHash: "x", priorVersion: 1,
      rank: ids.map((segmentId, i) => ({ segmentId, rank: i + 1, poa: 0.1234, priorPoa: 0.0567, deltaPoa: 0.0667 })),
      assignments: [{ teamId: "T1", segmentIds: ids }],
      facts: Object.fromEntries(ids.map((id) => [id, { featureClasses: ["trail", "road", "stream", "water", "structure"], searched: true, raisedByLastReport: true, ring: { innerKm: 12.8, outerKm: 99.9, fromPct: 75, toPct: 95 } }])),
    };
    const codes = [...teamFacts(d).get("T1")!.keys()];
    for (const a of codes) for (const b of codes) if (a !== b) expect(renderReason(d, "T1", [a, b]).length, `${a} ${b}`).toBeLessThanOrEqual(200);
  });
});

describe("the summary is written from the same choices", () => {
  it("lists each team's task and its rendered reason, and a team with no segment says so", () => {
    const choices = new Map([["T1", ["highest_poa" as const]], ["T2", ["near_road" as const]]]);
    expect(renderSummary(draft, choices)).toBe(
      "T1 searches AC, CC: AC has the highest POA, 31.0%. T2 searches AB, AD: AB is near a road. T3 has no segment left to assign.",
    );
  });
});

describe("the distance band a segment's centre falls in", () => {
  const radii = [0.3, 1.0, 2.4, 12.8];
  const masses = [0.25, 0.25, 0.25, 0.2];
  it("gives the band's inner and outer km and its ISRID percentages", () => {
    expect(ringBand(0.1, radii, masses)).toEqual({ innerKm: 0, outerKm: 0.3, fromPct: 0, toPct: 25 });
    expect(ringBand(1.5, radii, masses)).toEqual({ innerKm: 1, outerKm: 2.4, fromPct: 50, toPct: 75 });
    expect(ringBand(12.8, radii, masses)).toEqual({ innerKm: 2.4, outerKm: 12.8, fromPct: 75, toPct: 95 });
  });
  it("is none beyond the last ring, or with rings that do not match their masses", () => {
    expect(ringBand(13, radii, masses)).toBeNull();
    expect(ringBand(1, radii, [0.5, 0.5])).toBeNull();
  });
});

describe("planFacts reads each segment's facts from what the command post already has", () => {
  const segments = [
    { segmentId: "AC", centroid: { lat: 34.0, lon: -84.0 }, featureClasses: ["trail" as const] },
    { segmentId: "AB", centroid: { lat: 34.0, lon: -84.02 } },
  ];
  it("copies features, marks searched from cumulative POD, and the segments the newest report raised", () => {
    const f = planFacts({ segments, cumulativePod: { AC: 0, AB: 0.4 }, raisedIds: ["AC"], ring: null });
    expect(f).toEqual({
      AC: { featureClasses: ["trail"], searched: false, raisedByLastReport: true, ring: null },
      AB: { featureClasses: [], searched: true, raisedByLastReport: false, ring: null },
    });
  });
  it("adds the distance band from the last-seen point when the map uses the ring model", () => {
    const f = planFacts({
      segments, cumulativePod: {}, raisedIds: [],
      ring: { ipp: { lat: 34.0, lon: -84.0 }, radiiKm: [0.3, 1.0, 2.4, 12.8], masses: [0.25, 0.25, 0.25, 0.2] },
    });
    expect(f.AC!.ring).toEqual({ innerKm: 0, outerKm: 0.3, fromPct: 0, toPct: 25 });
    expect(f.AB!.ring).toEqual({ innerKm: 1, outerKm: 2.4, fromPct: 50, toPct: 75 });
  });
});
