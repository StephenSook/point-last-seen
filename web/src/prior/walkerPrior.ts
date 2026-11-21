// The walker prior at the command post: the site's route graph (a file beside its basemap)
// and the writes that make a walker run the shared prior. The ring prior stays stored in
// ringPoa as the baseline and the comparison (spec 10.6).

import { indexRouteGraph, type RouteGraph, type WalkerResult, type WalkerRouteGraph } from "@pls/engine";

export type GraphLoad = { state: "ok"; graph: WalkerRouteGraph } | { state: "absent" } | { state: "invalid" } | { state: "unavailable" };

/** A loaded route graph, used only for the grid it was loaded for: after a site change the old site's routes never run. */
export function graphFor(gridId: string | undefined, loaded: { gridId: string; load: GraphLoad } | null): GraphLoad | null {
  return loaded && gridId !== undefined && loaded.gridId === gridId ? loaded.load : null;
}

export async function loadRouteGraph(url: string, fetchFn: (url: string) => Promise<Response> = fetch): Promise<GraphLoad> {
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch {
    return { state: "unavailable" };
  }
  // Hosting rewrites unknown paths to the app, so a missing file can arrive as HTML with status 200.
  if (res.status === 404 || (res.headers.get("content-type") ?? "").includes("text/html")) return { state: "absent" };
  if (!res.ok) return { state: "unavailable" };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { state: "invalid" };
  }
  // The file is the grid builder's stored RouteGraph; the engine indexes it (and refuses one
  // without bounds or a projection, which would otherwise read as a graph with no exits).
  const g = body as Partial<RouteGraph> | null;
  if (!g || !Array.isArray(g.edges) || !Array.isArray(g.nodes) || g.edges.length === 0) return { state: "invalid" };
  try {
    return { state: "ok", graph: indexRouteGraph(g as RouteGraph) };
  } catch {
    return { state: "invalid" };
  }
}

export type WalkerPriorWrites = {
  segments: { segmentId: string; data: { priorPoa: number; priorVersion: number } }[];
  row: { priorPoa: number; priorVersion: number };
  incident: { priorModel: "walkers"; priorSeed: number; priorInputEventIds: string[]; priorVersion: number };
};

export function walkerPriorWrites(
  result: WalkerResult,
  incident: { priorVersion: number; priorInputEventIds?: string[] },
  run: { seed: number; attractorEventIds: readonly string[] },
): WalkerPriorWrites {
  const priorVersion = incident.priorVersion + 1;
  const inputs = [...(incident.priorInputEventIds ?? [])];
  for (const id of run.attractorEventIds) if (!inputs.includes(id)) inputs.push(id);
  return {
    segments: result.segments.map((s) => ({ segmentId: s.segmentId, data: { priorPoa: s.priorPoa, priorVersion } })),
    row: { priorPoa: result.row, priorVersion },
    incident: { priorModel: "walkers", priorSeed: run.seed, priorInputEventIds: inputs, priorVersion },
  };
}

export const STALE_PRIOR = "The prior changed while the walkers ran. Run them again.";

/**
 * Runs a prior computed off the main thread and returns its result only if the incident's prior
 * is still the version the run started from. A result that finishes after another rebuild would
 * otherwise be written as the same next version, from the old inputs, over the newer prior.
 */
export async function runAgainstVersion<T>(startVersion: number, currentVersion: () => number, run: () => Promise<T>): Promise<T> {
  const r = await run();
  if (currentVersion() !== startVersion) throw new Error(STALE_PRIOR);
  return r;
}
