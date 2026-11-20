/** Counts the judge page shows for a published run, each read from the run file itself. */
export type RunNumbers = { events: number; planVersions: number; searchSegments: number };

/** ROW is the area outside the grid, not a segment a team searches. */
const OUTSIDE_GRID = "ROW";

export function runNumbers(run: unknown): RunNumbers | null {
  if (!run || typeof run !== "object") return null;
  const { events, plans, segments } = run as { events?: unknown; plans?: unknown; segments?: unknown };
  if (!Array.isArray(events) || !Array.isArray(plans) || !Array.isArray(segments)) return null;
  const versions = new Set(plans.map((p: unknown) => (p && typeof p === "object" ? (p as { version?: unknown }).version : undefined)).filter((v) => v !== undefined));
  const searchSegments = segments.filter((s: unknown) => !(s && typeof s === "object" && (s as { segmentId?: unknown }).segmentId === OUTSIDE_GRID)).length;
  return { events: events.length, planVersions: versions.size, searchSegments };
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function runNumbersLine(n: RunNumbers): string {
  return `${count(n.events, "event", "events")}, ${count(n.planVersions, "plan version", "plan versions")} and ${count(n.searchSegments, "search segment", "search segments")} in this run.`;
}
