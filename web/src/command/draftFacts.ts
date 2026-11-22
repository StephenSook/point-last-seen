// The facts a plan's reasons may cite, for the draft: each segment's grid features, whether a team has searched it,
// whether the newest report raised it, and its distance band from the last-seen point. All already on this laptop.

import type { EngineParams, EventDoc } from "@pls/engine";
import { planFacts, type PlanFacts } from "../ai/reasonCodes";
import type { IncidentDoc } from "../data/incident";
import type { Changed } from "./changeModel";

export type DraftFactInputs = {
  incident: Pick<IncidentDoc, "ipp" | "terrain" | "priorModel">;
  params: EngineParams;
  segments: readonly { segmentId: string; centroid: { lat: number; lon: number }; featureClasses?: readonly string[] }[];
  /** The posterior's cumulative POD per segment. */
  cumulativePod: Readonly<Record<string, number>>;
  /** What the newest report did to the map; null before any report. */
  changed: readonly Changed[] | null;
  /** The incident's events, for the segments teams reported clearing. */
  events?: readonly EventDoc[];
};

/**
 * Every segment a stored, unretracted clear names, and the segment the engine credited it to. The engine credits a
 * clear to one segment only (its first known one), so a clear naming AA and AB leaves AB with no POD although a team
 * searched it. A retraction counts from command or the clear's own author, as in the engine (toEngineEvents).
 */
export function reportedSearched(events: readonly EventDoc[]): string[] {
  const byId = new Map<string, EventDoc>();
  for (const d of events) if (!byId.has(d.eventId)) byId.set(d.eventId, d);
  const retracted = new Set<string>();
  for (const d of byId.values()) {
    if (d.type !== "retraction" || !d.targetEventId) continue;
    const target = byId.get(d.targetEventId);
    if (target && (d.role === "command" || d.authorUid === target.authorUid)) retracted.add(target.eventId);
  }
  const ids = new Set<string>();
  for (const d of byId.values()) {
    if (d.type !== "cleared" || retracted.has(d.eventId)) continue;
    const r = d.reading as { segmentIds?: unknown } | null | undefined;
    if (Array.isArray(r?.segmentIds)) for (const id of r.segmentIds) if (typeof id === "string") ids.add(id);
    const e = d.effect as { kind?: unknown; segmentId?: unknown } | null | undefined;
    if (e?.kind === "cleared" && typeof e.segmentId === "string") ids.add(e.segmentId);
  }
  return [...ids];
}

/**
 * The distance band comes from the ring model's radii for the incident's terrain column (flat when unset, as the map's
 * ring overlay reads it) and only when the map uses the ring model and the incident has a last-seen point.
 */
export function draftFacts({ incident, params, segments, cumulativePod, changed, events = [] }: DraftFactInputs): PlanFacts {
  const radiiKm = params.rings[incident.terrain ?? "temperate_flat"];
  const ring = incident.ipp && (incident.priorModel ?? "rings") === "rings" ? { ipp: incident.ipp, radiiKm, masses: params.rings.masses } : null;
  const raisedIds = (changed ?? []).filter((c) => c.deltaPts > 0).map((c) => c.segmentId);
  return planFacts({ segments, cumulativePod, searchedIds: reportedSearched(events), raisedIds, ring });
}
