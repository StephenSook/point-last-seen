// Plans have one writer: a person at command, after pressing Approve. The
// draft (which team searches which segment) comes from code; the wording only
// adds a task line and a reason per team.

import { assignTeams, type DraftAssignment, type PlanDoc, type PlanWording, type RankedSegment, type RouteRecord } from "@pls/engine";
import { collection, doc, onSnapshot, serverTimestamp, setDoc, type Firestore, type Unsubscribe } from "firebase/firestore";
import type { PlanDraft } from "../ai/replanWording";

export function planDocFor(draft: PlanDraft, wording: PlanWording, route: RouteRecord | null, version: number, uid: string, nowMs: number): PlanDoc {
  const words = new Map(wording.assignments.map((a) => [a.teamId, a]));
  const assignments = draft.assignments.map((a) => {
    const w = words.get(a.teamId);
    if (!w) throw new Error(`No wording for team ${a.teamId}`);
    return { teamId: a.teamId, segmentIds: [...a.segmentIds], taskText: w.taskText, reason: w.reason };
  });
  return {
    version,
    basedOnEventSetHash: draft.eventSetHash,
    priorVersion: draft.priorVersion,
    assignments,
    wordingRoute: route,
    approvedByUid: uid,
    approvedAt: serverTimestamp(),
    createdClientTimeMs: nowMs,
  };
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * A stored plan, read field by field, or null when the record does not hold what a plan holds
 * (a segment id that is not text, assignments that are not a list). The panel then says the record
 * can't be read instead of drawing from it.
 */
export function planFromDoc(data: unknown): PlanDoc | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  const { version, basedOnEventSetHash, priorVersion, assignments, wordingRoute, approvedByUid, createdClientTimeMs } = d;
  if (!Number.isInteger(version) || !isStr(basedOnEventSetHash) || !isNum(priorVersion) || !isStr(approvedByUid) || !isNum(createdClientTimeMs)) return null;
  if (wordingRoute !== null && (typeof wordingRoute !== "object" || Array.isArray(wordingRoute))) return null;
  if (!Array.isArray(assignments)) return null;
  const read: PlanDoc["assignments"] = [];
  for (const a of assignments as unknown[]) {
    if (typeof a !== "object" || a === null) return null;
    const { teamId, segmentIds, taskText, reason } = a as Record<string, unknown>;
    if (!isStr(teamId) || !isStr(taskText) || !isStr(reason) || !Array.isArray(segmentIds) || !segmentIds.every(isStr)) return null;
    read.push({ teamId, segmentIds: [...segmentIds], taskText, reason });
  }
  return {
    version: version as number,
    basedOnEventSetHash,
    priorVersion,
    assignments: read,
    wordingRoute: wordingRoute as PlanDoc["wordingRoute"],
    approvedByUid,
    approvedAt: d["approvedAt"] ?? null,
    createdClientTimeMs,
  };
}

/** What the plans rule holds: at most 10 teams, at most 6 segments a team, and push-reachable team ids. */
export const PLAN_MAX_TEAMS = 10;
export const PLAN_MAX_SEGMENTS = 6;
const PLAN_TEAM_ID = /^[A-Za-z0-9_]{1,32}$/;

/** Why a draft can't become a plan, said before anyone suggests or approves it, or null when it can. */
export function planLimitLine(draft: PlanDraft): string | null {
  const n = draft.assignments.length;
  if (n > PLAN_MAX_TEAMS) return `A plan can name at most ${PLAN_MAX_TEAMS} teams. This draft has ${n}, so it can't be approved. Search with ${PLAN_MAX_TEAMS} teams or fewer.`;
  for (const a of draft.assignments) {
    if (!PLAN_TEAM_ID.test(a.teamId)) return `Team id "${a.teamId}" can't be saved in a plan, so this draft can't be approved.`;
    if (a.segmentIds.length > PLAN_MAX_SEGMENTS) return `A plan can give one team at most ${PLAN_MAX_SEGMENTS} segments. This draft gives ${a.teamId} ${a.segmentIds.length}, so it can't be approved.`;
  }
  return null;
}

/** Plans read from their records, oldest first, and the ids of records that can't be read. */
export function readPlans(docs: readonly { id: string; data: unknown }[]): { plans: PlanDoc[]; unreadable: string[] } {
  const plans: PlanDoc[] = [];
  const unreadable: string[] = [];
  for (const d of docs) {
    const p = planFromDoc(d.data);
    if (p) plans.push(p);
    else unreadable.push(d.id);
  }
  return { plans: plans.sort((a, b) => a.version - b.version), unreadable };
}

/** The versions held by plan records that can't be read (their record id is the padded version). */
function heldVersions(unreadable: readonly string[]): number[] {
  return unreadable.filter((id) => /^[0-9]+$/.test(id)).map(Number);
}

/** The line the post shows for plan records that can't be read, or null when every record reads. */
export function unreadablePlanLine(unreadable: readonly string[]): string | null {
  if (unreadable.length === 0) return null;
  const names = unreadable.map((id) => (/^[0-9]+$/.test(id) ? `plan ${Number(id)}` : `record ${id}`)).join(", ");
  const head = unreadable.length === 1 ? "This plan record can't be read" : "These plan records can't be read";
  return `${head}: ${names}. Teams show the newest plan that can.`;
}

export function nextPlanVersion(existing: readonly number[]): number {
  return existing.reduce((m, v) => Math.max(m, v), 0) + 1;
}

export function planDocId(version: number): string {
  return String(version).padStart(4, "0");
}

/** The draft: the engine's team assignment for the ranked segments, computed on this laptop. */
export function localDraft(eventSetHash: string, priorVersion: number, rank: RankedSegment[], teamIds: string[], current: DraftAssignment[]): PlanDraft {
  return { eventSetHash, priorVersion, rank, assignments: assignTeams(rank, teamIds, current) };
}

/**
 * The Approve button. The version comes from the plans already on this laptop and the
 * write starts at once; it is not awaited, because Firestore settles a write only when
 * the server acknowledges it, and with the link down that never happens. The local
 * snapshot shows the plan right away (pending), and `ack` rejects if the server refuses
 * it (another seat approved that version first: plans are create-only).
 */
export const PLANS_LOADING = "The plan history is still loading. Approve again in a moment.";

export function approveNow(args: {
  plans: readonly PlanDoc[];
  /** Ids of plan records that can't be read: their versions are taken all the same. */
  unreadable?: readonly string[];
  /** The first plans snapshot has arrived; before it, the next version is not known. */
  plansLoaded: boolean;
  draft: PlanDraft;
  wording: PlanWording;
  route: RouteRecord | null;
  uid: string;
  nowMs: number;
  write: (plan: PlanDoc) => Promise<void>;
}): { version: number; ack: Promise<void> } {
  // An empty list before the first snapshot is not "no plans yet": approving then could reuse v1.
  if (!args.plansLoaded) throw new Error(PLANS_LOADING);
  const version = nextPlanVersion([...args.plans.map((p) => p.version), ...heldVersions(args.unreadable ?? [])]);
  const ack = args.write(planDocFor(args.draft, args.wording, args.route, version, args.uid, args.nowMs));
  return { version, ack };
}

/** Writes plans/{version}; the promise settles on the server's acknowledgement. */
export function writePlan(db: Firestore, incidentId: string, plan: PlanDoc): Promise<void> {
  return setDoc(doc(db, "incidents", incidentId, "plans", planDocId(plan.version)), plan);
}

/** Where an approved plan is: not in the local snapshot yet, sending (written here, not yet on the server), or sent. */
export function planSendState(version: number, plans: readonly PlanDoc[], pendingVersions: readonly number[]): "unknown" | "sending" | "sent" {
  if (!plans.some((p) => p.version === version)) return "unknown";
  return pendingVersions.includes(version) ? "sending" : "sent";
}

/** Approved plans, oldest first, with the versions whose write has not reached the server yet. */
export function subscribePlans(
  db: Firestore,
  incidentId: string,
  /** fromServer: false for a snapshot served from this laptop's cache. unreadable: ids of records that are not plans. */
  cb: (plans: PlanDoc[], pendingVersions: number[], fromServer: boolean, unreadable: string[]) => void,
  onError: (e: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, "incidents", incidentId, "plans"),
    { includeMetadataChanges: true },
    (snap) => {
      const { plans, unreadable } = readPlans(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
      cb(plans, snap.docs.filter((d) => d.metadata.hasPendingWrites).map((d) => Number(d.data()["version"])), !snap.metadata.fromCache, unreadable);
    },
    onError,
  );
}

/**
 * Which teams to mark "New". `prevLatest` is undefined before the first plan
 * snapshot (nothing is new on page load) and null when the incident had no plan.
 */
export function planChange(prevLatest: number | null | undefined, plans: readonly PlanDoc[]): { latest: number | null; newTeamIds: string[] } {
  const last = plans.length > 0 ? plans[plans.length - 1]! : null;
  const latest = last ? last.version : null;
  if (prevLatest === undefined || !last || (prevLatest !== null && last.version <= prevLatest)) return { latest, newTeamIds: [] };
  return { latest, newTeamIds: last.assignments.map((a) => a.teamId) };
}
