// Orthographic projection for the space-time cube: ground in metres, time straight up. Tens of points, so plain
// arithmetic in SVG is enough: unit-testable, no dependency, sharp at film size, and it works offline.

import type { CubeScene } from "./scene";

export type CubeView = { azimuthDeg: number; tiltDeg: number; size: number };

/** Metres per degree of latitude on the mean Earth radius (IUGG, 6,371,008.8 m). */
const M_PER_DEG = (6_371_008.8 * Math.PI) / 180;
const rad = (d: number) => (d * Math.PI) / 180;

/** Metres east (x) and north (y) of the origin; an equirectangular view, exact enough at a search site's scale. */
export function toLocalM(p: { lat: number; lon: number }, origin: { lat: number; lon: number }): { x: number; y: number } {
  return { x: (p.lon - origin.lon) * Math.cos(rad(origin.lat)) * M_PER_DEG, y: (p.lat - origin.lat) * M_PER_DEG };
}

/** Screen x and y (y grows down) inside a size-by-size picture, and depth (larger is farther from the viewer). */
export function project(p: { x: number; y: number; t: number }, s: CubeScene, v: CubeView): { sx: number; sy: number; depth: number } {
  const nx = p.x / s.halfM;
  const ny = p.y / s.halfM;
  const span = s.t1 - s.t0;
  const nt = span > 0 ? (2 * (p.t - s.t0)) / span - 1 : 0;
  const a = rad(v.azimuthDeg);
  const xr = nx * Math.cos(a) - ny * Math.sin(a);
  const yr = nx * Math.sin(a) + ny * Math.cos(a);
  const tilt = rad(v.tiltDeg);
  const up = nt * Math.cos(tilt) + yr * Math.sin(tilt);
  const depth = yr * Math.cos(tilt) - nt * Math.sin(tilt);
  // The cube's corners reach sqrt(2) across and cos(tilt) + sqrt(2) sin(tilt) up; keep both inside the picture.
  const reach = Math.max(Math.SQRT2, Math.cos(tilt) + Math.SQRT2 * Math.abs(Math.sin(tilt)));
  const scale = ((v.size / 2) * 0.94) / reach;
  return { sx: v.size / 2 + xr * scale, sy: v.size / 2 - up * scale, depth };
}

/** Painter's order: far things first, so near ones are drawn over them. */
export function farFirst<T extends { depth: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.depth - a.depth);
}
