// The approved plan beside a suggested one, team by team: the segments each plan gives a team, and the share of the
// probability on the current map those segments hold (the engine's own ranking). A plan's total counts each segment
// once, however many teams it sends there; a segment the ranking does not list counts as 0.

import type { RankedSegment } from "@pls/engine";

type Assigned = { teamId: string; segmentIds: readonly string[] };
export type CompareRow = { teamId: string; now: string[]; next: string[]; nowPoa: number; nextPoa: number; changed: boolean };

export function planCompare(current: readonly Assigned[], suggested: readonly Assigned[], rank: readonly RankedSegment[]): { rows: CompareRow[]; nowTotal: number; nextTotal: number } {
  const poa = new Map(rank.map((r) => [r.segmentId, r.poa]));
  const held = (ids: readonly string[]) => [...new Set(ids)].reduce((sum, id) => sum + (poa.get(id) ?? 0), 0);
  const segs = (plan: readonly Assigned[], teamId: string) => [...(plan.find((a) => a.teamId === teamId)?.segmentIds ?? [])];
  const teams = [...new Set([...current.map((a) => a.teamId), ...suggested.map((a) => a.teamId)])];
  const rows = teams.map((teamId) => {
    const now = segs(current, teamId);
    const next = segs(suggested, teamId);
    return { teamId, now, next, nowPoa: held(now), nextPoa: held(next), changed: now.join(",") !== next.join(",") };
  });
  return { rows, nowTotal: held(current.flatMap((a) => a.segmentIds)), nextTotal: held(suggested.flatMap((a) => a.segmentIds)) };
}
