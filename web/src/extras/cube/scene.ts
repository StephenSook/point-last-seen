// The space-time cube's contents, from the published run: each positioned report as a vertical bar at its place
// from the time it was sent (a sighting: the time it was seen) up to the time it arrived at command, and the order
// of confirmed sightings. The bar's height is the time the report waited for signal: the one thing the flat map
// cannot show. The engine has no time term, so the cube shows no engine quantity.

import type { ReplayData } from "../replay/replayData";
import { stateAt, type ReplayWindow } from "../replay/stateAt";
import { trailOrder, trailPoints } from "../replay/trail";
import { toLocalM } from "./project";

export type CubePoint = {
  id: string;
  kind: "sighting" | "camera" | "report";
  /** Metres east and north of the grid centre. */
  x: number;
  y: number;
  /** Bottom and top of the bar, ms. Equal when there is no bar. */
  t0: number;
  t1: number;
  /** Sent to arrived, in seconds; null when the phone's clock is suspect. */
  waitS: number | null;
};

export type CubeScene = {
  points: CubePoint[];
  /** Confirmed sightings, in the order seen. */
  order: string[];
  floor: { segmentId: string; ring: [number, number][] }[];
  halfM: number;
  t0: number;
  t1: number;
};

/** G-CUBE: at least 4 positioned reports, and at least one that waited 60 s or more for signal. */
const GATE_POSITIONED = 4;
const GATE_WAIT_S = 60;

export function cubeScene(data: ReplayData, w: ReplayWindow): CubeScene {
  let w0 = 180, e0 = -180, s0 = 90, n0 = -90;
  for (const seg of data.segments) {
    const rings = seg.geometry.type === "Polygon" ? seg.geometry.coordinates : seg.geometry.coordinates.flat();
    for (const ring of rings) for (const [lon, lat] of ring as [number, number][]) {
      w0 = Math.min(w0, lon); e0 = Math.max(e0, lon); s0 = Math.min(s0, lat); n0 = Math.max(n0, lat);
    }
  }
  const origin = data.segments.length > 0 ? { lat: (s0 + n0) / 2, lon: (w0 + e0) / 2 } : { lat: 0, lon: 0 };

  const floor = data.segments.map((seg) => {
    const outer = (seg.geometry.type === "Polygon" ? seg.geometry.coordinates[0] : seg.geometry.coordinates[0]?.[0]) ?? [];
    return { segmentId: seg.segmentId, ring: (outer as [number, number][]).map(([lon, lat]): [number, number] => {
      const p = toLocalM({ lat, lon }, origin);
      return [p.x, p.y];
    }) };
  });

  const frame = stateAt(data, w.endMs);
  const byId = new Map(frame.shown.map((e) => [e.eventId, e]));
  const trail = trailPoints(frame);
  const points: CubePoint[] = trail.flatMap((tp) => {
    const e = byId.get(tp.eventId);
    if (!e || e.arrivedAtMs === null) return [];
    const local = toLocalM(tp, origin);
    // No bar from a time that is not trusted (a suspect phone clock, or seen after it arrived).
    const bottom = tp.kind === "report" ? (e.clockSuspect ? e.arrivedAtMs : e.sentAtMs) : tp.timeTrusted ? tp.tMs : e.arrivedAtMs;
    return [{ id: e.eventId, kind: tp.kind, x: local.x, y: local.y, t0: bottom, t1: e.arrivedAtMs, waitS: e.offlineForMs === null ? null : e.offlineForMs / 1000 }];
  });

  let reach = 1;
  for (const f of floor) for (const [x, y] of f.ring) reach = Math.max(reach, Math.abs(x), Math.abs(y));
  for (const p of points) reach = Math.max(reach, Math.abs(p.x), Math.abs(p.y));
  return {
    points,
    order: trailOrder(trail).map((p) => p.eventId),
    floor,
    halfM: Math.ceil(reach * 1.05),
    t0: Math.min(w.startMs, ...points.map((p) => p.t0)),
    t1: w.endMs,
  };
}

export function cubeGate(s: CubeScene): { pass: boolean; positioned: number; longestWaitS: number } {
  const waits = s.points.map((p) => p.waitS).filter((x): x is number => x !== null);
  const longestWaitS = waits.length > 0 ? Math.max(...waits) : 0;
  return { pass: s.points.length >= GATE_POSITIONED && longestWaitS >= GATE_WAIT_S, positioned: s.points.length, longestWaitS };
}
