import paramsFile from "../../constants/engine-params.json";
import type { ElevationParams, EngineParams } from "./types";

/** The engine constants from shared/constants/engine-params.json. Incidents carry their own copy. */
export const DEFAULT_PARAMS: EngineParams = paramsFile.params as unknown as EngineParams;

/** The elevation layer's constants: outside the stored params, since the layer is off by default and new. */
export const ELEVATION_PARAMS: ElevationParams = paramsFile.elevation as ElevationParams;

/**
 * An incident's stored params with anything they predate filled from the constants: a ring column added after
 * the incident was created (urban, 2026-11-18) comes from the sourced table, and every stored value is kept.
 */
export function withEngineDefaults(stored: Partial<EngineParams> | undefined): EngineParams {
  if (stored === undefined) return DEFAULT_PARAMS;
  return { ...DEFAULT_PARAMS, ...stored, rings: { ...DEFAULT_PARAMS.rings, ...(stored.rings ?? {}) } };
}
