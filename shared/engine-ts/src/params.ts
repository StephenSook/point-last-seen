import paramsFile from "../../constants/engine-params.json";
import type { EngineParams } from "./types";

/** The engine constants from shared/constants/engine-params.json. Incidents carry their own copy. */
export const DEFAULT_PARAMS: EngineParams = paramsFile.params as unknown as EngineParams;
