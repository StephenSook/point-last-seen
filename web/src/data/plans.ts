// Plans have one writer: a person at command, after pressing Approve. The
// draft (which team searches which segment) comes from code; the wording only
// adds a task line and a reason per team.

import { assignTeams, type DraftAssignment, type PlanDoc, type PlanWording, type RankedSegment, type RouteRecord } from "@pls/engine";
import { collection, doc, getDocs, serverTimestamp, setDoc, type Firestore } from "firebase/firestore";
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
