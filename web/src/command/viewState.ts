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
