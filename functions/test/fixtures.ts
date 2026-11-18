import { createHash } from "node:crypto";
import { serverTimestamp } from "firebase/firestore";

/**
 * eventId, computed independently of the engines: SHA-256 over per field (incidentId, deviceId, decimal seq)
 * the decimal UTF-8 byte length, ":" and the value; first 32 lowercase hex.
 */
export function eventIdFor(incidentId: string, deviceId: string, seq: number): string {
  const frame = (s: string) => `${Buffer.byteLength(s, "utf8")}:${s}`;
  return createHash("sha256").update(frame(incidentId) + frame(deviceId) + frame(String(seq)), "utf8").digest("hex").slice(0, 32);
}

/**
 * A complete, valid searcher EventDoc (spec section 8) for incident I1, team T1. deviceId is the auth uid and
 * eventId is derived from incidentId, deviceId and seq unless `over` sets eventId itself.
 */
export function validEvent(uid: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  const seq = (over.seq ?? 1) as number;
  const incidentId = (over.incidentId ?? "I1") as string;
  const deviceId = (over.deviceId ?? uid) as string;
  return {
    eventId: eventIdFor(incidentId, deviceId, seq), schemaVersion: 1, incidentId, teamId: "T1", deviceId, seq, authorUid: uid,
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

/** A clip reading written before upload (ruling I9): consent record present, reading null. */
export function clipReadingDoc(incidentId: string, sha: string, uid: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  const c = { byUid: uid, atMs: 1795860000000 };
  return {
    sha256: sha, storagePath: `clips/${incidentId}/${sha}.mp4`, durationS: 12, clipStartMs: 1795860000000,
    clockConfirmed: true, cameraFacingDeg: 90, reading: null, route: null,
    consent: { personInClip: c, footageOwner: c, cloudProcessing: c, publicUse: null },
    expiresAt: new Date(Date.now() + 30 * 86400_000), createdAt: serverTimestamp(), createdByUid: uid, ...over,
  };
}
