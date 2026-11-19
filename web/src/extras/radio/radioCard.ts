import type { PrintModel } from "../print/printModel";
import { CROCKFORD, PHONETIC } from "./radioCode";

export type RadioCardModel = {
  drillLine: string | null;
  incidentName: string;
  teamName: string;
  planLine: string;
  segmentIds: string[];
  taskText: string;
  sayLines: string[];
  /** The person's names and approach notes, only when command ticked the box; otherwise empty. */
  personLines: string[];
  spellTable: { ch: string; word: string }[];
  matchMeaning: string;
};

export const SAY_LINES: readonly string[] = [
  "Team [name]. Segments [ids].",
  "Cleared by [method]. Coverage [percent].",
  "Search type [type]. Searchers [count].",
  "Search time [minutes]. Detection range [metres].",
  "Feature [trail]. Direction [downstream].",
];

export const MATCH_MEANING = "Same code means the same prior version and the same reports.";

export function radioCards(model: PrintModel, opts: { sayLines: boolean; personLines?: readonly string[] }): RadioCardModel[] {
  const approved = model.planApprovedAtMs === null
    ? ""
    : ` | ${new Date(model.planApprovedAtMs).toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const planLine = model.planVersion === null ? "No approved plan." : `Plan v${model.planVersion}${approved}`;
  return model.teams.map(({ name, segmentIds, taskText }) => ({
    drillLine: model.drillLabel,
    incidentName: model.incidentName,
    teamName: name,
    planLine,
    segmentIds: [...segmentIds],
    taskText: taskText || (segmentIds.length === 0 ? "No assignment yet." : ""),
    sayLines: opts.sayLines ? [...SAY_LINES] : [],
    personLines: [...(opts.personLines ?? [])],
    spellTable: Array.from(CROCKFORD, (ch) => ({ ch, word: PHONETIC[ch]! })),
    matchMeaning: MATCH_MEANING,
  }));
}
