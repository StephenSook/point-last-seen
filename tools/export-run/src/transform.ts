// Builds the public run from an incident's stored docs (timestamps already in milliseconds). Only the contract's
// fields are written; uids become pseudonyms; report text, profile fields and home positions never leave.
import { DEFAULT_PARAMS } from "@pls/engine";
import { RUN_FIELDS } from "./contract";

export type Doc = Record<string, unknown>;

/** What the exporter reads from one incident. */
export interface RawRun {
  incidentId: string;
  incident: Doc;
  segments: Doc[];
  teams: Doc[];
  /** Each team's device docs, with the team and the doc id (the device's auth uid). */
  devices: Doc[];
  /** Each device's read timings, with the team, device and event they belong to. */
  measurements: Doc[];
  events: Doc[];
  plans: Doc[];
}

export interface RunCameraReading {
  clipStartMs: number;
  clockConfirmed: boolean;
  sighting: { personVisible: boolean; firstSeen: string; lastSeen: string; keyFrame: { time: string } };
}
export type RunEvent = Doc & { eventId: string; type: string; authorUid: string; deviceId: string; position: unknown;
  rawText: null; reading: RunCameraReading | null; serverTimeMs: number };
export interface PublishedRun {
  runId: string;
  label: string;
  exportedAt: string;
  incident: Doc & { priorBuiltAtMs?: number | null };
  segments: Doc[];
  teams: { teamId: string; name: string }[];
  devices: { deviceId: string; teamId: string; clockOffsetMs: number | null }[];
  events: RunEvent[];
  plans: Doc[];
  measurements: unknown;
}

/**
 * Stored engine params in exactly the engine's shape: every field the constants have, the stored value where there is
 * one (an incident created before a field existed gets the constants' value), and nothing the constants lack.
 */
export function inEngineShape(stored: unknown, defaults: unknown = DEFAULT_PARAMS): unknown {
  const isMap = (v: unknown): v is Doc => typeof v === "object" && v !== null && !Array.isArray(v);
  if (!isMap(defaults)) return stored === undefined ? defaults : stored;
  const s = isMap(stored) ? stored : {};
  return Object.fromEntries(Object.entries(defaults).map(([k, d]) => [k, isMap(d) ? inEngineShape(s[k], d) : (s[k] ?? d)]));
}

const pick = (d: Doc, fields: readonly string[]): Doc =>
  Object.fromEntries(fields.filter(k => d[k] !== undefined).map(k => [k, d[k]]));

/** One pseudonym per distinct value, numbered in order of first use: author-1, author-2, ... */
function aliases(prefix: string) {
  const seen = new Map<string, string>();
  return (raw: unknown): string => {
    const key = String(raw);
    if (!seen.has(key)) seen.set(key, `${prefix}-${seen.size + 1}`);
    return seen.get(key)!;
  };
}

function cameraReading(r: unknown): RunCameraReading | null {
  if (!r || typeof r !== "object") return null;
  const x = r as { clipStartMs?: unknown; clockConfirmed?: unknown; sighting?: Record<string, unknown> };
  const s = x.sighting ?? {};
  const kf = (s.keyFrame ?? {}) as { time?: unknown };
  return { clipStartMs: Number(x.clipStartMs), clockConfirmed: x.clockConfirmed === true,
    sighting: { personVisible: s.personVisible === true, firstSeen: String(s.firstSeen ?? ""), lastSeen: String(s.lastSeen ?? ""),
      keyFrame: { time: String(kf.time ?? "") } } };
}

export function toPublishedRun(raw: RawRun, meta: { runId: string; label: string; exportedAt: string }): PublishedRun {
  const author = aliases("author"), device = aliases("device");
  // Device aliases follow the device table first, so a device keeps one alias everywhere.
  const devices = raw.devices.map(d => ({ deviceId: device(d.deviceId), teamId: String(d.teamId),
    clockOffsetMs: typeof d.clockOffsetMs === "number" ? d.clockOffsetMs : null }));
  const events = raw.events.map(e => {
    const out = pick(e, RUN_FIELDS.event.filter(k => k !== "serverTimeMs"));
    out.authorUid = author(e.authorUid);
    out.deviceId = device(e.deviceId);
    out.rawText = null;
    out.reading = e.type === "camera_sighting" ? cameraReading(e.reading) : null;
    // Never placed in public: a place to check can be a home from the family's profile, and a camera pin is
    // usually the family's own camera, at home.
    if (e.type === "destination" || e.positionSource === "camera_pin") out.position = null;
    out.serverTimeMs = Number(e.serverTime);
    return out as RunEvent;
  });
  const incident = pick(raw.incident, RUN_FIELDS.incident.filter(k => k !== "priorBuiltAtMs"));
  if (raw.incident.engineParams !== undefined) incident.engineParams = inEngineShape(raw.incident.engineParams);
  incident.priorBuiltAtMs = typeof raw.incident.priorBuiltAt === "number" ? raw.incident.priorBuiltAt : null;
  return {
    runId: meta.runId,
    label: meta.label,
    exportedAt: meta.exportedAt,
    incident,
    segments: raw.segments.map(s => pick(s, s.segmentId === "ROW" ? RUN_FIELDS.row : RUN_FIELDS.segment)),
    teams: raw.teams.map(t => ({ teamId: String(t.teamId), name: String(t.name ?? t.teamId) })),
    devices,
    events,
    plans: raw.plans.map(p => ({ version: p.version, approvedAtMs: Number(p.approvedAt), priorVersion: p.priorVersion,
      basedOnEventSetHash: p.basedOnEventSetHash,
      assignments: ((p.assignments ?? []) as Doc[]).map(a => pick(a, ["teamId", "segmentIds", "taskText", "reason"])) })),
    measurements: raw.measurements.map(m => ({ eventId: m.eventId, deviceId: device(m.deviceId), teamId: m.teamId,
      submittedAtMs: m.submittedAtMs, readDoneAtMs: m.readDoneAtMs, redrawnAtMs: m.redrawnAtMs })),
  };
}
