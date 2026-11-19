// On-device clip triage (P-39): before a clip leaves this laptop, find where it moves (code only)
// and ask this laptop's model whether a person is in one frame per moving span. A clip with no
// motion, or with no person in any span, is not uploaded or sent; for a flagged clip the cloud
// model reads only the flagged seconds. Without the built-in model, or when triage fails, the clip
// goes to the consented cloud read as before.

import type { RouteRecord } from "@pls/engine";
import type { ClipWindow } from "../ai/clipRead";
import { parseFrameCheck } from "../ai/frameCheck";
import { MOTION, motionWindows, type MotionFrame, type MotionWindow } from "./motion";

export type TriageDeps = {
  /** The gate, asked with the frame check's options. */
  available: () => Promise<boolean>;
  sample: () => Promise<{ durationS: number; frames: MotionFrame[] }>;
  frameJpeg: (t: number) => Promise<string>;
  /** `inferenceSource` is the SDK's own report of where the check ran, when it gives one. */
  checkFrame: (jpegBase64: string) => Promise<{ text: string; inferenceSource?: string }>;
  now: () => number;
};

export type TriageResult =
  | { kind: "no-model" }
  | { kind: "unavailable" }
  | { kind: "no-motion"; latencyMs: number }
  /** `source`: on_device only when the SDK reported it for every frame check; in_cloud if any check said so. */
  | { kind: "no-person"; windows: MotionWindow[]; latencyMs: number; source: "on_device" | "in_cloud" | "unknown" }
  | { kind: "flagged"; window: ClipWindow; windows: MotionWindow[]; latencyMs: number };

export async function triageClip(d: TriageDeps): Promise<TriageResult> {
  if (!(await d.available())) return { kind: "no-model" };
  const t0 = d.now();
  try {
    const { durationS, frames } = await d.sample();
    const windows = motionWindows(frames, MOTION.width, MOTION.height, durationS);
    if (windows.length === 0) return { kind: "no-motion", latencyMs: d.now() - t0 };
    const flagged: MotionWindow[] = [];
    const sources: (string | undefined)[] = [];
    for (const w of windows) {
      const reply = await d.checkFrame(await d.frameJpeg(w.peakS));
      sources.push(reply.inferenceSource);
      const seen = parseFrameCheck(reply.text);
      // An answer that cannot be read counts as a person, so a person is never missed for it.
      if (seen !== false) flagged.push(w);
    }
    const latencyMs = d.now() - t0;
    if (flagged.length === 0) {
      const source = sources.includes("in_cloud") ? "in_cloud" : sources.every((s) => s === "on_device") ? "on_device" : "unknown";
      return { kind: "no-person", windows, latencyMs, source };
    }
    return { kind: "flagged", window: { startS: flagged[0]!.startS, endS: flagged[flagged.length - 1]!.endS }, windows, latencyMs };
  } catch {
    return { kind: "unavailable" };
  }
}

/**
 * The route of a triage result that sent nothing, for the hybrid-inference trace (it is never
 * stored): no motion is a code decision, no person is this laptop's model. Other results are
 * traced by the cloud read they lead to.
 */
export function triageRoute(t: TriageResult, nowMs: number): RouteRecord | null {
  if (t.kind === "no-motion") {
    return { platform: "web", path: "rules", stage: "deterministic_parser", model: "motion-check", reason: "triage_no_motion", latencyMs: t.latencyMs, sdkReported: false, blocked: null, decidedAtMs: nowMs };
  }
  if (t.kind === "no-person") {
    // Only the SDK's own report says where the checks ran; with none the path is unknown, never this laptop.
    const path = t.source === "on_device" ? "on_device" : t.source === "in_cloud" ? "cloud" : "unknown";
    return { platform: "web", path, stage: "sdk", model: "chrome-built-in", reason: "on_device_triage_no_person", latencyMs: t.latencyMs, sdkReported: t.source !== "unknown", blocked: null, decidedAtMs: nowMs };
  }
  return null;
}
