// What the command post draws, recomputed from (prior version, engine
// parameters, event set). Probability is never stored as truth: any two
// seats with the same events draw the same map and show the same code.

import {
  convergenceCode,
  eventSetHash,
  posterior,
  rankSegments,
  toEngineEvents,
  type EngineParams,
  type EventDoc,
  type PosteriorResult,
  type RankedSegment,
  type SegmentPrior,
} from "@pls/engine";
import { changeModel, newLastKnownPointChange, type ChangeResult } from "./changeModel";

export type ViewState = { result: PosteriorResult; rank: RankedSegment[]; hash: string; code: string };

export function viewState(
  prior: SegmentPrior[],
  docs: readonly EventDoc[],
  priorInputEventIds: readonly string[],
  params: EngineParams,
  priorVersion: number,
): ViewState {
  const result = posterior(prior, toEngineEvents([...docs], [...priorInputEventIds]), params);
  const rank = rankSegments(result, prior).filter((r) => r.segmentId !== "ROW");
  const hash = eventSetHash(priorVersion, [...new Set(docs.map((d) => d.eventId))]);
  return { result, rank, hash, code: convergenceCode(hash) };
}

// Plan acknowledgements never move the map, so they are not "the newest report".
const NOT_A_REPORT = new Set<EventDoc["type"]>(["plan_ack"]);

export type LastChange = { causeEventId: string; before: Record<string, number>; after: Record<string, number>; change: ChangeResult };

/**
 * What the newest report did to the map: the posterior without that one event against
 * the posterior with every event. Recomputed from the events, so a reload or a second
 * seat shows the same change.
 */
export function lastReportChange(
  prior: SegmentPrior[],
  docs: readonly EventDoc[],
  priorInputEventIds: readonly string[],
  params: EngineParams,
): LastChange | null {
  const reports = docs.filter((d) => !NOT_A_REPORT.has(d.type));
  if (reports.length === 0) return null;
  const cause = reports.reduce((a, b) => (b.clientTimeMs > a.clientTimeMs || (b.clientTimeMs === a.clientTimeMs && b.seq > a.seq) ? b : a));
  const ids = [...priorInputEventIds];
  // Command confirming a sighting with a place rebuilt the prior from it (the sighting is now a prior input).
  const target = cause.type === "confirmation" && cause.role === "command" && cause.decision === "confirmed" && cause.targetEventId
    ? docs.find((d) => d.eventId === cause.targetEventId)
    : undefined;
  if (target && target.type === "sighting" && ids.includes(target.eventId)) {
    const poa = posterior(prior, toEngineEvents([...docs], ids), params).poa;
    return { causeEventId: cause.eventId, before: poa, after: poa, change: newLastKnownPointChange(target, cause) };
  }
  const before = posterior(prior, toEngineEvents(docs.filter((d) => d.eventId !== cause.eventId), ids), params).poa;
  const after = posterior(prior, toEngineEvents([...docs], ids), params).poa;
  return { causeEventId: cause.eventId, before, after, change: changeModel(before, after, cause) };
}
