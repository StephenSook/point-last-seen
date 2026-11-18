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

/**
 * The probability ripple (22.1): each dot grows from nothing to its size over 400 ms
 * out(3), starting after its own delay. With reduced motion nothing animates: the
 * caller is told at once that the dots are final.
 */
export function playRipple(delaysMs: readonly number[], reduced: boolean, apply: (index: number, t: number) => void, done: () => void): { cancel(): void } {
  if (reduced || delaysMs.length === 0) {
    delaysMs.forEach((_, i) => apply(i, 1));
    done();
    return { cancel: () => {} };
  }
  const tl = createTimeline({ onComplete: () => done() });
  tl.label("RIPPLE", 0);
  delaysMs.forEach((at, i) => {
    const o = { t: 0 };
    apply(i, 0);
    tl.add(o, { t: 1, duration: MOTION.enter.ms + 50, ease: MOTION.enter.ease, onUpdate: () => apply(i, o.t) }, at);
  });
  return { cancel: () => void tl.cancel() };
}

/**
 * FLIP: each moved row starts at its old place (translateY by dy) and slides to its
 * new place over 350 ms inOut(3), after `delayMs`. Reduced motion: no slide.
 */
export function playFlip(items: readonly { el: HTMLElement; dy: number }[], delayMs: number, reduced: boolean): { cancel(): void } {
  if (reduced || items.length === 0) return { cancel: () => {} };
  const reset = () => items.forEach(({ el }) => (el.style.transform = ""));
  for (const { el, dy } of items) el.style.transform = `translateY(${dy}px)`;
  const tl = createTimeline({ onComplete: reset });
  for (const { el, dy } of items) {
    const o = { t: 0 };
    tl.add(o, { t: 1, duration: MOTION.swap.ms, ease: MOTION.swap.ease, onUpdate: () => (el.style.transform = `translateY(${dy * (1 - o.t)}px)`) }, delayMs);
  }
  return {
    cancel: () => {
      tl.cancel();
      reset();
    },
  };
}
