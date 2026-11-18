// Plans have one writer: a person at command, after pressing Approve. The
// draft (which team searches which segment) comes from code; the wording only
// adds a task line and a reason per team.

import { assignTeams, type DraftAssignment, type PlanDoc, type PlanWording, type RankedSegment, type RouteRecord } from "@pls/engine";
import { collection, doc, getDocs, onSnapshot, serverTimestamp, setDoc, type Firestore, type Unsubscribe } from "firebase/firestore";
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

/** Writes plans/{version}. Called only from the Approve button. */
export async function approvePlan(db: Firestore, incidentId: string, plan: PlanDoc): Promise<void> {
  await setDoc(doc(db, "incidents", incidentId, "plans", planDocId(plan.version)), plan);
}

export async function existingPlanVersions(db: Firestore, incidentId: string): Promise<number[]> {
  const snap = await getDocs(collection(db, "incidents", incidentId, "plans"));
  return snap.docs.map((d) => Number(d.data()["version"])).filter((v) => Number.isInteger(v));
}

/** Approved plans, oldest first. */
export function subscribePlans(db: Firestore, incidentId: string, cb: (plans: PlanDoc[]) => void, onError: (e: unknown) => void): Unsubscribe {
  return onSnapshot(
    collection(db, "incidents", incidentId, "plans"),
    (snap) => cb(snap.docs.map((d) => d.data() as PlanDoc).sort((a, b) => a.version - b.version)),
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
