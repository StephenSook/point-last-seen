// The rail's Details summary: what under it needs a person, from live data. The conditions' reading once they are
// set, then family photos with no reading saved by command and family answers that arrived since Details was last
// opened. Nothing to show reads just "Details".

import type { IncidentConditions } from "@pls/engine";
import type { FamilyQuestion } from "../data/familyQuestions";

function conditionsLine(c: IncidentConditions): string {
  const temp = c.tempF === null ? "temperature not known" : `${c.tempF} °F`;
  const wet = c.wet === null ? "not known" : c.wet ? "yes" : "no";
  return `${temp}, wet: ${wet}`;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function detailsSummary(s: { conditions: IncidentConditions | null; photosToReview: number; newAnswers: number }): string {
  const counts = [
    ...(s.photosToReview > 0 ? [count(s.photosToReview, "photo to review", "photos to review")] : []),
    ...(s.newAnswers > 0 ? [count(s.newAnswers, "family answer", "family answers")] : []),
  ];
  const parts = [...(s.conditions ? [conditionsLine(s.conditions)] : []), ...(counts.length > 0 ? [counts.join(", ")] : [])];
  return parts.length === 0 ? "Details" : `Details: ${parts.join(". ")}.`;
}

/** Family photos with no reading saved by command yet. */
export function photosToReview(photos: readonly { sha256: string }[], reviewed: ReadonlySet<string>): number {
  return photos.filter((p) => !reviewed.has(p.sha256)).length;
}

/** Family answers that arrived after `seenAtMs`, when command last opened Details; one with no time counts as new. */
export function newFamilyAnswers(questions: readonly FamilyQuestion[], seenAtMs: number): number {
  return questions.filter((q) => q.answer !== null && (q.answer.atMs === null || q.answer.atMs > seenAtMs)).length;
}
