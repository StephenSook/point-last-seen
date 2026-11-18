// The only file that imports animejs (spec 22.1; the rules gate checks it).
// It plays plans built by plan.ts: every step animates a plain progress value
// from 0 to 1, and the caller applies it to the map, the chips or the rank list.
// API names below were read from animejs 4.5.0's own type files:
// createTimeline (add, label), createScope ({ mediaQueries }, matches), spring ({ bounce, duration }).

import { createScope, createTimeline, spring } from "animejs";
import { MOTION, type BeatStep } from "./plan";

const REDUCE = "(prefers-reduced-motion: reduce)";

/**
 * One scope for the command post's motion. `run` gets whether the person asked for
 * reduced motion, and runs again when that preference changes; whatever it returns
 * is used as its cleanup.
 */
export function motionScope(run: (reduced: boolean) => void | (() => void)): { revert(): void } {
  const scope = createScope({ mediaQueries: { reduce: REDUCE } }).add((s) => run(s?.matches["reduce"] === true));
  return { revert: () => scope.revert() };
}

export type BeatTargets = {
  /** A step's progress, 0 to 1. `segmentId` is set for the per-segment (staggered) steps. */
  progress: (id: BeatStep["id"], segmentId: string | null, t: number) => void;
  done: () => void;
};

/** Plays a REPORT beat plan as one timeline labelled REPORT. Cancel stops it where it is. */
export function playReportBeat(plan: readonly BeatStep[], targets: BeatTargets): { cancel(): void } {
  const tl = createTimeline({ onComplete: () => targets.done() });
  tl.label("REPORT", 0);
  for (const step of plan) {
    const ease = step.ease === "spring" ? spring({ bounce: MOTION.release.bounce, duration: MOTION.release.ms }) : step.ease;
    const parts = step.order && step.order.length > 0 ? step.order.map((id, i) => [id, step.atMs + i * (step.staggerMs ?? 0)] as const) : [[null, step.atMs] as const];
    for (const [segmentId, at] of parts) {
      const o = { t: 0 };
      tl.add(o, { t: 1, duration: step.durationMs, ease, onUpdate: () => targets.progress(step.id, segmentId, o.t) }, at);
    }
  }
  return { cancel: () => void tl.cancel() };
}
