// The role-player's GPS track in the command post's replay, loaded from a file on this computer (the import tool's
// track file). It is never uploaded and never fetched: a person's track is not published without that person's
// written consent. The replay draws the path walked up to the slider time and where the role-player was then.

import { COMMAND } from "../hostApp";
import type { ExtrasMapLike } from "../types";

export type Track = { synthetic: boolean; points: [number, number, number][] };

const FIELDS = ["version", "source", "gridId", "runId", "points"];
/** Across a gap longer than this the logger had no fix, so no place is drawn inside it (as the import tool). */
const MAX_GAP_MS = 120_000;
const MAX_POINTS = 50_000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The track when it is exactly the import tool's shape; otherwise why not, in plain words. */
export function readTrack(json: unknown): { ok: true; track: Track } | { ok: false; reason: string } {
  const no = (reason: string) => ({ ok: false as const, reason });
  if (!isObj(json) || Object.keys(json).some((k) => !FIELDS.includes(k)) || json["version"] !== 1) return no("This is not a track file from the import tool.");
  if (json["source"] !== "gps-logger" && json["source"] !== "synthetic") return no("The track does not say where it came from.");
  const pts = json["points"];
  if (!Array.isArray(pts) || pts.length === 0 || pts.length > MAX_POINTS) return no("The track has no points, or too many.");
  const points: [number, number, number][] = [];
  for (const p of pts as unknown[]) {
    if (!Array.isArray(p) || p.length !== 3 || !p.every(num)) return no("A point of the track cannot be read.");
    const [t, lat, lon] = p as [number, number, number];
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return no("A point of the track is not on the Earth.");
    if (points.length > 0 && t <= points[points.length - 1]![0]) return no("The track's times do not run forward.");
    points.push([t, lat, lon]);
  }
  return { ok: true, track: { synthetic: json["source"] === "synthetic", points } };
}

/** [lon, lat] of every point up to tMs, then the place at tMs on the line to the next point (none inside a gap). */
export function trackUpTo(track: Track, tMs: number): [number, number][] {
  const out: [number, number][] = [];
  const pts = track.points;
  for (let i = 0; i < pts.length; i++) {
    const [t, lat, lon] = pts[i]!;
    if (t > tMs) {
      const prev = pts[i - 1];
      if (prev && t - prev[0] <= MAX_GAP_MS) {
        const f = (tMs - prev[0]) / (t - prev[0]);
        out.push([prev[2] + f * (lon - prev[2]), prev[1] + f * (lat - prev[1])]);
      }
      break;
    }
    out.push([lon, lat]);
  }
  return out;
}

/** The walked path as a line and the place now as a point; empty before the track starts. */
export function trackCollection(walked: readonly [number, number][]): unknown {
  if (walked.length === 0) return { type: "FeatureCollection", features: [] };
  const now = walked[walked.length - 1]!;
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "LineString", coordinates: walked.length > 1 ? walked : [now, now] }, properties: { part: "walked" } },
      { type: "Feature", geometry: { type: "Point", coordinates: now }, properties: { part: "now" } },
    ],
  };
}

const SRC = "extras-track";
const LAYERS = ["extras-track-line", "extras-track-now"] as const;
const EMPTY = { type: "FeatureCollection", features: [] };

/** Adds the track's source and its two layers once; `remove` takes them away. Neutral greys: cyan and red keep their meaning. */
export function attachTrack(map: ExtrasMapLike): { set(c: unknown): void; remove(): void } {
  if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: EMPTY });
  if (!map.getLayer(LAYERS[0])) {
    map.addLayer({ id: LAYERS[0], type: "line", source: SRC, filter: ["==", ["get", "part"], "walked"], paint: { "line-color": COMMAND.fg2, "line-width": 3 } });
  }
  if (!map.getLayer(LAYERS[1])) {
    map.addLayer({
      id: LAYERS[1], type: "circle", source: SRC, filter: ["==", ["get", "part"], "now"],
      paint: { "circle-radius": 7, "circle-color": COMMAND.fg1, "circle-stroke-color": COMMAND.bg0, "circle-stroke-width": 3 },
    });
  }
  return {
    set(c) {
      (map.getSource(SRC) as { setData?: (d: unknown) => void } | undefined)?.setData?.(c);
    },
    remove() {
      for (const id of [...LAYERS].reverse()) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SRC)) map.removeSource(SRC);
    },
  };
}
