import type { RouteGraph, WalkerProjection, WalkerRouteGraph } from "./index";
import { projectWalkerPoint } from "./walkers";

type Point = { x: number; y: number };
type Bounds = [number, number, number, number];

/** Points within this many metres are one point (graph nodes, boundary tests). */
export const ROUTE_SNAP_M = 1e-6;

/** The extract bounds as a projected box, or undefined for a graph with no exits. */
export function routeGraphExtent(projection: WalkerProjection, bounds?: Bounds | null): { min: Point; max: Point } | undefined {
  if (!bounds) return undefined;
  const [minLon, minLat, maxLon, maxLat] = bounds;
  return { min: projectWalkerPoint(projection, { lon: minLon, lat: minLat }),
    max: projectWalkerPoint(projection, { lon: maxLon, lat: maxLat }) };
}

function onBoundary(p: Point, extent?: { min: Point; max: Point }): boolean {
  return !!extent && (Math.abs(p.x - extent.min.x) < ROUTE_SNAP_M || Math.abs(p.x - extent.max.x) < ROUTE_SNAP_M
    || Math.abs(p.y - extent.min.y) < ROUTE_SNAP_M || Math.abs(p.y - extent.max.y) < ROUTE_SNAP_M);
}

/**
 * Adapt stored edges to station IDs. The graph carries its own extract bounds and projection, so a reload
 * rebuilds the same exits with no outside input; a graph without them is refused, because reading it as
 * "no exits" would silently keep walkers that should leave the area on the graph.
 */
export function indexRouteGraph(graph: RouteGraph): WalkerRouteGraph {
  if (graph.bounds === undefined) throw new Error(`route graph ${graph.graphId} has no bounds field: rebuild it with the grid builder`);
  if (!graph.projection) throw new Error(`route graph ${graph.graphId} has no projection: rebuild it with the grid builder`);
  const projection = { origin: graph.origin, ...graph.projection };
  const extent = routeGraphExtent(projection, graph.bounds);
  const nodes = graph.nodes.map(node => ({ id: node.nodeId, edgeIds: [] as number[], boundary: onBoundary(node, extent) }));
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const stations: WalkerRouteGraph["stations"] = [];
  const edges = graph.edges.map(edge => {
    nodesById.get(edge.from)!.edgeIds.push(edge.edgeId);
    if (edge.from !== edge.to) nodesById.get(edge.to)!.edgeIds.push(edge.edgeId);
    const stationIds = edge.stations.map(station => stations.push({ ...station, edgeId: edge.edgeId }) - 1);
    return { id: edge.edgeId, cls: edge.class, from: edge.from, to: edge.to, stationIds };
  });
  return { stations, edges, nodes, projection };
}

