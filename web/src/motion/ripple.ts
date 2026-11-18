// The probability ripple: on the first draw of a prior, each dot starts growing
// after a delay proportional to its distance (in cells) from the point last seen.

export function rippleDelayMs(cell: { col: number; row: number }, origin: { col: number; row: number }, stepMs = 25): number {
  return Math.round(Math.hypot(cell.col - origin.col, cell.row - origin.row) * stepMs);
}
