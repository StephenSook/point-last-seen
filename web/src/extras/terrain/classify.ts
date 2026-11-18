// Terrain as a display only: each segment marked lower than the start segment, higher, or about level, next to the
// ISRID dementia profile's elevation shares. The search prior has no elevation term, and this changes no number.

import type { MapSegment } from "../laneC";

export type ElevationFile = {
  gridId: string;
  gridSha256: string;
  source: string;
  license: string;
  credit: string;
  fetchedAt: string;
  samplesPerCell: number;
  units: "metres";
  cells: Record<string, { meanM: number; minM: number; maxM: number; n: number }>;
};
export type TerrainClass = "lower" | "level" | "higher" | "no_data";

/** "About level": within 3 m of the start segment. Ours; the ISRID table gives no definition of "Same". */
export const LEVEL_BAND_M = 3;
/** A stream link whose two cells differ by 1 m or less is counted as level (ours). */
export const STREAM_LEVEL_M = 1;
/**
 * ISRID dementia profile, "Elevation (vertical) Change from the IPP", the first group of three (temperate):
 * found downhill 42%, uphill 19%, same 39%. Re-read 2026-11-18 at the publisher's public sample page.
 */
export const ISRID_ELEVATION = {
  downhillPct: 42,
  uphillPct: 19,
  samePct: 39,
  source: "ISRID dementia profile, Koester, Lost Person Behavior",
  reread: "2026-11-18",
} as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

export function parseElevation(json: unknown, gridId: string): { ok: true; file: ElevationFile } | { ok: false; reason: string } {
  if (!isObj(json) || !isObj(json["cells"])) return { ok: false, reason: "The elevation file cannot be read." };
  if (json["gridId"] !== gridId) return { ok: false, reason: "The elevation file is for another grid." };
  if (!text(json["source"]) || !text(json["license"]) || !text(json["credit"]) || !text(json["fetchedAt"])) {
    return { ok: false, reason: "The elevation file does not name its source, licence, credit and date." };
  }
  if (json["units"] !== "metres") return { ok: false, reason: "The elevation file is not in metres." };
  for (const [id, c] of Object.entries(json["cells"])) {
    if (!isObj(c) || !num(c["meanM"]) || !num(c["minM"]) || !num(c["maxM"]) || !num(c["n"])) {
      return { ok: false, reason: `The elevation file has a broken cell: ${id}.` };
    }
  }
  return { ok: true, file: json as unknown as ElevationFile };
}

/**
 * Each segment against the start segment's mean elevation. With no start segment, or one the file does not hold,
 * every class is no_data. With `segmentIds`, a segment the file does not hold is no_data too.
 */
export function classifyTerrain(
  file: ElevationFile,
  startSegmentId: string | null,
  bandM: number = LEVEL_BAND_M,
  segmentIds?: readonly string[],
): Record<string, TerrainClass> {
  const ids = segmentIds ?? Object.keys(file.cells);
  const start = startSegmentId === null ? undefined : file.cells[startSegmentId];
  const out: Record<string, TerrainClass> = {};
  for (const id of ids) {
    const cell = file.cells[id];
    if (!start || !cell) out[id] = "no_data";
    else {
      const d = cell.meanM - start.meanM;
      out[id] = d < -bandM ? "lower" : d > bandM ? "higher" : "level";
    }
  }
  return out;
}

/** Gate G-TERR-2: do the grid's stream links (from OpenStreetMap stream direction) run downhill in this data? */
export function streamDownhillCheck(
  file: ElevationFile,
  segments: readonly { segmentId: string; downstream: readonly string[] }[],
): { links: number; downhill: number; level: number; uphill: number } {
  const r = { links: 0, downhill: 0, level: 0, uphill: 0 };
  for (const s of segments) {
    const from = file.cells[s.segmentId];
    for (const to of s.downstream) {
      const t = file.cells[to];
      if (!from || !t) continue;
      r.links++;
      const d = t.meanM - from.meanM;
      if (d < -STREAM_LEVEL_M) r.downhill++;
      else if (d > STREAM_LEVEL_M) r.uphill++;
      else r.level++;
    }
  }
  return r;
}

/** G-TERR-2: at most 20 percent of stream links may run uphill; a site with no stream link passes by default. */
export const STREAM_GATE_MAX_UPHILL = 0.2;

export function streamGate(r: { links: number; uphill: number }): { pass: boolean; uphillShare: number } {
  const uphillShare = r.links > 0 ? r.uphill / r.links : 0;
  return { pass: uphillShare <= STREAM_GATE_MAX_UPHILL, uphillShare };
}

function inRing(lat: number, lon: number, ring: readonly (readonly number[])[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i]! as [number, number];
    const [x2, y2] = ring[j]! as [number, number];
    if (y1 > lat !== y2 > lat && lon < x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1)) hit = !hit;
  }
  return hit;
}

/** The segment that holds a point (the start point), or null. */
export function segmentAt(segments: readonly MapSegment[], p: { lat: number; lon: number }): string | null {
  for (const s of segments) {
    const polys = s.geometry.type === "Polygon" ? [s.geometry.coordinates] : s.geometry.coordinates;
    for (const rings of polys) {
      if (rings[0] && inRing(p.lat, p.lon, rings[0]) && !rings.slice(1).some((h) => inRing(p.lat, p.lon, h))) return s.segmentId;
    }
  }
  return null;
}
