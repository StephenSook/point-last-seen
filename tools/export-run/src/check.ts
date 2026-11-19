// The reader's checks on a public run, applied by the exporter before it writes: the run is refused whole on any
// breach, so the reader is a second wall rather than the only one.
import { DEFAULT_PARAMS } from "@pls/engine";
import routeSchema from "../../../shared/schemas/route-record.schema.json";
import { AUTHOR_PSEUDONYM, DEVICE_PSEUDONYM, MAX_RUN_EVENTS, RUN_FIELDS } from "./contract";

const ROUTE_FIELDS = Object.keys(routeSchema.properties);
const UNSAFE_IDS = new Set(["__proto__", "constructor", "prototype"]);
const YEAR_2000 = Date.UTC(2000, 0, 1), YEAR_2100 = Date.UTC(2100, 0, 1);
const MAX_SPAN_MS = 7 * 86_400_000, MAX_EVENTS = MAX_RUN_EVENTS;
const CLEARED_INPUTS = ["coverage", "sweepWidthM", "trackLengthM", "areaM2", "rdBasis"];

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const sameKeys = (v: unknown, keys: readonly string[]) => isMap(v) && Object.keys(v).length === keys.length && keys.every(k => k in v);

/** Whether a value has the shape of the constants' value: the same keys at every level, and the same kinds. */
function sameShape(v: unknown, d: unknown): boolean {
  if (Array.isArray(d)) return Array.isArray(v) && (d.length === 0 || v.every(x => typeof x === typeof d[0]));
  if (isMap(d)) return sameKeys(v, Object.keys(d)) && Object.keys(d).every(k => sameShape((v as Record<string, unknown>)[k], d[k]));
  return typeof v === typeof d;
}

function effectProblems(id: string, e: unknown, segments: Set<string>): string[] {
  if (!isMap(e)) return [`${id}: effect is not an object`];
  if (e.kind === "cleared") {
    if (!sameKeys(e, ["kind", "segmentId", "pod", "inputs"]) || !sameKeys(e.inputs, CLEARED_INPUTS)) return [`${id}: cleared effect is not the engine's shape`];
    return segments.has(String(e.segmentId)) ? [] : [`${id}: cleared effect names segment ${String(e.segmentId)}, which the run lacks`];
  }
  if (e.kind === "clue") {
    if (!sameKeys(e, ["kind", "influences", "authenticity"]) || !isMap(e.influences)) return [`${id}: clue effect is not the engine's shape`];
    const missing = Object.keys(e.influences).filter(s => !segments.has(s));
    return missing.length ? [`${id}: clue effect names segments the run lacks (${missing.join(", ")})`] : [];
  }
  if (e.kind === "none") return sameKeys(e, ["kind", "why"]) && typeof e.why === "string" ? [] : [`${id}: none effect is not the engine's shape`];
  return [`${id}: unknown effect kind`];
}

/** A Firebase Auth uid anywhere inside a string: 28 letters and digits standing alone (event ids are 32 hex). */
const UID_TOKEN = /(^|[^A-Za-z0-9])[A-Za-z0-9]{28}($|[^A-Za-z0-9])/;

type Doc = Record<string, unknown>;

function extraKeys(where: string, d: unknown, allowed: readonly string[]): string[] {
  if (!d || typeof d !== "object" || Array.isArray(d)) return [`${where}: not an object`];
  return Object.keys(d).filter(k => !allowed.includes(k)).map(k => `${where}: field "${k}" is not in the contract`);
}

function strings(v: unknown, path: string, out: [string, string][]): void {
  if (typeof v === "string") out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out);
}

/** Every breach of the public-run contract, or [] when the run may be published. */
export function checkRun(run: unknown): string[] {
  const problems: string[] = [];
  if (!run || typeof run !== "object") return ["run: not an object"];
  const r = run as Doc;
  const missing = RUN_FIELDS.run.filter(k => !(k in r));
  problems.push(...missing.map(k => `run: missing "${k}"`), ...extraKeys("run", r, RUN_FIELDS.run));
  problems.push(...extraKeys("incident", r.incident, RUN_FIELDS.incident));
  const params = isMap(r.incident) ? r.incident.engineParams : undefined;
  if (params !== undefined && !sameShape(params, DEFAULT_PARAMS)) problems.push("incident: engineParams is not in the engine's shape");
  const segmentIds = new Set(((r.segments ?? []) as Doc[]).map(s => String(s.segmentId)));
  const events = (r.events ?? []) as Doc[];
  if (events.length > MAX_EVENTS) problems.push(`run: ${events.length} events, more than ${MAX_EVENTS}`);
  const times = events.map(e => e.serverTimeMs).filter((t): t is number => typeof t === "number");
  if (times.some(t => t < YEAR_2000 || t >= YEAR_2100)) problems.push("run: a server time lies outside 2000 to 2100");
  if (times.length > 0 && Math.max(...times) - Math.min(...times) > MAX_SPAN_MS) problems.push("run: the events span more than 7 days");
  for (const [what, ids] of [["segment", [...segmentIds]], ["team", ((r.teams ?? []) as Doc[]).map(t => String(t.teamId))],
    ["event", events.map(e => String(e.eventId))]] as const) {
    for (const id of ids) if (UNSAFE_IDS.has(id)) problems.push(`${what}: id "${id}" is not allowed`);
  }
  for (const s of (r.segments ?? []) as Doc[]) {
    problems.push(...extraKeys(`segment ${String(s.segmentId)}`, s, s.segmentId === "ROW" ? RUN_FIELDS.row : RUN_FIELDS.segment));
  }
  for (const t of (r.teams ?? []) as Doc[]) problems.push(...extraKeys("team", t, RUN_FIELDS.team));
  for (const d of (r.devices ?? []) as Doc[]) {
    problems.push(...extraKeys("device", d, RUN_FIELDS.device));
    if (!DEVICE_PSEUDONYM.test(String(d.deviceId))) problems.push(`device: deviceId "${String(d.deviceId)}" is not a pseudonym`);
  }
  for (const p of (r.plans ?? []) as Doc[]) {
    problems.push(...extraKeys(`plan ${String(p.version)}`, p, RUN_FIELDS.plan));
    if (typeof p.approvedAtMs !== "number") problems.push(`plan ${String(p.version)}: approvedAtMs is not a number`);
  }
  for (const e of (r.events ?? []) as Doc[]) {
    const id = `event ${String(e.eventId)}`;
    problems.push(...extraKeys(id, e, RUN_FIELDS.event));
    if (!AUTHOR_PSEUDONYM.test(String(e.authorUid))) problems.push(`${id}: authorUid is not a pseudonym`);
    if (!DEVICE_PSEUDONYM.test(String(e.deviceId))) problems.push(`${id}: deviceId is not a pseudonym`);
    if (e.rawText !== null) problems.push(`${id}: rawText must be null`);
    if (typeof e.serverTimeMs !== "number") problems.push(`${id}: serverTimeMs is not a number`);
    if (e.type === "destination" && e.position !== null) problems.push(`${id}: a destination must have no position`);
    if (e.positionSource === "camera_pin" && e.position !== null) problems.push(`${id}: a camera pin must have no position`);
    if (e.route !== null && e.route !== undefined && !sameKeys(e.route, ROUTE_FIELDS)) problems.push(`${id}: route is not an exact route record`);
    if (e.effect !== undefined) problems.push(...effectProblems(id, e.effect, segmentIds));
    if (e.type === "camera_sighting") {
      const reading = e.reading as Doc | null;
      if (reading !== null) {
        problems.push(...extraKeys(`${id} reading`, reading, RUN_FIELDS.cameraReading));
        const sighting = reading.sighting as Doc | undefined;
        problems.push(...extraKeys(`${id} sighting`, sighting, RUN_FIELDS.cameraSighting));
        if (sighting) problems.push(...extraKeys(`${id} keyFrame`, sighting.keyFrame, RUN_FIELDS.keyFrame));
      }
    } else if (e.reading !== null) {
      problems.push(`${id}: reading must be null except on a camera sighting`);
    }
  }
  const all: [string, string][] = [];
  strings(r, "run", all);
  for (const [path, s] of all) if (UID_TOKEN.test(s)) problems.push(`${path}: carries a uid-shaped value`);
  return problems;
}
