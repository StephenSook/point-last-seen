// The sightings trail for a replay frame: a point per positioned report, and a line joining the confirmed
// sightings in the order they were seen. The line is an order, not a track: nobody knows the path between two
// sightings. Legs print distance, time and the speed that implies; no speed is judged, because there is no
// sourced limit to compare it with.

import { COMMAND } from "../laneC";
import type { ExtrasMapLike } from "../types";
import type { ReplayEvent } from "./replayData";
import type { ReplayFrame } from "./stateAt";

export type TrailPoint = { eventId: string; kind: "sighting" | "camera" | "report"; lat: number; lon: number; tMs: number; confirmed: boolean };
export type Leg = { fromId: string; toId: string; metres: number; minutes: number; mps: number };

/** Mean Earth radius (IUGG), metres. */
const R = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Events that never put a person or a searcher on the map. */
const NOT_A_PLACE = new Set<ReplayEvent["type"]>(["confirmation", "retraction", "plan_ack"]);

/** The engine's rules on the shown events: who may retract what, and the latest command or family decision. */
function decisions(shown: readonly ReplayEvent[]): { retracted: Set<string>; confirmed: Set<string> } {
  const byId = new Map(shown.map((e) => [e.eventId, e]));
  const retracted = new Set<string>();
  for (const e of shown) {
    const d = e.doc;
    if (d.type !== "retraction" || d.targetEventId === null) continue;
    const target = byId.get(d.targetEventId);
    if (target && (d.role === "command" || d.authorUid === target.doc.authorUid)) retracted.add(target.eventId);
  }
  type Key = [number, number, string];
  const greater = (a: Key, b: Key) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
  const latest = new Map<string, { key: Key; decision: "confirmed" | "rejected" }>();
  for (const e of shown) {
    const d = e.doc;
    if (d.type !== "confirmation" || (d.role !== "command" && d.role !== "family") || d.targetEventId === null) continue;
    if (d.decision === null || retracted.has(d.eventId)) continue;
    const key: Key = [d.role === "command" ? 1 : 0, d.clientTimeMs, d.eventId];
    const prev = latest.get(d.targetEventId);
    if (!prev || greater(key, prev.key)) latest.set(d.targetEventId, { key, decision: d.decision });
  }
  const confirmed = new Set([...latest].filter(([, v]) => v.decision === "confirmed").map(([id]) => id));
  return { retracted, confirmed };
}

function seenAtMs(e: ReplayEvent): number {
  if (e.camera) return e.camera.endMs;
  if (e.observedAtMs !== null) return e.observedAtMs;
  return e.clockSuspect || e.arrivedAtMs === null ? (e.arrivedAtMs ?? e.sentAtMs) : e.sentAtMs;
}

export function trailPoints(frame: ReplayFrame): TrailPoint[] {
  const { retracted, confirmed } = decisions(frame.shown);
  return frame.shown.flatMap((e): TrailPoint[] => {
    if (!e.position || NOT_A_PLACE.has(e.type) || retracted.has(e.eventId)) return [];
    const kind = e.type === "sighting" ? "sighting" : e.type === "camera_sighting" ? "camera" : "report";
    return [{ eventId: e.eventId, kind, lat: e.position.lat, lon: e.position.lon, tMs: seenAtMs(e), confirmed: kind !== "report" && confirmed.has(e.eventId) }];
  });
}

/** Confirmed sightings and confirmed camera sightings, by the time the person was seen. */
export function trailOrder(points: readonly TrailPoint[]): TrailPoint[] {
  return points
    .filter((p) => p.confirmed && p.kind !== "report")
    .sort((a, b) => a.tMs - b.tMs || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
}

export function legs(order: readonly TrailPoint[]): Leg[] {
  const out: Leg[] = [];
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1]!;
    const b = order[i]!;
    const minutes = (b.tMs - a.tMs) / 60_000;
    if (minutes <= 0) continue;
    const metres = haversineM(a, b);
    out.push({ fromId: a.eventId, toId: b.eventId, metres, minutes, mps: metres / (minutes * 60) });
  }
  return out;
}

/** "1.1 km in 40 min, 0.46 m/s". */
export function legText(l: Leg): string {
  const dist = l.metres >= 1000 ? `${(l.metres / 1000).toFixed(1)} km` : `${Math.round(l.metres)} m`;
  return `${dist} in ${Math.round(l.minutes)} min, ${l.mps.toFixed(2)} m/s`;
}

export function trailCollections(frame: ReplayFrame): { points: unknown; line: unknown } {
  const points = trailPoints(frame);
  const order = trailOrder(points);
  return {
    points: {
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: { eventId: p.eventId, kind: p.kind, confirmed: p.confirmed },
      })),
    },
    line: {
      type: "FeatureCollection",
      features: order.length < 2 ? [] : [{ type: "Feature", geometry: { type: "LineString", coordinates: order.map((p) => [p.lon, p.lat]) }, properties: {} }],
    },
  };
}

const SRC_POINTS = "extras-trail-points";
const SRC_LINE = "extras-trail-line";
const LAYERS = ["extras-trail-line", "extras-trail-other", "extras-trail-confirmed"] as const;
const EMPTY = { type: "FeatureCollection", features: [] };

/** Adds the trail's two sources and three layers once; `remove` takes every one away again. */
export function attachTrail(map: ExtrasMapLike): { set(c: { points: unknown; line: unknown }): void; remove(): void } {
  if (!map.getSource(SRC_POINTS)) map.addSource(SRC_POINTS, { type: "geojson", data: EMPTY });
  if (!map.getSource(SRC_LINE)) map.addSource(SRC_LINE, { type: "geojson", data: EMPTY });
  // Neutral ink only: cyan and red keep their one meaning each, and teams have no colours.
  if (!map.getLayer(LAYERS[0])) {
    map.addLayer({ id: LAYERS[0], type: "line", source: SRC_LINE, paint: { "line-color": COMMAND.fg1, "line-width": 2, "line-dasharray": [2, 2] } });
  }
  if (!map.getLayer(LAYERS[1])) {
    map.addLayer({
      id: LAYERS[1], type: "circle", source: SRC_POINTS, filter: ["!=", ["get", "confirmed"], true],
      paint: { "circle-radius": 5, "circle-color": COMMAND.bg0, "circle-stroke-color": COMMAND.fg2, "circle-stroke-width": 2 },
    });
  }
  if (!map.getLayer(LAYERS[2])) {
    map.addLayer({
      id: LAYERS[2], type: "circle", source: SRC_POINTS, filter: ["==", ["get", "confirmed"], true],
      paint: { "circle-radius": 6, "circle-color": COMMAND.fg1, "circle-stroke-color": COMMAND.bg0, "circle-stroke-width": 2 },
    });
  }
  const setData = (id: string, data: unknown) => (map.getSource(id) as { setData?: (d: unknown) => void } | undefined)?.setData?.(data);
  return {
    set(c) {
      setData(SRC_POINTS, c.points);
      setData(SRC_LINE, c.line);
    },
    remove() {
      for (const id of [...LAYERS].reverse()) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of [SRC_LINE, SRC_POINTS]) if (map.getSource(id)) map.removeSource(id);
    },
  };
}
