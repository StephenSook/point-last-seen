import type { IncidentView, PlanDoc } from "../laneC";

// Made-up data for tests and dev harnesses.
export const drillView: IncidentView = {
  incident: {
    name: "Oak Park",
    mode: "drill",
    drillLabel: "Training drill. Nobody is missing.",
    status: "open",
    priorVersion: 1,
  },
  teams: [{ teamId: "bravo", name: "Bravo" }, { teamId: "alfa", name: "Alfa" }],
  segments: [],
  rowPrior: null,
  clockOffsets: {},
};

export function planFixture(version: number): PlanDoc {
  return {
    version,
    basedOnEventSetHash: "0".repeat(64),
    priorVersion: 1,
    assignments: [{ teamId: "alfa", segmentIds: ["AA"], taskText: `Search AA on plan ${version}.`, reason: "Begin at the trail." }],
    wordingRoute: null,
    approvedByUid: "private-marker",
    approvedAt: null,
    createdClientTimeMs: 1_795_372_900_000,
  };
}
