// One trace per model call (plan Task 27): which path the call took and why, as four short
// attributes, and its latency. Never any report text, note, photo or answer.

import type { RouteRecord } from "@pls/engine";

export type TraceAttributes = { path: string; reason: string; platform: string; stage: string };

export function traceAttributes(route: RouteRecord): TraceAttributes {
  return { path: route.path, reason: route.reason, platform: route.platform, stage: route.stage };
}

export type TraceSink = {
  record: (name: string, startMs: number, durationMs: number, options: { attributes: TraceAttributes; metrics: { latency_ms: number } }) => void;
};

/**
 * Records the call; telemetry must never break the read it describes, so any failure is dropped. `name` sets the
 * trace's name for a read that has its own (the clip track read records "clip_track" too).
 */
export function recordInference(route: RouteRecord, sink: TraceSink, name = "hybrid-inference"): void {
  const duration = Math.max(0, Math.round(route.latencyMs));
  try {
    sink.record(name, route.decidedAtMs - duration, duration, { attributes: traceAttributes(route), metrics: { latency_ms: duration } });
  } catch {
    // dropped on purpose: the inference already happened and its result stands
  }
}
