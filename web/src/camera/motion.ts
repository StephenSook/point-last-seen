// On-device clip triage, step one (P-39): where in the clip does anything move? Grey frames
// sampled every half second at 64 x 36 are compared in pairs. A whole-frame brightness change
// (exposure, clouds) is removed first, then the pair counts as motion when enough cells changed
// by more than sensor noise. Counting cells, not averaging the frame, keeps a small or distant
// figure from being diluted by the still background. Missing a person costs more than one extra
// cloud read, so the thresholds are low; they are provisional until measured on the staged
// clips. No model runs here.

export type MotionFrame = { t: number; px: Float32Array };
/** A moving span; strength is the most cells changed between two of its samples. */
export type MotionWindow = { startS: number; endS: number; peakS: number; strength: number };

export const MOTION = {
  sampleEveryS: 0.5,
  width: 64,
  height: 36,
  /** A cell changed when its grey value moved by more than this (0 to 1), beyond the frame's mean change. */
  cellDiff: 0.06,
  /** A pair of samples counts as motion when at least this many cells changed. */
  minCells: 4,
  mergeGapS: 1,
  padS: 1,
  maxWindows: 4,
} as const;

/** How many cells changed between two frames, after removing their mean brightness change. */
export function changedCells(a: Float32Array, b: Float32Array, cellDiff: number = MOTION.cellDiff): number {
  const n = a.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += b[i]! - a[i]!;
  mean /= n;
  let c = 0;
  for (let i = 0; i < n; i++) if (Math.abs(b[i]! - a[i]! - mean) > cellDiff) c++;
  return c;
}

export function motionWindows(frames: readonly MotionFrame[], width: number, height: number, durationS: number, opts: typeof MOTION = MOTION): MotionWindow[] {
  if (frames.some((f) => f.px.length !== width * height)) throw new Error("Every frame must be width x height grey values.");
  const runs: MotionWindow[] = [];
  let open: MotionWindow | null = null;
  for (let i = 1; i < frames.length; i++) {
    const d = changedCells(frames[i - 1]!.px, frames[i]!.px, opts.cellDiff);
    if (d >= opts.minCells) {
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
