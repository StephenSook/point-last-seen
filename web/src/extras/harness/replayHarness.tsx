import { createRoot } from "react-dom/client";
import { ExtrasDock } from "../ExtrasDock";
import { viewState, type EventDoc, type PostState, type SegmentDoc } from "../laneC";
import { fromLive } from "../replay/replayData";
import { T0, eventDoc, replayPlan, streamed } from "../testdata/replay";
import { drillView } from "../testdata/fixtures";

// Made-up harness data for the replay e2e. Dev server only; never in the production build.
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
const events = docs.map(([d, at]) => streamed(d, at));
const plans = [replayPlan(1, T0 + 7 * MIN), replayPlan(2, T0 + 15 * MIN)];
const view = {
  ...drillView,
  // The current prior came into use at +6 min, so the first five minutes have no stored map.
  // priorBuiltAtMs is not on lane C's incident type yet; the replay reads it when present.
  incident: { ...drillView.incident!, priorVersion: 2, priorInputEventIds: [], ...{ priorBuiltAtMs: T0 + 6 * MIN } },
  segments,
  rowPrior: 0.1,
  clockOffsets: { d1: 0, d2: 0 },
};
const state: PostState = { view, events, plans, profile: null, denied: false, offline: false };

// The live header computes the map exactly as the command post does.
const live = fromLive(view, events, plans)!;
const vs = viewState(live.prior, events as unknown as EventDoc[], live.priorInputEventIds, live.params, live.priorVersion);

const root = document.getElementById("root");
if (!root) throw new Error("Missing harness root");
createRoot(root).render(
  <main>
    <header className="post-head">
      <span className="drill">{view.incident.drillLabel ?? "Training drill. Nobody is missing."}</span>
      <span>Made-up harness data</span>
      <span>Live match code <span className="num" data-testid="live-code">{vs.code}</span></span>
      <ExtrasDock incidentId="replay-harness" state={state} vs={vs} map={null} />
    </header>
  </main>,
);
