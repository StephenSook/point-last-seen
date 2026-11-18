import schema from "../../schemas/report-reading.schema.json";
import { normalizeCoverage } from "./pod";
import type { ReportReading, ValidationResult } from "./types";

// Enums and limits come from shared/schemas/report-reading.schema.json, so validation cannot drift from it.
type Prop = { enum?: string[]; maxLength?: number; maxItems?: number; minimum?: number; maximum?: number };
const P = schema.properties as unknown as Record<string, Prop>;
const ENUM_FIELDS = ["kind", "method", "searchType", "feature", "direction", "topColor", "bottomColor", "matchesProfile"] as const;
const TEXT_FIELDS = ["item", "footwear", "carried", "evidenceQuote"] as const;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Validates a reading against the schema, the known segment ids and the raw report text. Coverage is
 * normalized first (spec section 10.3), so 80 passes as 0.8 and 400 fails. Returns every reason.
 */
export function validateReading(reading: ReportReading, knownSegmentIds: string[], rawText: string): ValidationResult {
  const reasons: string[] = [];
  const r = reading as unknown as Record<string, unknown>;
  for (const f of ENUM_FIELDS) {
    if (!P[f]!.enum!.includes(r[f] as string)) reasons.push(`${f} is not one of the allowed values`);
  }
  const known = new Set(knownSegmentIds);
  if (!Array.isArray(reading.segmentIds) || reading.segmentIds.length > P.segmentIds!.maxItems!) {
    reasons.push(`segmentIds must hold at most ${P.segmentIds!.maxItems} ids`);
  } else if (reading.segmentIds.some(s => !known.has(s))) {
    reasons.push("segmentIds holds an unknown segment id");
  }
  if (reading.coverage !== null && (!finite(reading.coverage) || normalizeCoverage(reading.coverage) === "invalid")) {
    reasons.push("coverage must be a ratio from 0 to 3 or a percentage up to 300");
  }
  if (reading.minutes !== null && (!finite(reading.minutes) || reading.minutes <= 0)) reasons.push("minutes must be above 0");
  if (reading.searchers !== null && (!Number.isInteger(reading.searchers) || reading.searchers < P.searchers!.minimum!)) {
    reasons.push("searchers must be a whole number of 1 or more");
  }
  const d = reading.detectionRangeM;
  if (d !== null && (!finite(d) || d < P.detectionRangeM!.minimum! || d > P.detectionRangeM!.maximum!)) {
    reasons.push(`detectionRangeM must be from ${P.detectionRangeM!.minimum} to ${P.detectionRangeM!.maximum}`);
  }
  for (const f of TEXT_FIELDS) {
    const v = r[f];
    if (typeof v !== "string" || v.length > P[f]!.maxLength!) reasons.push(`${f} must be text of at most ${P[f]!.maxLength} characters`);
  }
  if (typeof reading.evidenceQuote === "string" && !rawText.includes(reading.evidenceQuote)) {
    reasons.push("evidenceQuote is not in the report text");
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
