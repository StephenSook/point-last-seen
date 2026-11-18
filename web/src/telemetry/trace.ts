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

/** Records the call; telemetry must never break the read it describes, so any failure is dropped. */
export function recordInference(route: RouteRecord, sink: TraceSink): void {
  const duration = Math.max(0, Math.round(route.latencyMs));
  try {
    sink.record("hybrid-inference", route.decidedAtMs - duration, duration, { attributes: traceAttributes(route), metrics: { latency_ms: duration } });
  } catch {
    // dropped on purpose: the inference already happened and its result stands
  }
}
