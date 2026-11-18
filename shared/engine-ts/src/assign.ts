import type { DraftAssignment, RankedSegment } from "./types";

/**
 * Greedy and stable, one segment per team. A team keeps its current segment while that segment is in the
 * top 2 x teamCount and no earlier team kept it; then teams without a segment take the best untaken one,
 * in teamIds order. A team gets an empty list when nothing is left.
 */
export function assignTeams(rank: RankedSegment[], teamIds: string[], current: DraftAssignment[]): DraftAssignment[] {
  const eligible = new Set(rank.slice(0, 2 * teamIds.length).map(r => r.segmentId));
  const taken = new Set<string>();
  const out = new Map<string, string[]>();
  for (const t of teamIds) {
    const cur = current.find(a => a.teamId === t)?.segmentIds[0];
    if (cur !== undefined && eligible.has(cur) && !taken.has(cur)) {
      out.set(t, [cur]);
      taken.add(cur);
    }
  }
  for (const t of teamIds) {
    if (out.has(t)) continue;
    const next = rank.find(r => !taken.has(r.segmentId));
    if (next) {
      out.set(t, [next.segmentId]);
      taken.add(next.segmentId);
    } else {
      out.set(t, []);
    }
  }
  return teamIds.map(t => ({ teamId: t, segmentIds: out.get(t)! }));
}
