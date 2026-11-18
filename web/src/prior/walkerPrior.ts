// The walker prior at the command post: the site's route graph (a file beside its basemap)
// and the writes that make a walker run the shared prior. The ring prior stays stored in
// ringPoa as the baseline and the comparison (spec 10.6).

import type { WalkerResult, WalkerRouteGraph } from "@pls/engine";

export type GraphLoad = { state: "ok"; graph: WalkerRouteGraph } | { state: "absent" } | { state: "invalid" } | { state: "unavailable" };

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
  const g = body as Partial<WalkerRouteGraph> | null;
  const ok = !!g && Array.isArray(g.stations) && Array.isArray(g.edges) && Array.isArray(g.nodes) && g.stations.length > 0;
  return ok ? { state: "ok", graph: g as WalkerRouteGraph } : { state: "invalid" };
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
