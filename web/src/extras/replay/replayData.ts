// The facts a replay is built from, from the live command post or from the published drill run. Times follow
// the merge lanes exactly: sent = the phone's clock plus its measured offset, arrived = server time. Nothing is
// guessed: a run file without an arrival time or an approval time is refused with a plain reason.

import {
  DEFAULT_PARAMS,
  type Assignment,
  type CameraSightingReading,
  type Effect,
  type EngineParams,
  type EventDoc,
  type IncidentView,
  type MapSegment,
  type PlanDoc,
  type PublishedRun,
  type SegmentPrior,
  type StreamedEvent,
  type Team,
} from "../hostApp";
import { DRILL_LABEL } from "../print/printModel";
import { AUTHOR_PSEUDONYM, DEVICE_PSEUDONYM, FIREBASE_UID_SHAPE, MAX_RUN_EVENTS, RUN_ENUMS, RUN_FIELDS } from "./runContract";
import { RUN_TYPES, wrongType } from "./runSchema";
import { replayWindow, stateAt } from "./stateAt";

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
  const offset = offsets[doc.deviceId] ?? 0;
  const sentAtMs = doc.clientTimeMs + offset;
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
    // Read from the same phone clock as the sent time ("seen 20 minutes ago"), so it gets the same offset.
    observedAtMs: num(doc.observedAtMs) ? doc.observedAtMs + offset : null,
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
  // Only plans with a server approval time: a plan still being written has none, and the browser's clock must not
  // place it on the timeline (or move the prior with it).
  const replayPlans = plans.flatMap((p): ReplayPlan[] => {
    const at = millis(p.approvedAt);
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

const YEAR_2000_MS = Date.UTC(2000, 0, 1);
const YEAR_2100_MS = Date.UTC(2100, 0, 1);
/** The longest stretch a public run may cover. */
const MAX_RUN_SPAN_MS = 7 * DAY_MS;

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
  // A shape carries its kind and its rings and nothing else.
  if (!isObj(g) || Object.keys(g).some((k) => k !== "type" && k !== "coordinates")) return null;
  // Every ring is a closed list of at least four [longitude, latitude] pairs on the earth (longitude -180 to 180,
  // latitude -90 to 90): the map and the cube walk them all, and a position off the earth draws nowhere.
  const onEarth = (p: unknown): p is [number, number] =>
    Array.isArray(p) && p.length === 2 && num(p[0]) && num(p[1]) && p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;
  const ring = (r: unknown) => {
    if (!Array.isArray(r) || r.length < 4 || !r.every(onEarth)) return false;
    const first = r[0] as [number, number];
    const last = r[r.length - 1] as [number, number];
    return first[0] === last[0] && first[1] === last[1];
  };
  const polygon = (rings: unknown) => Array.isArray(rings) && rings.length >= 1 && rings.every(ring);
  const c = g["coordinates"];
  // A new object holding only the checked parts, so nothing else in the file reaches the map.
  if (g["type"] === "Polygon" && polygon(c)) return { type: "Polygon", coordinates: c } as MapSegment["geometry"];
  if (g["type"] === "MultiPolygon" && Array.isArray(c) && c.length >= 1 && c.every(polygon)) return { type: "MultiPolygon", coordinates: c } as MapSegment["geometry"];
  return null;
}

/**
 * The replay of the published drill run, read as `PublishedRunV1` in runContract.ts describes it. The file is
 * untrusted input, so every part is checked here. Anything missing refuses the whole run: a replay never guesses
 * a time.
 */
/** The first field of `o` that `allowed` does not name, as "where.field" (or "field" at the top). */
function strayField(o: Record<string, unknown>, allowed: readonly string[], where: string | null): string | null {
  const k = Object.keys(o).find((key) => !allowed.includes(key));
  return k === undefined ? null : where ? `${where}.${k}` : k;
}
const strayRefusal = (field: string) => refuse(`The run carries a field a public run must not: ${field}.`);
const typeRefusal = (field: string) => refuse(`The run has a field of the wrong type: ${field}.`);
const USER_ID = "The run carries a user id. A public run must not.";

/** Names an object's own prototype machinery answers to. A file must not use them as a key or an id. */
const RESERVED_NAMES: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/** The first reserved name used anywhere in `v`, as a key or a text value, or null. */
function reservedName(v: unknown, depth = 0): string | null {
  if (depth > 64) return null; // the uid scan refuses a run nested this deep
  if (typeof v === "string") return RESERVED_NAMES.has(v) ? v : null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = reservedName(x, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (RESERVED_NAMES.has(k)) return k;
      const r = reservedName(x, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/** A Firebase Auth uid standing alone inside longer text: 28 letters and digits with no letter or digit beside them. */
const UID_IN_TEXT = /(?:^|[^A-Za-z0-9])[A-Za-z0-9]{28}(?:$|[^A-Za-z0-9])/;

/**
 * True when anything in `v` could be a Firebase Auth user id: a string (after folding look-alike characters, and
 * inside longer text), an object key, a JSON text such as a segment's shape, or an integer of 20 or more digits.
 */
function holdsUidShape(v: unknown, depth = 0): boolean {
  if (depth > 64) return true; // nested past any real run: refuse rather than walk it
  if (typeof v === "number") return Number.isInteger(v) && Math.abs(v) >= 1e19;
  if (typeof v === "string") {
    const folded = v.normalize("NFKC");
    if (FIREBASE_UID_SHAPE.test(folded) || UID_IN_TEXT.test(folded)) return true;
    const t = folded.trimStart();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return holdsUidShape(JSON.parse(t) as unknown, depth + 1);
      } catch {
        return false;
      }
    }
    return false;
  }
  if (Array.isArray(v)) return v.some((x) => holdsUidShape(x, depth + 1));
  if (isObj(v)) return Object.entries(v).some(([k, x]) => holdsUidShape(k, depth + 1) || holdsUidShape(x, depth + 1));
  return false;
}

export function fromPublishedRun(run: PublishedRun): { ok: true; data: ReplayData } | Refusal {
  const { incident, segments, teams, devices, events, plans } = run;
  // Before any walk of the run, so a very large file costs nothing to refuse.
  if (Array.isArray(events) && events.length > MAX_RUN_EVENTS) return refuse(`The run has more reports than the replay can show (${MAX_RUN_EVENTS} at most).`);
  // Before the field checks, so a user id is named as one wherever it sits, and a refusal never repeats it.
  if (holdsUidShape(run)) return refuse(USER_ID);
  const reserved = reservedName(run);
  if (reserved) return refuse(`The run uses a reserved name: ${reserved}.`);
  const topStray = strayField(run as Record<string, unknown>, RUN_FIELDS.run, null);
  if (topStray) return strayRefusal(topStray);
  const topType = wrongType(run as Record<string, unknown>, RUN_TYPES.run, null);
  if (topType) return typeRefusal(topType);
  if (!isObj(incident) || !str(incident["name"]) || !num(incident["priorVersion"])) return refuse("The run is missing its incident.");
  const incidentStray = strayField(incident, RUN_FIELDS.incident, "incident");
  if (incidentStray) return strayRefusal(incidentStray);
  const incidentType = wrongType(incident, RUN_TYPES.incident, "incident");
  if (incidentType) return typeRefusal(incidentType);
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
    const segStray = strayField(s, s["segmentId"] === "ROW" ? RUN_FIELDS.row : RUN_FIELDS.segment, "segment");
    if (segStray) return strayRefusal(segStray);
    const segType = wrongType(s, s["segmentId"] === "ROW" ? RUN_TYPES.row : RUN_TYPES.segment, "segment");
    if (segType) return typeRefusal(segType);
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

  for (const t of teams) {
    if (!isObj(t)) return typeRefusal("team");
    const teamStray = strayField(t, RUN_FIELDS.team, "team");
    if (teamStray) return strayRefusal(teamStray);
    const teamType = wrongType(t, RUN_TYPES.team, "team");
    if (teamType) return typeRefusal(teamType);
  }
  // Keyed by file data, so it has no prototype: a device id can never reach an inherited name.
  const offsets: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const d of devices) {
    if (!isObj(d)) return typeRefusal("device");
    const deviceStray = strayField(d, RUN_FIELDS.device, "device");
    if (deviceStray) return strayRefusal(deviceStray);
    const deviceType = wrongType(d, RUN_TYPES.device, "device");
    if (deviceType) return typeRefusal(deviceType);
    if (isObj(d) && !(str(d["deviceId"]) && DEVICE_PSEUDONYM.test(d["deviceId"]))) return refuse(USER_ID);
    if (isObj(d) && str(d["deviceId"]) && num(d["clockOffsetMs"])) offsets[d["deviceId"]] = d["clockOffsetMs"];
  }

  const replayEvents: ReplayEvent[] = [];
  for (const e of events) {
    if (!isObj(e) || !str(e["eventId"]) || !str(e["deviceId"]) || !num(e["clientTimeMs"]) || !str(e["type"])) {
      return refuse("The run has a report it cannot read.");
    }
    const eventStray = strayField(e, RUN_FIELDS.event, "event");
    if (eventStray) return strayRefusal(eventStray);
    // Only a value that is present is checked: which fields must be present is decided above.
    for (const [field, allowed] of Object.entries(RUN_ENUMS)) {
      if (Object.hasOwn(e, field) && !(allowed as readonly unknown[]).includes(e[field])) return refuse("The run has a report of a kind it does not know.");
    }
    if (!str(e["authorUid"]) || !AUTHOR_PSEUDONYM.test(e["authorUid"])) return refuse(USER_ID);
    if (!DEVICE_PSEUDONYM.test(e["deviceId"])) return refuse(USER_ID);
    if (!num(e["serverTimeMs"])) return refuse("The run has no arrival time for a report.");
    // The run is public (see runContract.ts): report words and a report's reading, which quotes them, never ship.
    const reading = e["reading"];
    const cameraReading = e["type"] === "camera_sighting" && isObj(reading) && "sighting" in reading && !("evidenceQuote" in reading);
    if ((e["rawText"] !== null && e["rawText"] !== undefined) || (reading !== null && reading !== undefined && !cameraReading)) {
      return refuse("The run carries report text. A public run must not.");
    }
    if (cameraReading && isObj(reading)) {
      const sighting = reading["sighting"];
      const keyFrame = isObj(sighting) ? sighting["keyFrame"] : undefined;
      const readingStray = strayField(reading, RUN_FIELDS.cameraReading, "event.reading")
        ?? (isObj(sighting) ? strayField(sighting, RUN_FIELDS.cameraSighting, "event.reading.sighting") : null)
        ?? (isObj(keyFrame) ? strayField(keyFrame, RUN_FIELDS.keyFrame, "event.reading.sighting.keyFrame") : null);
      if (readingStray) return strayRefusal(readingStray);
    }
    // A camera's place is usually the family's home: a camera sighting's position, or any report placed by a camera
    // pin, never ships.
    if ((e["type"] === "camera_sighting" || e["positionSource"] === "camera_pin") && e["position"] !== null && e["position"] !== undefined) {
      return refuse("The run carries a camera's place. A public run must not.");
    }
    // A place to check can be a home or a previous address from the family's profile: its position never ships.
    if (e["type"] === "destination" && e["position"] !== null && e["position"] !== undefined) {
      return refuse("The run carries a place from the family's profile. A public run must not.");
    }
    const eventType = wrongType(e, RUN_TYPES.event, "event");
    if (eventType) return typeRefusal(eventType);
    // An effect names segments by id: each must be one of the run's (or the prior outside the map).
    const eff = e["effect"] as Effect | undefined;
    const named = eff?.kind === "clue" ? Object.keys(eff.influences) : eff?.kind === "cleared" ? [eff.segmentId] : [];
    if (named.some((id) => id !== "ROW" && !mapSegments.some((m) => m.segmentId === id))) {
      return refuse("The run has a report about a segment it does not have.");
    }
    replayEvents.push(replayEvent(e as unknown as EventDoc, e["serverTimeMs"], offsets));
  }

  const replayPlans: ReplayPlan[] = [];
  for (const p of plans) {
    if (!isObj(p) || !num(p["version"]) || !num(p["priorVersion"]) || !Array.isArray(p["assignments"])) return refuse("The run has a plan it cannot read.");
    const planStray = strayField(p, RUN_FIELDS.plan, "plan");
    if (planStray) return strayRefusal(planStray);
    const planType = wrongType(p, RUN_TYPES.plan, "plan");
    if (planType) return typeRefusal(planType);
    if (!num(p["approvedAtMs"])) return refuse("The run has no approval time for a plan.");
    replayPlans.push({ version: p["version"], priorVersion: p["priorVersion"], approvedAtMs: p["approvedAtMs"], assignments: p["assignments"] as Assignment[] });
  }

  const ids = incident["priorInputEventIds"];
  const data: ReplayData = {
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
  };
  // Server times come from the server's clock, so a time outside these years is not one. A replay of more than a
  // week is not a drill, and its ruler would be unreadable.
  const inYears = (t: number) => t >= YEAR_2000_MS && t < YEAR_2100_MS;
  if (data.events.some((ev) => ev.arrivedAtMs !== null && !inYears(ev.arrivedAtMs)) || data.plans.some((pl) => !inYears(pl.approvedAtMs)) || (data.priorBuiltAtMs !== null && !inYears(data.priorBuiltAtMs))) {
    return refuse("The run has a server time outside the years 2000 to 2100.");
  }
  const span = replayWindow(data);
  if (span && span.endMs - span.startMs > MAX_RUN_SPAN_MS) return refuse("The run covers more time than the replay can show (7 days at most).");
  // Compute every frame the replay can show (each arrival and the end) once here, so a run whose engine settings or
  // reports the engine cannot use is refused with a reason instead of failing on the judge's screen.
  try {
    const w = replayWindow(data);
    if (w) {
      const times = new Set<number>([w.endMs]);
      for (const e of data.events) if (e.arrivedAtMs !== null) times.add(e.arrivedAtMs);
      for (const t of times) {
        const frame = stateAt(data, t);
        if (frame.phase === "replayable" && Object.values(frame.view.result.poa).some((v) => !Number.isFinite(v))) {
          return refuse("The run's engine settings cannot be used.");
        }
      }
    }
  } catch {
    return refuse("The run's engine settings cannot be used.");
  }
  return { ok: true, data };
}
