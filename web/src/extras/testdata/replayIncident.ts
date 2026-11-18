import type { EventDoc, IncidentView, PlanDoc, SegmentDoc, StreamedEvent } from "../laneC";
import type { PublishedRunV1, RunEvent } from "../replay/runContract";
import { drillView } from "./fixtures";
import { T0, eventDoc, replayPlan, streamed } from "./replay";

// Made-up data for the replay harness pages. Dev server only; never in the production build.
const MIN = 60_000;
const LAT = 33.78;
const LON = -84.37;
const D = 0.004;

function cell(segmentId: string, col: number, row: number, priorPoa: number): SegmentDoc {
  const w = LON + col * D;
  const s = LAT + row * D;
  return {
    segmentId, priorPoa, areaM2: 160_000, neighbors: [], upstream: [], downstream: [],
    centroid: { lon: w + D / 2, lat: s + D / 2 },
    geometry: { type: "Polygon", coordinates: [[[w, s], [w + D, s], [w + D, s + D], [w, s + D], [w, s]]] },
  };
}

const segments = [cell("AA", 0, 0, 0.3), cell("AB", 1, 0, 0.25), cell("BA", 0, 1, 0.2), cell("BB", 1, 1, 0.15)];
const here = (col: number, row: number) => ({ lat: LAT + (row + 0.5) * D, lon: LON + (col + 0.5) * D, accuracyM: 5 });
const cmd = { role: "command", teamId: null, deviceId: "cmd" } as const;
const docs: [EventDoc, number][] = [
  // Sent at +1 min, arrived at +9: eight minutes without signal.
  [eventDoc({ eventId: "r1", clientTimeMs: T0 + MIN, deviceId: "d1", effect: { kind: "clue", influences: { AA: "strong_for" }, authenticity: "high" } }), T0 + 9 * MIN],
  [eventDoc({ eventId: "s1", type: "sighting", clientTimeMs: T0 + 3 * MIN, observedAtMs: T0 + 3 * MIN, deviceId: "d1", position: here(0, 0), effect: { kind: "clue", influences: { AA: "for" }, authenticity: "high" } }), T0 + 4 * MIN],
  [eventDoc({ ...cmd, eventId: "c1", type: "confirmation", clientTimeMs: T0 + 5 * MIN, targetEventId: "s1", decision: "confirmed", effect: { kind: "none", why: "informational" } }), T0 + 5 * MIN],
  [eventDoc({ eventId: "s2", type: "sighting", teamId: "bravo", clientTimeMs: T0 + 12 * MIN, observedAtMs: T0 + 12 * MIN, deviceId: "d2", position: here(1, 1), effect: { kind: "clue", influences: { BB: "for" }, authenticity: "high" } }), T0 + 13 * MIN],
  [eventDoc({ ...cmd, eventId: "c2", type: "confirmation", clientTimeMs: T0 + 14 * MIN, targetEventId: "s2", decision: "confirmed", effect: { kind: "none", why: "informational" } }), T0 + 14 * MIN],
  [eventDoc({ eventId: "r2", clientTimeMs: T0 + 16 * MIN, deviceId: "d1", effect: { kind: "clue", influences: { AB: "for" }, authenticity: "medium" } }), T0 + 16 * MIN],
];

/** One drill incident whose current prior came into use at +6 min, so the first five minutes have no stored map. */
export function harnessIncident(): { view: IncidentView; events: StreamedEvent[]; plans: PlanDoc[] } {
  const view: IncidentView = {
    ...drillView,
    // priorBuiltAtMs is not on lane C's incident type yet; the replay reads it when present.
    incident: { ...drillView.incident!, priorVersion: 2, priorInputEventIds: [], ...{ priorBuiltAtMs: T0 + 6 * MIN } },
    segments,
    rowPrior: 0.1,
    clockOffsets: { d1: 0, d2: 0 },
  };
  return { view, events: docs.map(([d, at]) => streamed(d, at)), plans: [replayPlan(1, T0 + 7 * MIN), replayPlan(2, T0 + 15 * MIN)] };
}

/** A stored event as the published run writes it (runContract.ts): no uid, no report text, numeric server time. */
export function runEvent(doc: EventDoc, serverTimeMs: number): RunEvent {
  const { serverTime: _serverTime, rawText: _rawText, reading, ...rest } = doc;
  return { ...rest, authorUid: "author-1", rawText: null, reading: reading as RunEvent["reading"], serverTimeMs };
}

/** The same incident as a published run file, typed as the contract. */
export function harnessRun(): PublishedRunV1 {
  const { view, plans } = harnessIncident();
  const inc = view.incident!;
  return {
    runId: "harness-run",
    label: inc.drillLabel ?? "Training drill. Nobody is missing.",
    exportedAt: "2026-11-23T12:00:00Z",
    incident: { name: inc.name, mode: inc.mode, priorVersion: inc.priorVersion, priorInputEventIds: [], priorBuiltAtMs: T0 + 6 * MIN },
    segments: [...segments.map(({ geometry, ...s }) => ({ ...s, geometryJson: JSON.stringify(geometry) })), { segmentId: "ROW", priorPoa: 0.1 }],
    teams: view.teams,
    devices: [{ deviceId: "d1", teamId: "alfa", clockOffsetMs: 0 }, { deviceId: "d2", teamId: "bravo", clockOffsetMs: 0 }],
    events: docs.map(([d, at]) => runEvent(d, at)),
    plans: plans.map((p) => ({ version: p.version, approvedAtMs: (p.approvedAt as { toMillis(): number }).toMillis(), priorVersion: p.priorVersion, basedOnEventSetHash: p.basedOnEventSetHash, assignments: p.assignments })),
    measurements: {},
  };
}
