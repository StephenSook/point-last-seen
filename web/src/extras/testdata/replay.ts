import type { CameraSightingReading, EventDoc, IncidentView, PlanDoc, SegmentDoc, StreamedEvent } from "../laneC";

// Made-up data for tests and dev harnesses only. Never on the judged path.
export const T0 = 1_795_372_800_000;

function square(segmentId: string, west: number, south: number, priorPoa: number): SegmentDoc {
  const d = 0.001;
  return {
    segmentId,
    geometry: { type: "Polygon", coordinates: [[[west, south], [west + d, south], [west + d, south + d], [west, south + d], [west, south]]] },
    centroid: { lat: south + d / 2, lon: west + d / 2 },
    areaM2: 10_000,
    priorPoa,
    neighbors: [],
    upstream: [],
    downstream: [],
  };
}

// priorBuiltAtMs is not on the incident type yet; the replay reads it when present.
export function replayView(over: Partial<IncidentView["incident"] & object> & { priorBuiltAtMs?: number } = {}): IncidentView {
  return {
    incident: { name: "Oak Park", mode: "drill", status: "open", priorVersion: 2, priorInputEventIds: ["e0"], ...over },
    teams: [{ teamId: "alfa", name: "Alfa" }, { teamId: "bravo", name: "Bravo" }],
    segments: [square("AA", -84.37, 33.78, 0.4), square("AB", -84.369, 33.78, 0.3), square("AC", -84.368, 33.78, 0.2)],
    rowPrior: 0.1,
    clockOffsets: { d1: 5_000, d2: -2_000 },
  };
}

export function eventDoc(over: Partial<EventDoc> & { eventId: string }): EventDoc {
  return {
    schemaVersion: 1,
    incidentId: "inc-1",
    teamId: "alfa",
    deviceId: "d1",
    seq: 1,
    authorUid: "uid-private",
    role: "searcher",
    type: "clue",
    reporter: "searcher",
    clientTimeMs: T0,
    serverTime: null,
    observedAtMs: null,
    position: null,
    positionSource: "none",
    rawText: null,
    inputMethod: "typed",
    isTrainingInject: false,
    reading: null,
    effect: { kind: "clue", influences: { AA: "strong_for" }, authenticity: "high" },
    route: null,
    targetEventId: null,
    decision: null,
    planVersion: null,
    priorVersion: 2,
    ...over,
  };
}

export function streamed(doc: EventDoc, serverTimeMs: number | null, pendingWrite = false): StreamedEvent {
  return { ...(doc as unknown as Record<string, unknown>), eventId: doc.eventId, serverTimeMs, pendingWrite };
}

export function cameraReading(over: Partial<CameraSightingReading> = {}, sighting: Partial<CameraSightingReading["sighting"]> = {}): CameraSightingReading {
  return {
    sighting: {
      personVisible: true,
      firstSeen: "00:10",
      lastSeen: "02:14",
      entryEdge: "left",
      exitEdge: "right",
      topColor: "blue",
      bottomColor: "gray",
      topType: "jacket",
      footwear: "",
      headwear: "",
      carriedItems: [],
      keyFrame: { time: "01:00", box2d: [10, 10, 50, 50] },
      lighting: "day",
      legibility: "clear",
      evidence: "",
      ...sighting,
    },
    clipSha256: "0".repeat(64),
    clipStartMs: 1_000_000,
    clockConfirmed: true,
    cameraFacingDeg: null,
    ...over,
  };
}

export function replayPlan(version: number, approvedMs: number): PlanDoc {
  return {
    version,
    basedOnEventSetHash: "0".repeat(64),
    priorVersion: 2,
    assignments: [{ teamId: "alfa", segmentIds: ["AA"], taskText: `Search AA on plan ${version}.`, reason: "Begin at the trail." }],
    wordingRoute: null,
    approvedByUid: "private-marker",
    approvedAt: { toMillis: () => approvedMs },
    createdClientTimeMs: approvedMs - 1_000,
  };
}
