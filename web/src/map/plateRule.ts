// Which probability plates the map draws. A plate shows when its segment holds 1.0% or more and the plate fits
// inside the segment's on-screen box at the current zoom; zooming in brings more back. A "<0.1%" plate is never
// drawn. With "every percent" on, command sees every plate of 0.1% or more whatever its size. The same rule
// runs on the phones, so a commander and a searcher see the same numbers at the same zoom.

import type { Box } from "./labelDensity";

export const PLATE_MIN_POA = 0.01;

export type PlateInput = { poa: number; label: string; plate: { w: number; h: number }; box: Box; every: boolean };

export function plateShown(p: PlateInput): boolean {
  if (p.label === "" || p.label.startsWith("<")) return false;
  if (p.every) return true;
  return p.poa >= PLATE_MIN_POA && p.plate.w <= p.box.right - p.box.left && p.plate.h <= p.box.bottom - p.box.top;
}

/** The axis-aligned box around a segment's projected points, or null with none. */
export function screenBox(points: readonly (readonly [number, number])[]): Box | null {
  if (points.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const [x, y] of points) {
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return { left, top, right, bottom };
}
