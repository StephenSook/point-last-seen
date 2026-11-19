// A cell's code and percent need about 56 px across to be read. When the typical cell is narrower on screen
// (a whole park on a phone, or zoomed out), only the most likely cells keep their labels; zooming in brings the
// rest back. The labels stay in the page either way, so nothing a check reads disappears.

/** How many of the most likely cells keep their labels on a crowded map. */
export const KEY_LABELS = 8;
const MIN_CELL_PX = 56;

/** True when the median cell width on screen is under the width a code and a percent need. */
export function labelsDense(cellWidthsPx: readonly number[]): boolean {
  if (cellWidthsPx.length === 0) return false;
  const sorted = [...cellWidthsPx].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]! < MIN_CELL_PX;
}

/** The `k` cells with the highest POA (ties by id), which keep their labels when the map is crowded. */
export function keyIds(poa: Readonly<Record<string, number>>, ids: readonly string[], k: number = KEY_LABELS): Set<string> {
  const ranked = [...ids].sort((a, b) => (poa[b] ?? 0) - (poa[a] ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
  return new Set(ranked.slice(0, k));
}
