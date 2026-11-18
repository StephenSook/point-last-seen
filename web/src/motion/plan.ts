// Motion values (spec 22.1) and the 2-second REPORT beat as a plain list of
// steps. No animation library here: engine.ts plays the plan.

import type { ChangeResult } from "../command/changeModel";

export const MOTION = {
  enter: { ms: 350, ease: "out(3)" },
  exit: { ms: 250, ease: "inOut(3)" },
  swap: { ms: 350, ease: "inOut(3)" },
  stroke: { ms: 50, ease: "outQuart" },
  lineDraw: { minMs: 600, maxMs: 1000, ease: "inOutExpo" },
  release: { bounce: 0.35, ms: 400 },
  reducedFadeMs: 150,
  reducedHoldMs: 4000,
} as const;

export type BeatStep = {
  id: "pin" | "arc" | "lightness" | "pulse" | "chips" | "reorder" | "arcFade" | "fade";
  atMs: number;
  durationMs: number;
  ease: string;
  staggerMs?: number;
  order?: string[];
};

const BEAT_MS = 2000;
const MAX_SPREAD_MS = 300;

/**
 * The REPORT beat: pin, arc from the report to its segment, lightness cross-fade
 * (nearest changed segment first, spread capped at 300 ms), one outline pulse,
 * delta chips, rank reorder, arc fade. Reduced motion: one 150 ms fade.
 */
export function reportBeatPlan(change: ChangeResult, distanceM: Readonly<Record<string, number>>, reduced: boolean): BeatStep[] {
  if (reduced) return [{ id: "fade", atMs: 0, durationMs: MOTION.reducedFadeMs, ease: "linear" }];
  const order = change.changed
    .map((c) => c.segmentId)
    .sort((a, b) => (distanceM[a] ?? Infinity) - (distanceM[b] ?? Infinity) || a.localeCompare(b));
  const staggerMs = order.length > 1 ? Math.min(40, Math.floor(MAX_SPREAD_MS / (order.length - 1))) : 0;
  return [
    { id: "pin", atMs: 0, durationMs: MOTION.release.ms, ease: "spring" },
    { id: "arc", atMs: 100, durationMs: MOTION.lineDraw.minMs, ease: MOTION.lineDraw.ease },
    { id: "lightness", atMs: 300, durationMs: 800, ease: MOTION.swap.ease, staggerMs, order },
    { id: "pulse", atMs: 300, durationMs: MOTION.enter.ms, ease: MOTION.stroke.ease },
    { id: "chips", atMs: 900, durationMs: MOTION.enter.ms, ease: MOTION.enter.ease },
    { id: "reorder", atMs: 1100, durationMs: MOTION.swap.ms, ease: MOTION.swap.ease },
    { id: "arcFade", atMs: BEAT_MS - MOTION.exit.ms, durationMs: MOTION.exit.ms, ease: MOTION.exit.ease },
  ];
}

/** When the last step ends, counting each step's stagger spread. */
export function beatTotalMs(plan: readonly BeatStep[]): number {
  return Math.max(0, ...plan.map((s) => s.atMs + s.durationMs + (s.staggerMs ?? 0) * Math.max(0, (s.order?.length ?? 1) - 1)));
}
