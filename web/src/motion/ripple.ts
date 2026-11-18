// The probability ripple: on the first draw of a prior, each dot starts growing
// after a delay proportional to its distance (in cells) from the point last seen.

export function rippleDelayMs(cell: { col: number; row: number }, origin: { col: number; row: number }, stepMs = 25): number {
  return Math.round(Math.hypot(cell.col - origin.col, cell.row - origin.row) * stepMs);
}

/** Ripple delays for points, from their offset to the origin in 125 m cells (a local flat approximation). */
export function rippleDelays(points: readonly { lat: number; lon: number }[], origin: { lat: number; lon: number }, cellM = 125, stepMs = 25): number[] {
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return points.map((p) =>
    rippleDelayMs({ col: ((p.lon - origin.lon) * mPerDegLon) / cellM, row: ((p.lat - origin.lat) * mPerDegLat) / cellM }, { col: 0, row: 0 }, stepMs),
  );
}
