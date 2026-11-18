import { DEFAULT_PARAMS } from "./params";
import type { EngineParams, SearchType } from "./types";

/** W = 1.645 x Rd (Koester et al. 2014). */
export function sweepWidth(detectionRangeM: number, params: EngineParams): number {
  return params.sweepWidthFactor * detectionRangeM;
}

/** L = V x (minutes x 60) x searchers, in that order. Hasty uses the hasty speed; sweep and unknown use sweep. */
export function trackLength(minutes: number, searchers: number, searchType: SearchType, params: EngineParams): number {
  const speed = searchType === "hasty" ? params.hastySpeedMps : params.sweepSpeedMps;
  return speed * (minutes * params.secondsPerMinute) * searchers;
}

/** C = (W x L) / A. */
export function coverage(sweepWidthM: number, trackLengthM: number, areaM2: number): number {
  return (sweepWidthM * trackLengthM) / areaM2;
}

/** POD = 1 - exp(-C) (Frost 1996). */
export function pod(c: number): number {
  return 1 - Math.exp(-c);
}

/** A stated value from 0 to 3 is a ratio; above 3 and up to 300 is a percentage; anything else is invalid. */
export function normalizeCoverage(v: number | null, params: EngineParams = DEFAULT_PARAMS): number | null | "invalid" {
  if (v === null) return null;
  if (!Number.isFinite(v)) return "invalid";
  if (v >= 0 && v <= params.coverageRatioMax) return v;
  if (v > params.coverageRatioMax && v <= params.coveragePercentMax) return v / 100;
  return "invalid";
}
