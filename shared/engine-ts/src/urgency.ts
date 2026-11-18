import constants from "../../constants/urgency.json";
import type { IncidentConditions } from "./types";

export type UrgencyLevel = "cold" | "cool_wet" | "none";

/**
 * The urgency chip (P-12; CDC: hypothermia can occur above 40 F when a person is chilled from rain, sweat or
 * cold water, shared/constants/urgency.json): cold at or below 40 F, cool_wet above it when the person is
 * typed as wet, none otherwise. No typed temperature gives none (no chip without data); an unanswered wet
 * question counts as dry. Clothing does not enter.
 */
export function urgencyLevel(tempF: number | null, wet: boolean | null, coldF: number = constants.coldF): UrgencyLevel {
  if (tempF === null) return "none";
  if (tempF <= coldF) return "cold";
  return wet === true ? "cool_wet" : "none";
}

/** The chip for an incident's typed conditions; no conditions doc gives none. */
export function urgencyFromConditions(c: IncidentConditions | null | undefined): UrgencyLevel {
  return c ? urgencyLevel(c.tempF, c.wet) : "none";
}
