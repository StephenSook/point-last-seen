// "Report a problem" flags: a searcher or family member flags shared content (their task, the family's description
// of the person, or one report). Each is its own document, incidents/{id}/contentReports/{reportId}, written once by
// its author; command reads them all, newest first.

import { collection, onSnapshot, type Firestore } from "firebase/firestore";
import { removePhoneNumbers } from "./phoneNumbers";
import { planDocId } from "./plans";

/** Mirrors shared/schemas/content-report.schema.json. */
export type ContentReport = {
  authorUid: string;
  role: "searcher" | "family";
  target: "task" | "family_description" | "event";
  targetId: string | null;
  reason: "abusive" | "personal_information" | "wrong_or_misleading" | "other";
  note?: string;
  createdAt: unknown;
};

/** A stored report as the command post shows it: its id, and its server time (null while it is still being saved). */
export type Flag = Omit<ContentReport, "createdAt"> & { reportId: string; createdAtMs: number | null };

const ROLES = ["searcher", "family"] as const;
const TARGETS = ["task", "family_description", "event"] as const;
const REASONS = ["abusive", "personal_information", "wrong_or_misleading", "other"] as const;

/** The reasons in the words the reporter chose from. */
export const REASON_WORDS: Readonly<Record<ContentReport["reason"], string>> = {
  abusive: "Abusive or offensive",
  personal_information: "Personal information that should not be shared",
  wrong_or_misleading: "Wrong or misleading",
  other: "Other",
};

const TARGET_WORDS: Readonly<Record<ContentReport["target"], string>> = {
  task: "their task",
  family_description: "the family's description",
  event: "a report",
};

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** A stored document as a flag, or null when it is not of the schema's shape. */
export function reportFromDoc(reportId: string, d: Record<string, unknown>): Flag | null {
  const { authorUid, role, target, targetId, reason, note, createdAt } = d;
  if (typeof authorUid !== "string" || !oneOf(ROLES, role) || !oneOf(TARGETS, target) || !oneOf(REASONS, reason)) return null;
  if (targetId !== null && typeof targetId !== "string") return null;
  const at = createdAt && typeof (createdAt as { toMillis?: unknown }).toMillis === "function" ? (createdAt as { toMillis: () => number }).toMillis() : null;
  // The reporter's app removes phone numbers before it stores the note, but no rule enforces that, so it is done here too.
  const shown = typeof note === "string" ? removePhoneNumbers(note).trim() : "";
  return { reportId, authorUid, role, target, targetId, reason, ...(shown !== "" ? { note: shown } : {}), createdAtMs: at };
}

/** "Team 1 searcher flagged a report from 04:21 in segment AE: personal information that should not be shared." */
export function flagLine(f: Flag, who: string, target: string = TARGET_WORDS[f.target]): string {
  return `${who} flagged ${target}: ${REASON_WORDS[f.reason].toLowerCase()}.`;
}

/** What was flagged, named well enough to find it: the report's time and segment, or the plan the task came from. */
export function flagTarget(f: Flag, events: readonly Readonly<Record<string, unknown>>[], plans: readonly { version: number }[],
  timeOf: (ms: number) => string): string {
  if (f.target === "event") {
    const e = events.find((x) => x["eventId"] === f.targetId);
    if (!e || typeof e["clientTimeMs"] !== "number") return TARGET_WORDS.event;
    const seg = (e["reading"] as { segmentIds?: unknown } | null | undefined)?.segmentIds;
    const where = Array.isArray(seg) && typeof seg[0] === "string" ? ` in segment ${seg[0]}` : "";
    return `a report from ${timeOf(e["clientTimeMs"])}${where}`;
  }
  if (f.target === "task") {
    const p = plans.find((x) => planDocId(x.version) === f.targetId);
    return p ? `their task in plan v${p.version}` : TARGET_WORDS.task;
  }
  return TARGET_WORDS.family_description;
}

/** Newest first. A report with no stored time sorts last: command writes none, so none is ever still being saved. */
export function sortNewestFirst(flags: readonly Flag[]): Flag[] {
  return [...flags].sort((a, b) => (b.createdAtMs ?? -Infinity) - (a.createdAtMs ?? -Infinity));
}

/**
 * Command's live view of the flags. A refused read keeps what was shown and calls onRefused: Firestore stops a
 * listener after a refusal, so the page says the list may be out of date.
 */
export function subscribeFlags(db: Firestore, incidentId: string, cb: (flags: Flag[]) => void, onRefused: () => void = () => undefined): () => void {
  return onSnapshot(
    collection(db, "incidents", incidentId, "contentReports"),
    (s) => cb(sortNewestFirst(s.docs.flatMap((d) => reportFromDoc(d.id, d.data()) ?? []))),
    () => onRefused(),
  );
}

/**
 * The team of the account's latest report, by server time (a phone's clock can be wrong), then its own time; reports
 * with neither are skipped. Null when it has sent none. A rejoin can move a searcher to another team.
 */
export function latestTeamOf(uid: string, events: readonly Readonly<Record<string, unknown>>[]): string | null {
  const when = (e: Readonly<Record<string, unknown>>) => {
    const t = typeof e["serverTimeMs"] === "number" ? e["serverTimeMs"] : e["clientTimeMs"];
    return typeof t === "number" && Number.isFinite(t) ? t : null;
  };
  let best: { at: number; team: string } | null = null;
  for (const e of events) {
    const at = when(e), team = e["teamId"];
    if (e["authorUid"] !== uid || at === null || typeof team !== "string") continue;
    if (!best || at > best.at) best = { at, team };
  }
  return best?.team ?? null;
}
