// The map at any replay time, recomputed from the events that had arrived by then. Firestore keeps only the
// current prior, so a time before that prior came into use has no stored map: that span shows reports only.

import { viewState, type ViewState } from "../laneC";
import type { ReplayData, ReplayEvent } from "./replayData";

export type ReplayWindow = { startMs: number; endMs: number; priorInUseFromMs: number };

export type ReplayFrame =
  | { phase: "before_prior"; tMs: number; shown: ReplayEvent[] }
  | { phase: "replayable"; tMs: number; shown: ReplayEvent[]; view: ViewState; planVersion: number | null };

/**
 * When the current prior came into use. `priorBuiltAtMs` when the incident records it. Otherwise the latest arrival
 * among the prior's own input reports and reports written under an older prior: conservative, it can hide a span
 * that was replayable, and never shows a map command did not see. Null when nothing bounds it.
 */
function priorInUseFrom(data: ReplayData): number | null {
  if (data.priorBuiltAtMs !== null) return data.priorBuiltAtMs;
  const inputs = new Set(data.priorInputEventIds);
  let latest: number | null = null;
  for (const e of data.events) {
    if (e.arrivedAtMs === null) continue;
    if (inputs.has(e.eventId) || e.doc.priorVersion < data.priorVersion) latest = Math.max(latest ?? e.arrivedAtMs, e.arrivedAtMs);
  }
  return latest;
}

/** From the first send to the last arrival or plan approval; null when no event has arrived. */
export function replayWindow(data: ReplayData): ReplayWindow | null {
  const arrived = data.events.filter((e) => e.arrivedAtMs !== null);
  if (arrived.length === 0) return null;
  const starts = arrived.map((e) => (e.clockSuspect ? e.arrivedAtMs! : Math.min(e.sentAtMs, e.arrivedAtMs!)));
  const ends = arrived.map((e) => e.arrivedAtMs!);
  for (const p of data.plans) {
    starts.push(p.approvedAtMs);
    ends.push(p.approvedAtMs);
  }
  const startMs = Math.min(...starts);
  const from = priorInUseFrom(data);
  // A prior that came into use after the last report is still the one the live map draws, so the window reaches it.
  const endMs = Math.max(...ends, from ?? -Infinity);
  return { startMs, endMs, priorInUseFromMs: from === null ? startMs : from };
}

/** Every event that had arrived by tMs (pending writes never), and, once the current prior is in use, its map. */
export function stateAt(data: ReplayData, tMs: number): ReplayFrame {
  const shown = data.events.filter((e) => e.arrivedAtMs !== null && e.arrivedAtMs <= tMs);
  const w = replayWindow(data);
  if (w === null || tMs < w.priorInUseFromMs) return { phase: "before_prior", tMs, shown };
  const view = viewState(data.prior, shown.map((e) => e.doc), data.priorInputEventIds, data.params, data.priorVersion);
  let planVersion: number | null = null;
  for (const p of data.plans) if (p.approvedAtMs <= tMs && (planVersion === null || p.version > planVersion)) planVersion = p.version;
  return { phase: "replayable", tMs, shown, view, planVersion };
}
