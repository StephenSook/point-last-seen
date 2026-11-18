// One walker run, as the Web Worker does it: the engine's seeded simulation, with the
// time it took on this machine. Kept apart from the worker file so it can be tested.

import { simulateWalkers, type WalkerGrid, type WalkerOptions, type WalkerResult, type WalkerRouteGraph } from "@pls/engine";

export type WalkerJob = { type: "run"; graph: WalkerRouteGraph; grid: WalkerGrid; opts: WalkerOptions };
export type WalkerMessage =
  | { type: "progress"; done: number }
  | { type: "result"; result: WalkerResult; elapsedMs: number }
  | { type: "error"; message: string };

export function runWalkerJob(job: WalkerJob, post: (m: WalkerMessage) => void, now: () => number = () => performance.now()): void {
  post({ type: "progress", done: 0 });
  const t0 = now();
  let result: WalkerResult;
  try {
    // The engine reports every 1,000 walkers and once at the end; the table is the same with or without it.
    result = simulateWalkers(job.graph, job.grid, { ...job.opts, onProgress: (done) => post({ type: "progress", done }) });
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : "The walker run failed." });
    return;
  }
  post({ type: "result", result, elapsedMs: now() - t0 });
}
