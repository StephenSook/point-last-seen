// The engine's sampled walker tracks (station ids and an end point, in local metres) as
// longitude and latitude polylines with cohort release times, so the canvas projects only
// each walker's current point per frame. A graph without a projection (a local fixture)
// is read as if its metres were degrees.

import type { WalkerRouteGraph, WalkerTrack } from "@pls/engine";
import { cohortReleaseMs, type Track } from "./walkerCanvas";

export function walkerTracksToLngLat(tracks: readonly WalkerTrack[], graph: WalkerRouteGraph, durationMs: number): Track[] {
  const p = graph.projection;
  const toLngLat = (x: number, y: number): [number, number] =>
    p ? [p.origin.lon + x / p.metresPerDegreeLon, p.origin.lat + y / p.metresPerDegreeLat] : [x, y];
  return tracks.map((t, i) => {
    const pts = t.stationIds.flatMap((id) => {
      const s = graph.stations[id];
      return s ? [toLngLat(s.x, s.y)] : [];
    });
    if (t.endpoint) pts.push(toLngLat(t.endpoint.x, t.endpoint.y));
    return { pts, releaseMs: cohortReleaseMs(i), durationMs };
  });
}
