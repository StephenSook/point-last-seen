import { describe, expect, it } from "vitest";
import type { RouteRecord } from "@pls/engine";
import { approveNow, localDraft, nextPlanVersion, planChange, planDocFor, planDocId, PLANS_LOADING, planSendState, planFromDoc, readPlans, unreadablePlanLine, planLimitLine } from "./plans";
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
  it("computes the engine's assignments from the rank and the teams", () => {
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

describe("approving with the link down", () => {
  const existing = [planDocFor(draft, wording, route, 1, "uid-1", 1), planDocFor(draft, wording, route, 2, "uid-1", 2)];

  it("takes the next version from the local plans and returns at once, without waiting for the server", () => {
    let writes = 0;
    const neverAcked = () => {
      writes++;
      return new Promise<void>(() => {});
    };
    const r = approveNow({ plans: existing, plansLoaded: true, draft, wording, route, uid: "uid-1", nowMs: 9, write: neverAcked });
    expect(r.version).toBe(3);
    expect(writes).toBe(1);
    expect(r.ack).toBeInstanceOf(Promise);
  });

  it("hands the write the plan document for that version", () => {
    let written: { version: number } | null = null;
    approveNow({ plans: [], plansLoaded: true, draft, wording, route, uid: "uid-1", nowMs: 9, write: (plan) => { written = plan; return Promise.resolve(); } });
    expect(written!.version).toBe(1);
  });

  it("refuses before the plan history has loaded, so it cannot reuse a version that already exists", () => {
    let writes = 0;
    expect(() => approveNow({ plans: [], plansLoaded: false, draft, wording, route, uid: "uid-1", nowMs: 9, write: () => { writes++; return Promise.resolve(); } })).toThrow(PLANS_LOADING);
    expect(writes).toBe(0);
  });

  it("says sending while the write is pending, sent once the server has it, unknown before it appears", () => {
    expect(planSendState(3, existing, [])).toBe("unknown");
    const withNew = [...existing, planDocFor(draft, wording, route, 3, "uid-1", 3)];
    expect(planSendState(3, withNew, [3])).toBe("sending");
    expect(planSendState(3, withNew, [])).toBe("sent");
  });
});

describe("planFromDoc", () => {
  const good = {
    version: 3, basedOnEventSetHash: "a".repeat(64), priorVersion: 2,
    assignments: [{ teamId: "T1", segmentIds: ["AA"], taskText: "Search segment AA.", reason: "Highest." }],
    wordingRoute: null, approvedByUid: "u1", approvedAt: null, createdClientTimeMs: 5,
  };
  it("reads a stored plan", () => {
    expect(planFromDoc(good)).toMatchObject({ version: 3, assignments: [{ teamId: "T1", segmentIds: ["AA"] }] });
  });
  it("is null for a record whose fields are not what a plan holds, instead of passing it on", () => {
    expect(planFromDoc({ ...good, assignments: [{ ...good.assignments[0], segmentIds: [7] }] })).toBeNull();
    expect(planFromDoc({ ...good, assignments: "AA" })).toBeNull();
    expect(planFromDoc({ ...good, assignments: [{ teamId: "T1" }] })).toBeNull();
    expect(planFromDoc({ ...good, version: "3" })).toBeNull();
    expect(planFromDoc(null)).toBeNull();
  });
});

describe("plan records that can't be read", () => {
  const good = (version: number) => ({
    version, basedOnEventSetHash: "a".repeat(64), priorVersion: 1,
    assignments: [{ teamId: "T1", segmentIds: ["AA"], taskText: "Search segment AA.", reason: "Highest." }],
    wordingRoute: null, approvedByUid: "u1", approvedAt: null, createdClientTimeMs: 5,
  });
  it("are left out of the plans and named by their record id, oldest plan first", () => {
    const r = readPlans([
      { id: "0002", data: good(2) },
      { id: "0003", data: { ...good(3), assignments: [{ teamId: "T1", segmentIds: [7], taskText: "x", reason: "y" }] } },
      { id: "0001", data: good(1) },
    ]);
    expect(r.plans.map((p) => p.version)).toEqual([1, 2]);
    expect(r.unreadable).toEqual(["0003"]);
  });
  it("still hold their version, so the next approval does not reuse it", () => {
    const plans = readPlans([{ id: "0001", data: good(1) }]).plans;
    let written = 0;
    const r = approveNow({ plans, unreadable: ["0002", "not-a-version"], plansLoaded: true, draft, wording, route, uid: "u1", nowMs: 9, write: (p) => { written = p.version; return Promise.resolve(); } });
    expect(r.version).toBe(3);
    expect(written).toBe(3);
  });
});

describe("unreadablePlanLine", () => {
  it("names each record that can't be read, by plan number when the id is one", () => {
    expect(unreadablePlanLine([])).toBeNull();
    expect(unreadablePlanLine(["0003"])).toBe("This plan record can't be read: plan 3. Teams show the newest plan that can.");
    expect(unreadablePlanLine(["0003", "x9"])).toBe("These plan records can't be read: plan 3, record x9. Teams show the newest plan that can.");
  });
});

describe("planLimitLine", () => {
  const teams = (n: number) => Array.from({ length: n }, (_, i) => ({ teamId: `T${i + 1}`, segmentIds: [`S${i}`] }));
  const d = (assignments: PlanDraft["assignments"]): PlanDraft => ({ ...draft, assignments });
  it("is null for a draft a plan can hold", () => {
    expect(planLimitLine(d(teams(8)))).toBeNull();
  });
  it("says a plan names at most 8 teams before anyone suggests or approves one", () => {
    expect(planLimitLine(d(teams(9)))).toBe("A plan can name at most 8 teams. This draft has 9, so it can't be approved. Search with 8 teams or fewer.");
  });
  it("says so for more than 6 segments for one team, and for a team id a plan can't hold", () => {
    expect(planLimitLine(d([{ teamId: "T1", segmentIds: ["A", "B", "C", "D", "E", "F", "G"] }]))).toBe("A plan can give one team at most 6 segments. This draft gives T1 7, so it can't be approved.");
    expect(planLimitLine(d([{ teamId: "team one", segmentIds: ["A"] }]))).toBe("Team id \"team one\" can't be saved in a plan, so this draft can't be approved.");
  });
});
