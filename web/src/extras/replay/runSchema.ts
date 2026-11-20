// The type of every field a public run may carry (runContract.ts lists the fields). The reader checks each field
// that is present against its type, so a value of the wrong kind (an array where an object belongs, text where a
// number belongs) refuses the run with the field's name instead of reaching code that would draw it or throw on it.
// Which fields must be present is decided by the reader, which needs only some of them.

import { DEFAULT_PARAMS, isWellFormedEffect, ROUTE_MODEL_MAX } from "../hostApp";
import { DEVICE_PSEUDONYM, ROUTE_ENUMS, RUN_ENUMS } from "./runContract";

/** Returns the path of the first part of `v` that is not of the type, under `at`, or null when it all is. */
type Check = (v: unknown, at: string) => string | null;

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ok = (good: boolean, at: string) => (good ? null : at);

const text: Check = (v, at) => ok(typeof v === "string", at);
const number: Check = (v, at) => ok(typeof v === "number" && Number.isFinite(v), at);
const yesNo: Check = (v, at) => ok(typeof v === "boolean", at);
const oneOf = (values: readonly unknown[]): Check => (v, at) => ok(values.includes(v), at);
const orNull = (c: Check): Check => (v, at) => (v === null ? null : c(v, at));
const listOf = (c: Check): Check => (v, at) => (Array.isArray(v) ? (v.every((x) => c(x, at) === null) ? null : at) : at);

/** An object with exactly these fields: `need` must be present, `may` may be absent, nothing else. */
function shape(need: Record<string, Check>, may: Record<string, Check> = {}): Check {
  return (v, at) => {
    if (!isPlain(v)) return at;
    // Own fields only: `in` would also find inherited names such as toString or __proto__.
    for (const k of Object.keys(v)) if (!Object.hasOwn(need, k) && !Object.hasOwn(may, k)) return at;
    for (const [k, c] of Object.entries(need)) {
      if (!Object.hasOwn(v, k)) return at;
      const bad = c(v[k], `${at}.${k}`);
      if (bad) return bad;
    }
    for (const [k, c] of Object.entries(may)) {
      if (!Object.hasOwn(v, k)) continue;
      const bad = c(v[k], `${at}.${k}`);
      if (bad) return bad;
    }
    return null;
  };
}

const latitude: Check = (v, at) => ok(typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90, at);
const longitude: Check = (v, at) => ok(typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180, at);
const position = shape({ lat: latitude, lon: longitude }, { accuracyM: orNull(number) });
const cameraReading = shape({
  clipStartMs: number,
  clockConfirmed: yesNo,
  sighting: shape({ personVisible: yesNo, firstSeen: text, lastSeen: text, keyFrame: shape({ time: text }) }),
});
const assignment = shape({ teamId: text, segmentIds: listOf(text), taskText: text, reason: text });
/** The exact shape of `model`: the same fields, with a number where it has a number, and so on down. */
function like(model: unknown): Check {
  if (typeof model === "number") return number;
  if (typeof model === "boolean") return yesNo;
  if (typeof model === "string") return text;
  if (Array.isArray(model)) return listOf(model.length > 0 ? like(model[0]) : () => "never");
  if (isPlain(model)) return shape(Object.fromEntries(Object.entries(model).map(([k, v]) => [k, like(v)])));
  return (_v, at) => at;
}
// Engine settings have exactly the engine's own fields (its defaults show them), all numbers or flags.
const engineParams = like(DEFAULT_PARAMS);
const devicePseudonym: Check = (v, at) => ok(typeof v === "string" && DEVICE_PSEUDONYM.test(v), at);
const measurement = shape(
  { eventId: text, deviceId: devicePseudonym },
  { teamId: orNull(text), submittedAtMs: orNull(number), readDoneAtMs: orNull(number), redrawnAtMs: orNull(number) },
);
// The engine's own exact check for an effect: each kind's fields and nothing else.
const effect: Check = (v, at) => ok(isWellFormedEffect(v), at);
// A route's values are the route record's own, as the exporter checks them too: the coded fields from their lists,
// a model id no longer than the schema allows (so no note text can ride along in one), and times at or above zero.
const modelId: Check = (v, at) => ok(typeof v === "string" && v.length <= ROUTE_MODEL_MAX, at);
const atLeastZero: Check = (v, at) => ok(typeof v === "number" && Number.isFinite(v) && v >= 0, at);
const route = shape({
  platform: oneOf(ROUTE_ENUMS.platform),
  path: oneOf(ROUTE_ENUMS.path),
  stage: oneOf(ROUTE_ENUMS.stage),
  model: modelId,
  reason: oneOf(ROUTE_ENUMS.reason),
  latencyMs: atLeastZero,
  sdkReported: yesNo,
  blocked: oneOf(ROUTE_ENUMS.blocked),
  decidedAtMs: atLeastZero,
});

/** The type of each field, per part of the run. Only fields the contract lists appear. */
export const RUN_TYPES: Record<"run" | "incident" | "segment" | "row" | "team" | "device" | "event" | "plan", Record<string, Check>> = {
  run: { runId: text, label: text, exportedAt: text, measurements: listOf(measurement) },
  incident: {
    name: text,
    mode: oneOf(["drill", "judge"]),
    drillLabel: orNull(text),
    priorVersion: number,
    priorInputEventIds: listOf(text),
    engineParams: orNull(engineParams),
    priorBuiltAtMs: orNull(number),
    gridId: orNull(text),
    gridAttribution: orNull(text),
  },
  segment: {
    segmentId: text,
    nearFrac: number,
    featureClasses: listOf(text),
    priorPoa: number,
    geometryJson: text,
    centroid: shape({ lat: latitude, lon: longitude }),
    areaM2: number,
    neighbors: listOf(text),
    upstream: listOf(text),
    downstream: listOf(text),
  },
  row: { segmentId: oneOf(["ROW"]), priorPoa: number },
  team: { teamId: text, name: text },
  device: { deviceId: text, teamId: orNull(text), clockOffsetMs: orNull(number) },
  event: {
    eventId: text,
    schemaVersion: oneOf([1]),
    incidentId: text,
    teamId: orNull(text),
    deviceId: text,
    seq: number,
    authorUid: text,
    role: oneOf(RUN_ENUMS.role),
    type: oneOf(RUN_ENUMS.type),
    reporter: oneOf(RUN_ENUMS.reporter),
    clientTimeMs: number,
    observedAtMs: orNull(number),
    position: orNull(position),
    positionSource: oneOf(RUN_ENUMS.positionSource),
    rawText: oneOf([null]),
    inputMethod: oneOf(RUN_ENUMS.inputMethod),
    isTrainingInject: yesNo,
    reading: orNull(cameraReading),
    effect,
    route: orNull(route),
    targetEventId: orNull(text),
    decision: oneOf(RUN_ENUMS.decision),
    planVersion: orNull(number),
    priorVersion: number,
    serverTimeMs: number,
  },
  plan: { version: number, approvedAtMs: number, priorVersion: number, basedOnEventSetHash: text, assignments: listOf(assignment) },
};

/** The first field of `o` present with the wrong type, as "where.field" (or "field" at the top), or null. */
export function wrongType(o: Record<string, unknown>, types: Record<string, Check>, where: string | null): string | null {
  for (const [k, v] of Object.entries(o)) {
    const c = Object.hasOwn(types, k) ? types[k] : undefined;
    if (!c) continue; // a field the contract does not list is refused by name before this runs
    const bad = c(v, where ? `${where}.${k}` : k);
    if (bad) return bad;
  }
  return null;
}
