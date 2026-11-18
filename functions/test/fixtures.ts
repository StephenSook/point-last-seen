import { serverTimestamp } from "firebase/firestore";
import { ID } from "./helpers";

/** A complete, valid searcher EventDoc (spec section 8) for incident I1, team T1. deviceId is the auth uid. */
export function validEvent(uid: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: ID, schemaVersion: 1, incidentId: "I1", teamId: "T1", deviceId: uid, seq: 1, authorUid: uid,
    role: "searcher", type: "cleared", reporter: "searcher", clientTimeMs: 1795860000000, serverTime: serverTimestamp(),
    observedAtMs: null, position: null, positionSource: "assigned_segment", rawText: "Cleared AC, eighty percent",
    inputMethod: "typed", isTrainingInject: false, reading: null,
    effect: { kind: "none", why: "needs_command" }, route: null, targetEventId: null, decision: null,
    planVersion: null, priorVersion: 1, ...over,
  };
}

/** The same event written by command (no team). */
export function commandEvent(uid: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return validEvent(uid, { role: "command", teamId: null, reporter: "system", ...over });
}

export const validPlan = (uid: string) => ({
  version: 1, basedOnEventSetHash: "0".repeat(64), priorVersion: 1,
  assignments: [{ teamId: "T1", segmentIds: ["AC"], taskText: "Sweep AC", reason: "Highest POA" }],
  wordingRoute: null, approvedByUid: uid, approvedAt: serverTimestamp(), createdClientTimeMs: 1795860000000,
});
