import { expect, it } from "vitest";
import { buildPrintModel, isStale } from "./printModel";
import { drillView, planFixture } from "../testdata/fixtures";

const input = {
  view: drillView,
  plans: [planFixture(5), planFixture(3), planFixture(4)],
  code: "K7Q4",
  eventCount: 14,
  nowMs: 1_795_372_980_000,
};

it("uses the highest approved plan version", () => {
  const model = buildPrintModel(input);

  expect(model).toMatchObject({
    incidentName: drillView.incident?.name,
    planVersion: 5,
    matchCode: input.code,
    reportCount: input.eventCount,
    printedAtMs: input.nowMs,
  });
  expect(model.teams.map((team) => team.teamId)).toEqual(["bravo", "alfa"]);
  expect(model.teams[1]).toEqual({
    teamId: "alfa",
    name: "Alfa",
    segmentIds: ["AA"],
    taskText: "Search AA on plan 5.",
    reason: "Begin at the trail.",
  });
  expect(model.teams[1]?.segmentIds).not.toBe(input.plans[0]?.assignments[0]?.segmentIds);
});

it("lists a team with no assignment and leaves its task empty", () => {
  expect(buildPrintModel(input).teams[0]).toEqual({
    teamId: "bravo",
    name: "Bravo",
    segmentIds: [],
    taskText: "",
    reason: "",
  });
});

it("carries the drill label in drill mode and none in judge mode", () => {
  const drillLabel = "Training drill. Nobody is missing.";
  expect(buildPrintModel(input)).toMatchObject({ mode: "drill", drillLabel });

  const incident = { name: "Oak Park", status: "open", priorVersion: 1 } as const;
  const drillWithoutLabel = { ...drillView, incident: { ...incident, mode: "drill" as const } };
  expect(buildPrintModel({ ...input, view: drillWithoutLabel }).drillLabel).toBe(drillLabel);

  const judgeView = { ...drillView, incident: { ...incident, mode: "judge" as const, drillLabel } };
  expect(buildPrintModel({ ...input, view: judgeView })).toMatchObject({ mode: "judge", drillLabel: null });
});

it("with no approved plan the model has planVersion null and no task text", () => {
  const model = buildPrintModel({ ...input, plans: [] });

  expect(model).toMatchObject({ planVersion: null, planApprovedAtMs: null });
  expect(model.teams).toHaveLength(2);
  for (const team of model.teams) {
    expect(team).toMatchObject({ segmentIds: [], taskText: "", reason: "" });
  }
});

it("the model holds no uid, join code or profile field", () => {
  const incident = {
    name: "Oak Park",
    mode: "drill",
    status: "open",
    priorVersion: 1,
    joinCode: "private-marker",
    profile: { command: "private-marker" },
  } as const;
  const teams = drillView.teams.map((team) => ({ ...team, uid: "private-marker" }));
  const plan = planFixture(5);
  const assignments = plan.assignments.map((assignment) => ({
    ...assignment,
    segmentIds: [...assignment.segmentIds, { uid: "private-marker" }],
    reason: { profile: "private-marker" },
    authorUid: "private-marker",
    rawText: "private-marker",
    clipPath: "private-marker",
    consent: { byUid: "private-marker" },
  }));
  const model = buildPrintModel({
    ...input,
    view: { ...drillView, incident, teams },
    // The command post reads approved Firestore documents as PlanDoc without a shape check.
    plans: [{ ...plan, assignments: assignments as unknown as typeof plan.assignments }],
  });

  expect(model.teams[1]).toMatchObject({ taskText: "Search AA on plan 5.", reason: "", segmentIds: ["AA"] });
  expect(JSON.stringify(model)).not.toMatch(/uid|joinCode|approvedBy|profile|authorUid|rawText|clipPath|consent|private-marker/i);
});

it("a newer plan than the one on the sheet raises the reprint line", () => {
  const model = buildPrintModel(input);

  expect(isStale(model, input.plans)).toBe(false);
  expect(isStale(model, [planFixture(6), ...input.plans])).toBe(true);
  expect(isStale(buildPrintModel({ ...input, plans: [] }), [])).toBe(false);
  expect(isStale(buildPrintModel({ ...input, plans: [] }), input.plans)).toBe(true);
});

it("approvedAt as a Firestore timestamp becomes milliseconds; a missing one falls back to createdClientTimeMs", () => {
  const approvedAt = {
    seconds: 1_795_372_920,
    nanoseconds: 123_000_000,
    toMillis() {
      return this.seconds * 1000 + this.nanoseconds / 1_000_000;
    },
  };
  const plan = { ...planFixture(5), approvedAt };
  expect(buildPrintModel({ ...input, plans: [plan] }).planApprovedAtMs).toBe(1_795_372_920_123);

  const missing = { ...plan, approvedAt: undefined };
  expect(buildPrintModel({ ...input, plans: [missing] }).planApprovedAtMs).toBe(plan.createdClientTimeMs);
});
