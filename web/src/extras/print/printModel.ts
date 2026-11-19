import type { IncidentView, PlanDoc } from "../hostApp";

export const DRILL_LABEL = "Training drill. Nobody is missing.";

export type PrintTeam = { teamId: string; name: string; segmentIds: string[]; taskText: string; reason: string };

export type PrintModel = {
  incidentName: string;
  mode: "drill" | "judge";
  drillLabel: string | null;
  planVersion: number | null;
  planApprovedAtMs: number | null;
  teams: PrintTeam[];
  matchCode: string | null;
  reportCount: number;
  printedAtMs: number;
};

function printText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function approvalTimeMs(plan: PlanDoc): number | null {
  const { approvedAt, createdClientTimeMs } = plan;
  if (typeof approvedAt === "object" && approvedAt !== null && "toMillis" in approvedAt && typeof approvedAt.toMillis === "function") {
    const millis: unknown = approvedAt.toMillis();
    if (typeof millis === "number" && Number.isFinite(millis)) return millis;
  }
  return Number.isFinite(createdClientTimeMs) ? createdClientTimeMs : null;
}

export function buildPrintModel({ view, plans, code, eventCount, nowMs }: {
  view: IncidentView;
  plans: readonly PlanDoc[];
  code: string | null;
  eventCount: number;
  nowMs: number;
}): PrintModel {
  let latest: PlanDoc | null = null;
  for (const plan of plans) {
    if (Number.isInteger(plan.version) && (latest === null || plan.version > latest.version)) latest = plan;
  }

  const assignments = new Map(latest?.assignments.map((assignment) => [assignment.teamId, assignment]));
  const { incident } = view;
  const mode = incident?.mode === "drill" ? "drill" : "judge";

  return {
    incidentName: printText(incident?.name),
    mode,
    drillLabel: mode === "drill" ? printText(incident?.drillLabel) || DRILL_LABEL : null,
    planVersion: latest?.version ?? null,
    planApprovedAtMs: latest === null ? null : approvalTimeMs(latest),
    teams: view.teams.map(({ teamId, name }) => {
      const assignment = assignments.get(teamId);
      const segmentIds = assignment?.segmentIds;
      return {
        teamId,
        name,
        segmentIds: Array.isArray(segmentIds) ? segmentIds.filter((id) => typeof id === "string") : [],
        taskText: printText(assignment?.taskText),
        reason: printText(assignment?.reason),
      };
    }),
    matchCode: code,
    reportCount: eventCount,
    printedAtMs: nowMs,
  };
}

export function isStale(model: PrintModel, plans: readonly PlanDoc[]): boolean {
  const { planVersion } = model;
  return plans.some(({ version }) => Number.isInteger(version) && (planVersion === null || version > planVersion));
}
