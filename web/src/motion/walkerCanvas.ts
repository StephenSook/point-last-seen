// Walker positions as plain arithmetic: each track is a polyline walked at even
// speed from its release time over its duration. The canvas draws these points;
// there is no animation object per walker.

export type Track = { pts: [number, number][]; releaseMs: number; durationMs: number };

/** Walkers leave in cohorts: 25 at a time, 100 ms apart. */
export function cohortReleaseMs(index: number, cohortSize = 25, stepMs = 100): number {
  return Math.floor(index / cohortSize) * stepMs;
}

function pointAt(pts: [number, number][], frac: number): [number, number] {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]));
  const total = lens.reduce((a, b) => a + b, 0);
  let left = frac * total;
  for (let i = 0; i < lens.length; i++) {
    const len = lens[i]!;
    if (left <= len || i === lens.length - 1) {
      const t = len > 0 ? Math.min(1, left / len) : 1;
      const [a, b] = [pts[i]!, pts[i + 1]!];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= len;
  }
  return pts[0]!;
}

export function walkerFrame(tracks: readonly Track[], tMs: number): { x: number; y: number; done: boolean }[] {
  return tracks.map((t) => {
    const frac = t.durationMs > 0 ? Math.max(0, Math.min(1, (tMs - t.releaseMs) / t.durationMs)) : 1;
    const [x, y] = t.pts.length > 1 ? pointAt(t.pts, frac) : (t.pts[0] ?? [0, 0]);
    return { x, y, done: frac >= 1 };
  });
}
