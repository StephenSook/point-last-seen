// The facts a plan's reasons may cite, for the draft: each segment's grid features, whether a team has searched it,
// whether the newest report raised it, and its distance band from the last-seen point. All already on this laptop.

import type { EngineParams } from "@pls/engine";
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
};

/**
 * The distance band comes from the ring model's radii for the incident's terrain column (flat when unset, as the map's
 * ring overlay reads it) and only when the map uses the ring model and the incident has a last-seen point.
 */
export function draftFacts({ incident, params, segments, cumulativePod, changed }: DraftFactInputs): PlanFacts {
  const radiiKm = params.rings[incident.terrain ?? "temperate_flat"];
  const ring = incident.ipp && (incident.priorModel ?? "rings") === "rings" ? { ipp: incident.ipp, radiiKm, masses: params.rings.masses } : null;
  const raisedIds = (changed ?? []).filter((c) => c.deltaPts > 0).map((c) => c.segmentId);
  return planFacts({ segments, cumulativePod, raisedIds, ring });
}
