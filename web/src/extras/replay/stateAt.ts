// The map at any replay time, recomputed from the events that had arrived by then. Firestore keeps only the
// current prior, so a time before that prior came into use has no stored map: that span shows reports only.

import { viewState, type ViewState } from "../laneC";
import type { ReplayData, ReplayEvent } from "./replayData";

export type ReplayWindow = { startMs: number; endMs: number; priorInUseFromMs: number };

export type ReplayFrame =
  | { phase: "before_prior"; tMs: number; shown: ReplayEvent[] }
  | { phase: "replayable"; tMs: number; shown: ReplayEvent[]; view: ViewState; planVersion: number | null };

/**
 * When the current prior came into use. `priorBuiltAtMs` when the incident records it. The first prior (version 1)
 * was in use from the start. Otherwise the earliest server time stamped with the current prior's version (a report's
 * arrival or a plan's approval): no phone or seat can stamp a version before it exists, so the prior was in use by
 * then, and earlier frames show reports only. That can hide a replayable span; it never shows a map command did not
 * see. "end" when nothing carries the version: only the end of the window shows a map.
 */
function priorInUseFrom(data: ReplayData): number | "start" | "end" {
  if (data.priorBuiltAtMs !== null) return data.priorBuiltAtMs;
  if (data.priorVersion <= 1) return "start";
  let earliest: number | null = null;
  for (const e of data.events) {
    if (e.arrivedAtMs !== null && e.doc.priorVersion === data.priorVersion) earliest = Math.min(earliest ?? e.arrivedAtMs, e.arrivedAtMs);
  }
  for (const p of data.plans) {
    if (p.priorVersion === data.priorVersion) earliest = Math.min(earliest ?? p.approvedAtMs, p.approvedAtMs);
  }
  return earliest ?? "end";
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
  const endMs = Math.max(...ends, typeof from === "number" ? from : -Infinity);
  return { startMs, endMs, priorInUseFromMs: from === "start" ? startMs : from === "end" ? endMs : from };
}

/**
 * What a frame at tMs depends on: how many reports had arrived, whether the current prior was in use, and the plan in
 * force. Two times with the same key give the same frame, so a panel recomputes the map only when the key changes,
 * not on every animation frame of a playback.
 */
export function frameKey(data: ReplayData, w: ReplayWindow, tMs: number): string {
  let arrived = 0;
  // Events are ordered by arrival with pending writes last, so the count stops at the first one not yet arrived.
  for (const e of data.events) {
    if (e.arrivedAtMs === null || e.arrivedAtMs > tMs) break;
    arrived++;
  }
  let plan = -1;
  for (const p of data.plans) if (p.approvedAtMs <= tMs && p.version > plan) plan = p.version;
  return `${arrived}|${tMs >= w.priorInUseFromMs ? "prior" : "before"}|${plan}`;
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
