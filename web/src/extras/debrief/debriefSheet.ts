// The paper debrief a team fills in after a sweep, one per segment. Command later holds it to the laptop and reads it
// with this laptop's own model; every field is checked by a person before anything is saved. The sheet asks for no
// one's name or phone number. Team and segment are typed from the approved plan where there is one, so only the
// minutes, the coverage tick and the notes are handwritten; blank sheets cover a sweep the plan did not name.

import type { PrintModel } from "../print/printModel";

export type DebriefFieldKey = "team" | "segment" | "minutes" | "coverage" | "worked" | "didNotWork" | "clues" | "hazards";
export type DebriefField = { key: DebriefFieldKey; label: string };

/** The sheet's fields, in the order they print and the order the reader returns them. */
export const DEBRIEF_FIELDS: readonly DebriefField[] = [
  { key: "team", label: "Team" },
  { key: "segment", label: "Segment" },
  { key: "minutes", label: "Minutes searched" },
  { key: "coverage", label: "How much of the segment you covered (tick one)" },
  { key: "worked", label: "What worked" },
  { key: "didNotWork", label: "What did not work" },
  { key: "clues", label: "Clues found: what and where" },
  { key: "hazards", label: "Hazards: what and where" },
];

/** Coverage as one tick of four: a tick reads more reliably than a handwritten number. */
export const COVERAGE_TICKS = [25, 50, 75, 100] as const;

export type DebriefValues = { minutes: number; coveragePct: (typeof COVERAGE_TICKS)[number]; worked: string; didNotWork: string; clues: string; hazards: string };

/** Made up for practice and for the reader's tests: block capitals, as the sheet asks; no person named. */
export const SAMPLE_VALUES: DebriefValues = {
  minutes: 45,
  coveragePct: 75,
  worked: "LINE SEARCH 10 M APART ALONG THE CREEK",
  didNotWork: "THICK BRUSH ON THE NORTH SLOPE",
  clues: "BLUE SCARF ON TRAIL MARKER 4",
  hazards: "LOOSE ROCK BY THE OVERLOOK",
};

export type DebriefSheetModel = {
  drillLine: string;
  incidentName: string;
  planLine: string;
  teamName: string | null;
  segmentId: string | null;
  /** "2 of 5", or "SAMPLE". */
  pageLine: string;
  /** The filled values of the SAMPLE sheet; null on a sheet for real use. */
  sample: DebriefValues | null;
};

function base(model: PrintModel): Pick<DebriefSheetModel, "drillLine" | "incidentName" | "planLine"> {
  return { drillLine: model.drillLabel, incidentName: model.incidentName, planLine: model.planVersion === null ? "No plan approved" : `Plan v${model.planVersion}` };
}

/** One sheet per segment each team was given, team and segment typed, then `blanks` blank sheets. */
export function debriefSheets(model: PrintModel, opts: { blanks: number }): DebriefSheetModel[] {
  const named = model.teams.flatMap((t) => t.segmentIds.map((segmentId) => ({ teamName: t.name, segmentId })));
  const all = [...named, ...Array.from({ length: opts.blanks }, () => ({ teamName: null, segmentId: null }))];
  return all.map((s, i) => ({ ...base(model), ...s, pageLine: `${i + 1} of ${all.length}`, sample: null }));
}

/** One filled sheet marked SAMPLE, on the plan's first segment (or blank team and segment without a plan). */
export function sampleDebriefSheet(model: PrintModel): DebriefSheetModel {
  const first = model.teams.find((t) => t.segmentIds.length > 0);
  return { ...base(model), teamName: first?.name ?? null, segmentId: first?.segmentIds[0] ?? null, pageLine: "SAMPLE", sample: SAMPLE_VALUES };
}
