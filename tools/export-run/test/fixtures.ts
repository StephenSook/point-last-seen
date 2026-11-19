// A synthetic drill's stored docs, shared by the exporter's tests: two devices, a cleared report, a family
// destination and a camera sighting, with real-looking uids that must never reach the public run.
import { readFileSync } from "node:fs";
import type { RawRun } from "../src/transform";

export const grid = JSON.parse(readFileSync(new URL("../../../shared/grid/piedmont-park-dev.grid.json", import.meta.url), "utf8"));
// Real-looking uids: 28 letters and digits, as Firebase Auth makes them.
export const UID_A = "Qw3rTy7UiOp9AsDfGh2JkLzXcVbN", UID_B = "Mn8BvC5xZaS4dF6gH1jK3lP0oI9u";
export const T0 = Date.UTC(2026, 10, 22, 15, 0);

export function event(id: string, uid: string, over: Record<string, unknown>): Record<string, unknown> {
  return { eventId: id, schemaVersion: 1, incidentId: "drill-dev-1", teamId: "T1", deviceId: uid, seq: 1, authorUid: uid,
    role: "searcher", type: "cleared", reporter: "searcher", clientTimeMs: T0, observedAtMs: T0, serverTime: T0 + 900,
    position: { lat: 33.786, lon: -84.373, accuracyM: 8 }, positionSource: "gps", rawText: "Cleared AA, three of us, 40 minutes",
    inputMethod: "typed", isTrainingInject: false, reading: { kind: "cleared", note: "searchers' words" },
    effect: { kind: "none", why: "informational" }, route: null, targetEventId: null, decision: null, planVersion: 1,
    priorVersion: 2, ...over };
}

export function rawDrill(): RawRun {
  const segments = grid.segments.slice(0, 3).map((s: Record<string, unknown>) => ({ ...s, priorPoa: 0.2, priorVersion: 2,
    geometryJson: JSON.stringify(s.geometry), geometry: undefined }));
  return {
    incidentId: "drill-dev-1",
    incident: { name: "Development drill (synthetic)", mode: "drill", drillLabel: "Training drill. Nobody is missing.", status: "open",
      priorVersion: 2, priorInputEventIds: ["c".repeat(32)], engineParams: { sweepWidthFactor: 1.645 }, priorBuiltAt: T0 - 60_000,
      gridId: grid.gridId, gridAttribution: grid.attribution, ipp: { lat: 33.78, lon: -84.37 }, joinCodeHash: "f".repeat(64),
      expiresAt: T0 + 86_400_000 },
    segments: [...segments, { segmentId: "ROW", priorPoa: 0.4, priorVersion: 2 }],
    teams: [{ teamId: "T1", name: "Team 1", colorSlot: 1 }],
    devices: [{ teamId: "T1", deviceId: UID_A, clockOffsetMs: -120, packedAt: T0 }, { teamId: "T1", deviceId: UID_B }],
    measurements: [{ teamId: "T1", deviceId: UID_A, eventId: "a".repeat(32), submittedAtMs: T0, readDoneAtMs: T0 + 1200, redrawnAtMs: T0 + 1400 }],
    events: [
      event("a".repeat(32), UID_A, {}),
      event("b".repeat(32), UID_B, { type: "destination", role: "family", reporter: "family", position: { lat: 33.71, lon: -84.31, accuracyM: null },
        positionSource: "map_click", rawText: "Her old house on Elm", reading: null }),
      event("c".repeat(32), UID_A, { type: "camera_sighting", reporter: "camera", inputMethod: "clip", positionSource: "camera_pin",
        reading: { clipSha256: "e".repeat(64), clipStartMs: T0 - 3_600_000, clockConfirmed: true, cameraFacingDeg: 90,
          sighting: { personVisible: true, firstSeen: "00:02", lastSeen: "00:09", entryEdge: "left", exitEdge: "right", topColor: "red",
            bottomColor: "blue", topType: "coat", footwear: "slippers", headwear: "", carriedItems: [], lighting: "day", legibility: "clear",
            evidence: "walks right in a red coat", keyFrame: { time: "00:05", box2d: [100, 200, 600, 400] } } } }),
    ],
    plans: [{ version: 1, basedOnEventSetHash: "d".repeat(64), priorVersion: 2, approvedByUid: UID_A, approvedAt: T0 - 30_000,
      createdClientTimeMs: T0 - 31_000, wordingRoute: null,
      assignments: [{ teamId: "T1", segmentIds: ["AA"], taskText: "Sweep the creek bank.", reason: "High probability near water." }] }],
  };
}

export const meta = { runId: "drill-2026-11-22", label: "Training drill, Piedmont Park, 2026-11-22. Nobody was missing.", exportedAt: "2026-11-23T15:00:00Z" };
