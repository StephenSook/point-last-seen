import { compareCodePoints } from "./compare";
import type { PosteriorResult, RankedSegment, SegmentPrior } from "./types";

/** POA descending, then segmentId; ROW is left out (it is shown as "outside the mapped area"); rank starts at 1. */
export function rankSegments(result: PosteriorResult, prior: SegmentPrior[]): RankedSegment[] {
  const rows = prior.filter(s => s.segmentId !== "ROW");
  const poaOf = (id: string) => result.poa[id] ?? 0;
  rows.sort((a, b) => {
    const d = poaOf(b.segmentId) - poaOf(a.segmentId);
    return d !== 0 ? d : compareCodePoints(a.segmentId, b.segmentId);
  });
  return rows.map((s, i) => ({
    segmentId: s.segmentId, rank: i + 1, poa: poaOf(s.segmentId), priorPoa: s.priorPoa,
    deltaPoa: poaOf(s.segmentId) - s.priorPoa,
  }));
}
