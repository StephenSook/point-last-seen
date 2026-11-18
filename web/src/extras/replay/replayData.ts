// The facts a replay is built from, from the live command post or from the published drill run. Times follow
// the merge lanes exactly: sent = the phone's clock plus its measured offset, arrived = server time. Nothing is
// guessed: a run file without an arrival time or an approval time is refused with a plain reason.

import {
  DEFAULT_PARAMS,
  type Assignment,
  type CameraSightingReading,
  type EngineParams,
  type EventDoc,
  type IncidentView,
  type MapSegment,
  type PlanDoc,
  type PublishedRun,
  type SegmentPrior,
  type StreamedEvent,
  type Team,
} from "../laneC";
import { DRILL_LABEL } from "../print/printModel";

export type ReplayEvent = {
  eventId: string;
  type: EventDoc["type"];
  teamId: string | null;
  deviceId: string;
  /** clientTimeMs plus the device's clockOffsetMs (0 when unknown). */
  sentAtMs: number;
  /** Server time; null while the write is pending. */
  arrivedAtMs: number | null;
  observedAtMs: number | null;
  position: { lat: number; lon: number } | null;
  offlineForMs: number | null;
  clockSuspect: boolean;
  /** Person in view on a camera, on the wall clock; only with a confirmed camera clock. */
  camera: { startMs: number; endMs: number; keyFrameMs: number } | null;
  doc: EventDoc;
};

export type ReplayPlan = { version: number; priorVersion: number; approvedAtMs: number; assignments: Assignment[] };

export type ReplayData = {
  source: "live" | "published_run";
  incidentName: string;
  drillLabel: string | null;
  /** The grid's own licence line, shown as the map credit; null when the incident has none. */
  gridAttribution: string | null;
  priorVersion: number;
  priorInputEventIds: string[];
  priorBuiltAtMs: number | null;
  params: EngineParams;
  prior: SegmentPrior[];
  segments: MapSegment[];
  teams: Team[];
  /** One per eventId, ordered by (arrivedAtMs, eventId); pending last. */
  events: ReplayEvent[];
  plans: ReplayPlan[];
};

const DAY_MS = 24 * 3_600_000;
const MMSS = /^([0-9]{2}):([0-5][0-9])$/;

/** "02:14" (the clip reading's format) to milliseconds; null for anything else. */
export function mmssToMs(t: string): number | null {
  const m = MMSS.exec(t);
  return m ? (Number(m[1]) * 60 + Number(m[2])) * 1000 : null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === "string";

function millis(v: unknown): number | null {
  if (num(v)) return v;
  if (isObj(v) && typeof v["toMillis"] === "function") {
    const m: unknown = (v["toMillis"] as () => unknown)();
    return num(m) ? m : null;
  }
  return null;
}

function cameraInterval(doc: EventDoc): ReplayEvent["camera"] {
  if (doc.type !== "camera_sighting" || !isObj(doc.reading) || !("sighting" in doc.reading)) return null;
  const r = doc.reading as CameraSightingReading;
  if (r.clockConfirmed !== true || !num(r.clipStartMs) || !isObj(r.sighting) || r.sighting.personVisible !== true) return null;
  const first = mmssToMs(r.sighting.firstSeen);
  const last = mmssToMs(r.sighting.lastSeen);
  const key = mmssToMs(r.sighting.keyFrame?.time ?? "");
  if (first === null || last === null || key === null || last < first) return null;
  return { startMs: r.clipStartMs + first, endMs: r.clipStartMs + last, keyFrameMs: r.clipStartMs + key };
}

function replayEvent(doc: EventDoc, arrivedAtMs: number | null, offsets: Record<string, number>): ReplayEvent {
  const sentAtMs = doc.clientTimeMs + (offsets[doc.deviceId] ?? 0);
  let offlineForMs: number | null = null;
  let clockSuspect = false;
  if (arrivedAtMs !== null) {
    const gap = arrivedAtMs - sentAtMs;
    clockSuspect = !(gap >= 0 && gap <= DAY_MS);
    offlineForMs = clockSuspect ? null : gap;
  }
  const p = doc.position;
  return {
    eventId: doc.eventId,
    type: doc.type,
    teamId: str(doc.teamId) ? doc.teamId : null,
    deviceId: doc.deviceId,
    sentAtMs,
    arrivedAtMs,
    observedAtMs: num(doc.observedAtMs) ? doc.observedAtMs : null,
    position: isObj(p) && num(p.lat) && num(p.lon) ? { lat: p.lat, lon: p.lon } : null,
    offlineForMs,
    clockSuspect,
    camera: cameraInterval(doc),
    doc,
  };
}

/** One per id (an arrived copy beats a pending one), ordered by arrival then id, pending last by id. */
function ordered(list: ReplayEvent[]): ReplayEvent[] {
  const byId = new Map<string, ReplayEvent>();
  for (const e of list) {
    const prev = byId.get(e.eventId);
    if (!prev || (prev.arrivedAtMs === null && e.arrivedAtMs !== null)) byId.set(e.eventId, e);
  }
  const id = (a: ReplayEvent, b: ReplayEvent) => (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0);
  return [...byId.values()].sort((a, b) => {
    if (a.arrivedAtMs === null || b.arrivedAtMs === null) return a.arrivedAtMs === b.arrivedAtMs ? id(a, b) : a.arrivedAtMs === null ? 1 : -1;
    return a.arrivedAtMs - b.arrivedAtMs || id(a, b);
  });
}

function drillLabelOf(mode: unknown, stored: unknown): string | null {
  if (str(stored) && stored.trim() !== "") return stored;
  return mode === "drill" ? DRILL_LABEL : null;
}

/** The replay of the live incident, or null until the incident, its prior and its segments are loaded. */
export function fromLive(view: IncidentView | null, events: readonly StreamedEvent[], plans: readonly PlanDoc[]): ReplayData | null {
  const inc = view?.incident;
  if (!view || !inc || !num(inc.priorVersion) || view.segments.length === 0 || !num(view.rowPrior)) return null;
  const extra = inc as unknown as Record<string, unknown>;
  const offsets = view.clockOffsets;
  const replayEvents = events.map((e) => {
    const arrived = e.pendingWrite || !num(e.serverTimeMs) ? null : e.serverTimeMs;
    return replayEvent(e as unknown as EventDoc, arrived, offsets);
  });
  const replayPlans = plans.flatMap((p): ReplayPlan[] => {
    const at = millis(p.approvedAt) ?? (num(p.createdClientTimeMs) ? p.createdClientTimeMs : null);
    return at === null ? [] : [{ version: p.version, priorVersion: p.priorVersion, approvedAtMs: at, assignments: p.assignments }];
  });
  return {
    source: "live",
    incidentName: inc.name,
    drillLabel: drillLabelOf(inc.mode, inc.drillLabel),
    gridAttribution: str(inc.gridAttribution) ? inc.gridAttribution : null,
    priorVersion: inc.priorVersion,
    priorInputEventIds: [...(inc.priorInputEventIds ?? [])],
    priorBuiltAtMs: millis(extra["priorBuiltAtMs"]),
    // The command post falls back to the shared constants for an incident with no stored parameters; so does the
    // replay, or its last frame would not match the live map.
    params: inc.engineParams ?? DEFAULT_PARAMS,
    prior: [...view.segments.map((s) => ({ segmentId: s.segmentId, priorPoa: s.priorPoa })), { segmentId: "ROW", priorPoa: view.rowPrior }],
    segments: view.segments,
    teams: view.teams,
    events: ordered(replayEvents),
    plans: replayPlans.sort((a, b) => a.version - b.version),
  };
}

/**
 * The live map counts writes still on their way to the server; the replay shows only what arrived. When some are
 * pending, the end frame can differ from the live header, so the panel says why.
 */
export function pendingLine(data: ReplayData): string | null {
  const n = data.events.filter((e) => e.arrivedAtMs === null).length;
  if (n === 0) return null;
  return n === 1 ? "1 report is still sending and is not in the replay." : `${n} reports are still sending and are not in the replay.`;
}

type Refusal = { ok: false; reason: string };
const refuse = (reason: string): Refusal => ({ ok: false, reason });

function geometryOf(s: Record<string, unknown>): MapSegment["geometry"] | null {
  let g: unknown = s["geometry"];
  if (!isObj(g) && str(s["geometryJson"])) {
    try {
      g = JSON.parse(s["geometryJson"]);
    } catch {
      return null;
    }
  }
  return isObj(g) && (g["type"] === "Polygon" || g["type"] === "MultiPolygon") && Array.isArray(g["coordinates"])
    ? (g as MapSegment["geometry"])
    : null;
}

/**
 * The replay of the published drill run, read as `PublishedRunV1` in runContract.ts describes it. The file is
 * untrusted input, so every part is checked here. Anything missing refuses the whole run: a replay never guesses
 * a time.
 */
export function fromPublishedRun(run: PublishedRun): { ok: true; data: ReplayData } | Refusal {
  const { incident, segments, teams, devices, events, plans } = run;
  if (!isObj(incident) || !str(incident["name"]) || !num(incident["priorVersion"])) return refuse("The run is missing its incident.");
  if (!Array.isArray(segments)) return refuse("The run is missing its map segments.");
  if (!Array.isArray(teams)) return refuse("The run is missing its teams.");
  if (!Array.isArray(devices)) return refuse("The run is missing its devices.");
  if (!Array.isArray(events)) return refuse("The run is missing its reports.");
  if (!Array.isArray(plans)) return refuse("The run is missing its plans.");

  let rowPrior: number | null = null;
  const mapSegments: MapSegment[] = [];
  const prior: SegmentPrior[] = [];
  for (const s of segments) {
    if (!isObj(s) || !str(s["segmentId"]) || !num(s["priorPoa"])) return refuse("The run has a map segment without a prior.");
    if (s["segmentId"] === "ROW") {
      rowPrior = s["priorPoa"];
      continue;
    }
    const geometry = geometryOf(s);
    const c = s["centroid"];
    if (!geometry || !isObj(c) || !num(c["lat"]) || !num(c["lon"])) return refuse("The run has a map segment without a shape.");
    mapSegments.push({ segmentId: s["segmentId"], geometry, centroid: { lat: c["lat"], lon: c["lon"] } });
    prior.push({ segmentId: s["segmentId"], priorPoa: s["priorPoa"] });
  }
  if (mapSegments.length === 0 || rowPrior === null) return refuse("The run is missing the prior outside the map.");
  prior.push({ segmentId: "ROW", priorPoa: rowPrior });

  const offsets: Record<string, number> = {};
  for (const d of devices) if (isObj(d) && str(d["deviceId"]) && num(d["clockOffsetMs"])) offsets[d["deviceId"]] = d["clockOffsetMs"];

  const replayEvents: ReplayEvent[] = [];
  for (const e of events) {
    if (!isObj(e) || !str(e["eventId"]) || !str(e["deviceId"]) || !num(e["clientTimeMs"]) || !str(e["type"])) {
      return refuse("The run has a report it cannot read.");
    }
    if (!num(e["serverTimeMs"])) return refuse("The run has no arrival time for a report.");
    // The run is public (see runContract.ts): report words and a report's reading, which quotes them, never ship.
    const reading = e["reading"];
    const cameraReading = e["type"] === "camera_sighting" && isObj(reading) && "sighting" in reading && !("evidenceQuote" in reading);
    if ((e["rawText"] !== null && e["rawText"] !== undefined) || (reading !== null && reading !== undefined && !cameraReading)) {
      return refuse("The run carries report text. A public run must not.");
    }
    replayEvents.push(replayEvent(e as unknown as EventDoc, e["serverTimeMs"], offsets));
  }

  const replayPlans: ReplayPlan[] = [];
  for (const p of plans) {
    if (!isObj(p) || !num(p["version"]) || !num(p["priorVersion"]) || !Array.isArray(p["assignments"])) return refuse("The run has a plan it cannot read.");
    if (!num(p["approvedAtMs"])) return refuse("The run has no approval time for a plan.");
    replayPlans.push({ version: p["version"], priorVersion: p["priorVersion"], approvedAtMs: p["approvedAtMs"], assignments: p["assignments"] as Assignment[] });
  }

  const ids = incident["priorInputEventIds"];
  return {
    ok: true,
    data: {
      source: "published_run",
      incidentName: incident["name"],
      drillLabel: drillLabelOf(incident["mode"], incident["drillLabel"]),
      gridAttribution: str(incident["gridAttribution"]) ? incident["gridAttribution"] : null,
      priorVersion: incident["priorVersion"],
      priorInputEventIds: Array.isArray(ids) ? ids.filter(str) : [],
      priorBuiltAtMs: millis(incident["priorBuiltAtMs"]),
      params: isObj(incident["engineParams"]) ? (incident["engineParams"] as unknown as EngineParams) : DEFAULT_PARAMS,
      prior,
      segments: mapSegments,
      teams: teams.flatMap((t) => (isObj(t) && str(t["teamId"]) ? [{ teamId: t["teamId"], name: str(t["name"]) ? t["name"] : t["teamId"] }] : [])),
      events: ordered(replayEvents),
      plans: replayPlans.sort((a, b) => a.version - b.version),
    },
  };
}
