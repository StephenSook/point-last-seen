import type { PrintModel } from "./printModel";

export const ICS204_EDITION = "v3.1";
export const ICS204_BLOCK_TITLES = [
  "Incident Name",
  "Operational Period",
  "Branch, Division, Group, Staging Area",
  "Operations Personnel",
  "Resources Assigned",
  "Work Assignments",
  "Special Instructions",
  "Communications (radio and/or phone contact numbers needed for this assignment)",
  "Prepared by",
] as const;
export const ICS204_RESOURCE_COLUMNS = [
  "Resource Identifier",
  "Leader",
  "# of Persons",
  "Contact (e.g., phone, pager, radio frequency, etc.)",
  "Reporting Location, Special Equipment and Supplies, Remarks, Notes, Information",
] as const;
export const ICS204_ROWS_PER_SHEET = 10;

export type Ics204Typed = {
  dateFrom: string; dateTo: string; timeFrom: string; timeTo: string;
  branch: string; division: string; group: string; stagingArea: string;
  includeApproachNotes: boolean;
};

export type Ics204Sheet = {
  incidentName: string;
  period: { dateFrom: string; dateTo: string; timeFrom: string; timeTo: string };
  unit: { branch: string; division: string; group: string; stagingArea: string };
  resources: { resourceIdentifier: string; leader: ""; persons: ""; contact: ""; notes: string }[];
  workAssignments: string[];
  specialInstructions: string[];
  preparedDateTime: string;
  page: number;
  pages: number;
};

function dateTime(ms: number, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(ms);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { date: `${values.month}/${values.day}/${values.year}`, time: `${values.hour}:${values.minute}` };
}

export function defaultTyped(model: PrintModel, timeZone: string): Ics204Typed {
  const from = model.planApprovedAtMs === null ? null : dateTime(model.planApprovedAtMs, timeZone);
  return {
    dateFrom: from?.date ?? "", dateTo: "", timeFrom: from?.time ?? "", timeTo: "",
    branch: "", division: "", group: "", stagingArea: "", includeApproachNotes: false,
  };
}

export function ics204Sheets(
  model: PrintModel, typed: Ics204Typed, approachLines: readonly string[], timeZone: string,
): Ics204Sheet[] {
  if (model.planVersion === null) return [];
  const { dateFrom, dateTo, timeFrom, timeTo, branch, division, group, stagingArea } = typed;
  const specialInstructions: string[] = [];
  specialInstructions.push(`${model.drillLabel} Do not dial 911.`);
  const reportLabel = model.reportCount === 1 ? "report" : "reports";
  specialInstructions.push(
    `Map match code at print time: ${model.matchCode ?? "Unavailable"} (plan v${model.planVersion}, ${model.reportCount} ${reportLabel}).`,
  );
  if (typed.includeApproachNotes) specialInstructions.push(...approachLines);

  const prepared = dateTime(model.printedAtMs, timeZone);
  const pages = Math.max(1, Math.ceil(model.teams.length / ICS204_ROWS_PER_SHEET));
  return Array.from({ length: pages }, (_, index) => {
    const start = index * ICS204_ROWS_PER_SHEET;
    const teams = model.teams.slice(start, start + ICS204_ROWS_PER_SHEET);
    return {
      incidentName: model.incidentName,
      period: { dateFrom, dateTo, timeFrom, timeTo },
      unit: { branch, division, group, stagingArea },
      resources: teams.map(({ name, segmentIds }) => ({
        resourceIdentifier: name, leader: "", persons: "", contact: "", notes: segmentIds.join(", "),
      })),
      workAssignments: teams.map(({ name, segmentIds, taskText }) => [name, segmentIds.join(", "), taskText].filter(Boolean).join(" | ")),
      specialInstructions: [...specialInstructions],
      preparedDateTime: `${prepared.date} ${prepared.time}`,
      page: index + 1,
      pages,
    };
  });
}
