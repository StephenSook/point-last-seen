import type { Authenticity, EngineParams, Influence } from "./types";

/** IOC = 1 - weight x (1 - base): PLS v1 likelihood table (ours), CASIE update rule. */
export function ioc(influence: Influence, authenticity: Authenticity, params: EngineParams): number {
  return 1 - params.authenticityWeight[authenticity] * (1 - params.iocBase[influence]);
}
