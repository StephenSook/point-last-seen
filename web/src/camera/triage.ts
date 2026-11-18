// On-device clip triage (P-39): before a clip leaves this laptop, find where it moves (code only)
// and ask this laptop's model whether a person is in one frame per moving span. A clip with no
// motion, or with no person in any span, is not uploaded or sent; for a flagged clip the cloud
// model reads only the flagged seconds. Without the built-in model, or when triage fails, the clip
// goes to the consented cloud read as before.

import type { ClipWindow } from "../ai/clipRead";
import { parseFrameCheck } from "../ai/frameCheck";
import { MOTION, motionWindows, type MotionFrame, type MotionWindow } from "./motion";

export type TriageDeps = {
  /** The gate, asked with the frame check's options. */
  available: () => Promise<boolean>;
  sample: () => Promise<{ durationS: number; frames: MotionFrame[] }>;
  frameJpeg: (t: number) => Promise<string>;
  checkFrame: (jpegBase64: string) => Promise<{ text: string }>;
  now: () => number;
};

export type TriageResult =
  | { kind: "no-model" }
  | { kind: "unavailable" }
  | { kind: "no-motion"; latencyMs: number }
  | { kind: "no-person"; windows: MotionWindow[]; latencyMs: number }
  | { kind: "flagged"; window: ClipWindow; windows: MotionWindow[]; latencyMs: number };

export async function triageClip(d: TriageDeps): Promise<TriageResult> {
  if (!(await d.available())) return { kind: "no-model" };
  const t0 = d.now();
  try {
    const { durationS, frames } = await d.sample();
    const windows = motionWindows(frames, MOTION.width, MOTION.height, durationS);
    if (windows.length === 0) return { kind: "no-motion", latencyMs: d.now() - t0 };
    const flagged: MotionWindow[] = [];
    for (const w of windows) {
      const seen = parseFrameCheck((await d.checkFrame(await d.frameJpeg(w.peakS))).text);
      // An answer that cannot be read counts as a person, so a person is never missed for it.
      if (seen !== false) flagged.push(w);
    }
    const latencyMs = d.now() - t0;
    if (flagged.length === 0) return { kind: "no-person", windows, latencyMs };
    return { kind: "flagged", window: { startS: flagged[0]!.startS, endS: flagged[flagged.length - 1]!.endS }, windows, latencyMs };
  } catch {
    return { kind: "unavailable" };
  }
}
