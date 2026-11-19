// The reader's checks on a public run, applied by the exporter before it writes: the run is refused whole on any
// breach, so the reader is a second wall rather than the only one.
import { AUTHOR_PSEUDONYM, DEVICE_PSEUDONYM, RUN_FIELDS } from "./contract";

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
