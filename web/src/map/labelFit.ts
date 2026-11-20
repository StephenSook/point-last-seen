// How a cell's dot and its code fit the cell on screen (the rule is written out in plateRule.ts). A dot is never
// wider than its cell: its radius is capped at half the smaller side of the cell's on-screen box. A code sits left of
// its dot when it fits there inside the box, moves onto the centre when it does not, and is hidden only when it fits
// nowhere; the cell is still named in the ranked list and the Place list. Both are decided again on every camera move.

import type { Box } from "./labelDensity";

/** The space between a code and the dot to its right. */
export const CODE_GAP_PX = 3;

export function cappedDotRadius(r: number, box: Box): number {
  return Math.max(0, Math.min(r, Math.min(box.right - box.left, box.bottom - box.top) / 2));
}

export type CodePlace = "left" | "centre" | "hidden";

export function codePlace(p: { code: { w: number; h: number }; box: Box; centre: { x: number; y: number }; dotR: number }): CodePlace {
  const { code, box, centre, dotR } = p;
  const top = centre.y - code.h / 2;
  const bottom = centre.y + code.h / 2;
  if (top < box.top || bottom > box.bottom) return "hidden";
  const leftEdge = centre.x - dotR - CODE_GAP_PX - code.w;
  if (leftEdge >= box.left) return "left";
  if (centre.x - code.w / 2 >= box.left && centre.x + code.w / 2 <= box.right) return "centre";
  return "hidden";
}
