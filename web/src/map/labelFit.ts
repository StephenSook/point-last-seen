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

/** The space between a change chip and the dot or plate it sits beside. */
export const CHIP_GAP_PX = 4;

/** What a change chip may sit on: another cell's code, another cell's percent, or another chip. */
export type ChipObstacle = { box: Box; kind: "code" | "plate" | "chip" };

// What covering each costs: a code before a percent, and another chip only when nothing else is left.
const COVER_COST = { code: 1, plate: 10, chip: 100 } as const;

/**
 * Where a change chip ("+0.2 pts") sits, as its centre's offset from the cell's centre: above the dot, else right of
 * it, else left of it, else below the cell's own plate, whichever first covers no other label or chip on screen. When
 * every place covers something (a dense grid at this zoom), it takes the place that covers the least, and names what
 * it covers so the map hides those labels; those cells are still named in the ranked list. Decided again on every
 * camera move, after the plates and codes are placed.
 */
export function chipPlace(p: { chip: { w: number; h: number }; centre: { x: number; y: number }; dotR: number; ownPlateH: number; obstacles: readonly ChipObstacle[] }): { offset: [number, number]; covered: number[] } {
  const { chip, centre, dotR, ownPlateH, obstacles } = p;
  const candidates: [number, number][] = [
    [0, -(16 + chip.h / 2)],
    [dotR + CHIP_GAP_PX + chip.w / 2, 0],
    [-(dotR + CHIP_GAP_PX + chip.w / 2), 0],
    [0, (ownPlateH > 0 ? 16 + ownPlateH : dotR) + CHIP_GAP_PX + chip.h / 2],
  ];
  let best: { offset: [number, number]; covered: number[]; cost: number } | null = null;
  for (const offset of candidates) {
    const [dx, dy] = offset;
    const r = { left: centre.x + dx - chip.w / 2, top: centre.y + dy - chip.h / 2, right: centre.x + dx + chip.w / 2, bottom: centre.y + dy + chip.h / 2 };
    const covered = obstacles.flatMap((o, i) => (r.left < o.box.right && r.right > o.box.left && r.top < o.box.bottom && r.bottom > o.box.top ? [i] : []));
    const cost = covered.reduce((sum, i) => sum + COVER_COST[obstacles[i]!.kind], 0);
    if (best === null || cost < best.cost) best = { offset, covered, cost };
    if (cost === 0) break;
  }
  return { offset: best!.offset, covered: best!.covered };
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
