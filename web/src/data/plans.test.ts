import { describe, expect, it } from "vitest";
import type { RouteRecord } from "@pls/engine";
import { localDraft, nextPlanVersion, planChange, planDocFor, planDocId } from "./plans";
import type { PlanDraft } from "../ai/replanWording";

const draft: PlanDraft = {
  eventSetHash: "b".repeat(64),
  priorVersion: 3,
  rank: [
    { segmentId: "AC", rank: 1, poa: 0.31, priorPoa: 0.2, deltaPoa: 0.11 },
    { segmentId: "AB", rank: 2, poa: 0.22, priorPoa: 0.25, deltaPoa: -0.03 },
  ],
  assignments: [
    { teamId: "T1", segmentIds: ["AC"] },
    { teamId: "T2", segmentIds: ["AB"] },
  ],
};
const wording = {
  assignments: [
    { teamId: "T2", taskText: "Search AB.", reason: "Second." },
    { teamId: "T1", taskText: "Search AC.", reason: "Highest." },
  ],
  summary: "s",
};
const route: RouteRecord = { platform: "web", path: "cloud", stage: "sdk", model: "gemini-3.5-flash-lite", reason: "sdk_prefer_in_cloud", latencyMs: 900, sdkReported: true, blocked: null, decidedAtMs: 5 };

describe("planDocFor", () => {
  it("takes segments from the draft and words from the wording, per team, in draft order", () => {
    const p = planDocFor(draft, wording, route, 4, "uid-command", 1234);
    expect(p.assignments).toEqual([
      { teamId: "T1", segmentIds: ["AC"], taskText: "Search AC.", reason: "Highest." },
      { teamId: "T2", segmentIds: ["AB"], taskText: "Search AB.", reason: "Second." },
    ]);
  });

  it("carries exactly the plan schema's fields", () => {
    const p = planDocFor(draft, wording, route, 4, "uid-command", 1234);
    expect(Object.keys(p).sort()).toEqual(["approvedAt", "approvedByUid", "assignments", "basedOnEventSetHash", "createdClientTimeMs", "priorVersion", "version", "wordingRoute"]);
    expect(p).toMatchObject({ version: 4, basedOnEventSetHash: draft.eventSetHash, priorVersion: 3, wordingRoute: route, approvedByUid: "uid-command", createdClientTimeMs: 1234 });
  });

  it("refuses wording for other teams rather than write a mismatched plan", () => {
    expect(() => planDocFor(draft, { assignments: [wording.assignments[0]!], summary: "" }, route, 4, "u", 1)).toThrow(/T1/);
  });
});

describe("plan versions", () => {
  it("numbers the next plan after the highest existing one", () => {
    expect(nextPlanVersion([])).toBe(1);
    expect(nextPlanVersion([1, 3, 2])).toBe(4);
  });

  it("names plan documents with four digits", () => {
    expect(planDocId(1)).toBe("0001");
    expect(planDocId(42)).toBe("0042");
  });
});

describe("localDraft", () => {
  it("computes the same assignments the server draft would, from the rank and the teams", () => {
    const d = localDraft("b".repeat(64), 3, draft.rank, ["T1", "T2"], []);
    expect(d.assignments).toEqual(draft.assignments);
    expect(d.eventSetHash).toBe(draft.eventSetHash);
  });
});

describe("planChange", () => {
  const p = (version: number, teams: string[]) => ({ version, basedOnEventSetHash: "", priorVersion: 1, assignments: teams.map((teamId) => ({ teamId, segmentIds: [], taskText: "", reason: "" })), wordingRoute: null, approvedByUid: "u", approvedAt: null, createdClientTimeMs: 0 });

  it("marks no team new on the first load", () => {
    expect(planChange(undefined, [p(1, ["T1"])])).toEqual({ latest: 1, newTeamIds: [] });
    expect(planChange(undefined, [])).toEqual({ latest: null, newTeamIds: [] });
  });

  it("marks the teams of a newer plan as new", () => {
    expect(planChange(1, [p(1, ["T1"]), p(2, ["T1", "T2"])])).toEqual({ latest: 2, newTeamIds: ["T1", "T2"] });
    expect(planChange(null, [p(1, ["T2"])])).toEqual({ latest: 1, newTeamIds: ["T2"] });
  });

  it("marks nothing when the latest plan is unchanged", () => {
    expect(planChange(2, [p(1, ["T1"]), p(2, ["T2"])])).toEqual({ latest: 2, newTeamIds: [] });
  });
});
