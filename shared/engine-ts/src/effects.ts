import { compareCodePoints } from "./compare";
import { coverage, normalizeCoverage, pod, sweepWidth, trackLength } from "./pod";
import type {
  Authenticity, Effect, EffectContext, EngineEvent, EngineParams, EventDoc, Influence, NoneReason, ProfileMatch,
  ReportReading,
} from "./types";

const COMPASS: Record<string, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };
const POINTED_AT_MAX_DEG = 45;
const POD_CONSISTENCY_TOLERANCE = 1e-9;
const AUTHENTICITY: Record<ProfileMatch, Authenticity> = { consistent: "high", unknown: "medium", inconsistent: "low" };

const none = (why: NoneReason): Effect => ({ kind: "none", why });

function firstKnown(ids: string[], segments: EffectContext["segments"]): string | null {
  return ids.find(s => Object.hasOwn(segments, s)) ?? null;
}

/** Checks in order: kind, sound-only, segment, coverage, missing inputs (spec section 10.3). */
export function deriveClearedEffect(reading: ReportReading, ctx: EffectContext, params: EngineParams): Effect {
  if (reading.kind !== "cleared") return none("invalid");
  if (reading.method === "sound" && !params.detectionProfile.soundCounts) return none("sound_only");
  const seg = firstKnown(reading.segmentIds, ctx.segments) ?? firstKnown(ctx.assignedSegmentIds, ctx.segments);
  if (seg === null) return none("needs_command");
  const areaM2 = ctx.segments[seg]!.areaM2;
  const cov = normalizeCoverage(reading.coverage, params);
  if (cov === "invalid") return none("invalid");
  if (cov !== null) {
    return { kind: "cleared", segmentId: seg, pod: pod(cov),
      inputs: { coverage: cov, sweepWidthM: null, trackLengthM: null, areaM2, rdBasis: ctx.rdBasis } };
  }
  const stated = reading.detectionRangeM;
  const rd = stated ?? ctx.visualDetectionRangeM;
  if (reading.minutes === null || reading.searchers === null || rd === null) return none("needs_command");
  const w = sweepWidth(rd, params);
  const l = trackLength(reading.minutes, reading.searchers, reading.searchType, params);
  const c = coverage(w, l, areaM2);
  return { kind: "cleared", segmentId: seg, pod: pod(c),
    inputs: { coverage: c, sweepWidthM: w, trackLengthM: l, areaM2, rdBasis: stated !== null ? "stated" : ctx.rdBasis } };
}

function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** Clue or sighting: the containing segment is strong_for; neighbors the direction points at are for. */
export function deriveClueEffect(reading: ReportReading, ctx: EffectContext): Effect {
  if (reading.kind !== "clue" && reading.kind !== "sighting") return none("invalid");
  let target: string | null;
  if (ctx.position !== null) {
    target = ctx.positionSegmentId;
    if (target === null || !Object.hasOwn(ctx.segments, target)) return none("outside_area");
  } else {
    target = firstKnown(reading.segmentIds, ctx.segments) ?? firstKnown(ctx.assignedSegmentIds, ctx.segments);
    if (target === null) return none("needs_command");
  }
  const influences: Record<string, Influence> = { [target]: "strong_for" };
  const info = ctx.segments[target]!;
  const bearing = COMPASS[reading.direction];
  let pointed: string[] = [];
  if (bearing !== undefined) {
    pointed = info.neighbors.filter(n => angleBetween(n.bearingDeg, bearing) <= POINTED_AT_MAX_DEG).map(n => n.segmentId);
  } else if (reading.direction === "upstream" || reading.direction === "downstream") {
    pointed = info[reading.direction];
  }
  for (const s of pointed) if (Object.hasOwn(ctx.segments, s) && s !== target) influences[s] = "for";
  return { kind: "clue", influences, authenticity: AUTHENTICITY[reading.matchesProfile] };
}

function storedClearIsConsistent(eff: Extract<Effect, { kind: "cleared" }>): boolean {
  const c = eff.inputs.coverage;
  if (typeof c !== "number" || !Number.isFinite(c) || c < 0) return false;
  if (typeof eff.pod !== "number" || !Number.isFinite(eff.pod)) return false;
  return Math.abs(eff.pod - pod(c)) <= POD_CONSISTENCY_TOLERANCE;
}

type ConfirmKey = [number, number, string];
function keyGreater(a: ConfirmKey, b: ConfirmKey): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return compareCodePoints(a[2], b[2]) > 0;
}

/**
 * Which stored events change the map (spec section 8). Deduplicate by eventId (first copy wins); skip prior
 * inputs and retracted ids. A retraction counts from command or the target's own author. A sighting counts
 * only when its deciding confirmation says "confirmed": confirmations count from command or family, a
 * command one outranks any family one, and within one role the latest by (clientTimeMs, eventId) wins.
 */
export function toEngineEvents(docs: EventDoc[], priorInputEventIds: string[]): EngineEvent[] {
  const byId = new Map<string, EventDoc>();
  for (const d of docs) if (!byId.has(d.eventId)) byId.set(d.eventId, d);
  const priorInputs = new Set(priorInputEventIds);
  const retracted = new Set<string>();
  for (const d of byId.values()) {
    if (d.type !== "retraction" || d.targetEventId === null) continue;
    const target = byId.get(d.targetEventId);
    if (target !== undefined && (d.role === "command" || d.authorUid === target.authorUid)) retracted.add(target.eventId);
  }
  const latest = new Map<string, { key: ConfirmKey; decision: "confirmed" | "rejected" }>();
  for (const d of byId.values()) {
    if (d.type !== "confirmation" || (d.role !== "command" && d.role !== "family") || d.targetEventId === null) continue;
    if (d.decision === null || retracted.has(d.eventId)) continue;
    const key: ConfirmKey = [d.role === "command" ? 1 : 0, d.clientTimeMs, d.eventId];
    const prev = latest.get(d.targetEventId);
    if (prev === undefined || keyGreater(key, prev.key)) latest.set(d.targetEventId, { key, decision: d.decision });
  }
  const out: EngineEvent[] = [];
  for (const id of [...byId.keys()].sort(compareCodePoints)) {
    if (priorInputs.has(id) || retracted.has(id)) continue;
    const d = byId.get(id)!;
    const eff = d.effect;
    const likely = eff.kind === "clue" && (eff.authenticity === "high" || eff.authenticity === "medium");
    if (d.type === "cleared" && eff.kind === "cleared" && storedClearIsConsistent(eff)) out.push({ eventId: id, effect: eff });
    else if (d.type === "clue" && likely) out.push({ eventId: id, effect: eff });
    else if (d.type === "sighting" && likely && latest.get(id)?.decision === "confirmed") out.push({ eventId: id, effect: eff });
  }
  return out;
}
