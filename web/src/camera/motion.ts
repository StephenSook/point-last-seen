// On-device clip triage, step one (P-39): where in the clip does anything move? Grey frames
// sampled every half second at 64 x 36 are compared in pairs. A whole-frame brightness change
// (exposure, clouds) is removed before comparing, so only local change counts. Missing a person
// costs more than one extra cloud read, so the floor is low; it is provisional until measured on
// the staged clips. No model runs here.

export type MotionFrame = { t: number; px: Float32Array };
export type MotionWindow = { startS: number; endS: number; peakS: number; strength: number };

export const MOTION = {
  sampleEveryS: 0.5,
  width: 64,
  height: 36,
  /** Mean local change between two samples (0 to 1 grey) above which a pair counts as motion. */
  minDiff: 0.004,
  mergeGapS: 1,
  padS: 1,
  maxWindows: 4,
} as const;

/** Mean absolute change between two frames after removing their mean brightness change. */
function localChange(a: Float32Array, b: Float32Array): number {
  const n = a.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += b[i]! - a[i]!;
  mean /= n;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(b[i]! - a[i]! - mean);
  return s / n;
}

export function motionWindows(frames: readonly MotionFrame[], width: number, height: number, durationS: number, opts: typeof MOTION = MOTION): MotionWindow[] {
  if (frames.some((f) => f.px.length !== width * height)) throw new Error("Every frame must be width x height grey values.");
  const runs: MotionWindow[] = [];
  let open: MotionWindow | null = null;
  for (let i = 1; i < frames.length; i++) {
    const d = localChange(frames[i - 1]!.px, frames[i]!.px);
    if (d > opts.minDiff) {
      if (!open) open = { startS: frames[i - 1]!.t, endS: frames[i]!.t, peakS: frames[i]!.t, strength: d };
      else {
        open.endS = frames[i]!.t;
        if (d > open.strength) {
          open.peakS = frames[i]!.t;
          open.strength = d;
        }
      }
    } else if (open) {
      runs.push(open);
      open = null;
    }
  }
  if (open) runs.push(open);

  const merged: MotionWindow[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r.startS - last.endS <= opts.mergeGapS) {
      merged[merged.length - 1] = { startS: last.startS, endS: r.endS, peakS: r.strength > last.strength ? r.peakS : last.peakS, strength: Math.max(r.strength, last.strength) };
    } else merged.push({ ...r });
  }
  return merged
    .map((w) => ({ ...w, startS: Math.max(0, w.startS - opts.padS), endS: Math.min(durationS, w.endS + opts.padS) }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, opts.maxWindows)
    .sort((a, b) => a.startS - b.startS);
}
