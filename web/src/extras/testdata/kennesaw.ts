import type { IncidentView, PlanDoc } from "../hostApp";

// Made-up drill data for drill-day paper checks: the Kennesaw Mountain drill's teams (T1 to T3) and a plan v1 over
// the nine segments nearest its point last seen on the kennesaw-mountain-drill grid. Tests and dev harnesses only;
// never on the judged path. The real plan is whatever command approves on the day.
export const kennesawView: IncidentView = {
  incident: {
    name: "Training drill, Kennesaw Mountain (south of Dallas Highway)",
    mode: "drill",
    drillLabel: "Training drill. Nobody is missing.",
    status: "open",
    priorVersion: 1,
  },
  teams: [{ teamId: "T1", name: "T1" }, { teamId: "T2", name: "T2" }, { teamId: "T3", name: "T3" }],
  segments: [],
  rowPrior: null,
  clockOffsets: {},
};

export const kennesawPlan: PlanDoc = {
  version: 1,
  basedOnEventSetHash: "0".repeat(64),
  priorVersion: 1,
  assignments: [
    { teamId: "T1", segmentIds: ["HE", "HQ", "HF"], taskText: "Search HE, HQ and HF, nearest the point last seen.", reason: "The highest probability is closest to where they were last seen." },
    { teamId: "T2", segmentIds: ["HR", "HD", "HP"], taskText: "Search HR, HD and HP along the trail edges.", reason: "Trails and road edges draw people who are wandering." },
    { teamId: "T3", segmentIds: ["GS", "GT", "ID"], taskText: "Search GS, GT and ID toward the parking area.", reason: "They may head back toward a familiar car park." },
  ],
  wordingRoute: null,
  approvedByUid: "private-marker",
  approvedAt: { toMillis: () => Date.UTC(2026, 10, 22, 13, 0) } as PlanDoc["approvedAt"],
  createdClientTimeMs: Date.UTC(2026, 10, 22, 12, 59),
};
