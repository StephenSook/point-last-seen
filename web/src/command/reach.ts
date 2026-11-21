// The line under the POA ranking: how far the search rings reach (the outer ring of the engine's parameters) and
// how big the drill area is (its segments' outer bounds), so "Beyond the drill area" reads as the rings running past
// the area's edge, not as the map missing the person. Both numbers are computed; neither is typed.

type Polygonal = { geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] } };

const KM_PER_DEG_LAT = 111.32;

/** The area's east-west and north-south size in km, from every segment's outer ring; null with no segments. */
export function areaKm(segments: readonly Polygonal[]): [number, number] | null {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const seg of segments) {
    const outers = seg.geometry.type === "Polygon" ? [seg.geometry.coordinates[0] ?? []] : seg.geometry.coordinates.map((p) => p[0] ?? []);
    for (const [lon, lat] of outers.flat()) {
      w = Math.min(w, lon!);
      e = Math.max(e, lon!);
      s = Math.min(s, lat!);
      n = Math.max(n, lat!);
    }
  }
  if (!Number.isFinite(w) || !Number.isFinite(s)) return null;
  const midLat = ((s + n) / 2) * (Math.PI / 180);
  return [(e - w) * KM_PER_DEG_LAT * Math.cos(midLat), (n - s) * KM_PER_DEG_LAT];
}

/** "The search rings reach 12.8 km; this drill area covers about 1.0 by 1.6 km.", or null without rings or segments. */
export function reachLine(ringsKm: readonly number[], segments: readonly Polygonal[]): string | null {
  const reach = ringsKm.length > 0 ? Math.max(...ringsKm) : null;
  const size = areaKm(segments);
  if (reach === null || size === null) return null;
  return `The search rings reach ${reach.toFixed(1)} km; this drill area covers about ${size[0].toFixed(1)} by ${size[1].toFixed(1)} km.`;
}
