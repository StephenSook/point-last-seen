// Starts the walker Worker for one run and resolves with its result and measured time.

import type { WalkerResult } from "@pls/engine";
import type { WalkerJob, WalkerMessage } from "./walkerJob";

export function runWalkersInWorker(job: Omit<WalkerJob, "type">, onProgress?: (done: number) => void): Promise<{ result: WalkerResult; elapsedMs: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./walkers.worker.ts", import.meta.url), { type: "module" });
    const finish = () => worker.terminate();
    worker.onmessage = (e: MessageEvent<WalkerMessage>) => {
      const m = e.data;
      if (m.type === "progress") onProgress?.(m.done);
      else if (m.type === "result") {
        finish();
        resolve({ result: m.result, elapsedMs: m.elapsedMs });
      } else {
        finish();
        reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      finish();
      reject(new Error(e.message || "The walker worker failed."));
    };
    worker.postMessage({ type: "run", ...job } satisfies WalkerJob);
  });
}
