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

export function nextPlanVersion(existing: readonly number[]): number {
  return existing.reduce((m, v) => Math.max(m, v), 0) + 1;
}

export function planDocId(version: number): string {
  return String(version).padStart(4, "0");
}

/** The same draft the server writes, computed here when the link is down. */
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
export function approveNow(args: {
  plans: readonly PlanDoc[];
  draft: PlanDraft;
  wording: PlanWording;
  route: RouteRecord | null;
  uid: string;
  nowMs: number;
  write: (plan: PlanDoc) => Promise<void>;
}): { version: number; ack: Promise<void> } {
  const version = nextPlanVersion(args.plans.map((p) => p.version));
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
  cb: (plans: PlanDoc[], pendingVersions: number[]) => void,
  onError: (e: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, "incidents", incidentId, "plans"),
    { includeMetadataChanges: true },
    (snap) =>
      cb(
        snap.docs.map((d) => d.data() as PlanDoc).sort((a, b) => a.version - b.version),
        snap.docs.filter((d) => d.metadata.hasPendingWrites).map((d) => Number(d.data()["version"])),
      ),
    onError,
  );
}

/** The server's draft for one event set (written by the draftPlanOnEvent function), or null while there is none. */
export function subscribeDraft(db: Firestore, incidentId: string, eventSetHash: string, cb: (draft: PlanDraft | null) => void, onError: (e: unknown) => void): Unsubscribe {
  return onSnapshot(
    doc(db, "incidents", incidentId, "planDrafts", eventSetHash),
    (snap) => {
      const d = snap.data();
      cb(d ? { eventSetHash: String(d["eventSetHash"]), priorVersion: Number(d["priorVersion"]), rank: d["rank"] as RankedSegment[], assignments: d["assignments"] as DraftAssignment[] } : null);
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
