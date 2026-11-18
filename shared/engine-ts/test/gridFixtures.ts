import type { Grid, GridSegment, LatLon } from "../src/types";

// Degrees per metre on the sphere turf uses (earth radius 6371008.8 m).
const M_PER_DEG = (6371008.8 * Math.PI) / 180;
export const ipp: LatLon = { lat: 33.7, lon: -84.3 };

/** A square cell of `size` metres centred `dx` m east and `dy` m north of the point last seen. */
export function cell(segmentId: string, dx: number, dy: number, size: number, nearFrac = 0): GridSegment {
  const toLat = (m: number) => ipp.lat + m / M_PER_DEG;
  const toLon = (m: number) => ipp.lon + m / (M_PER_DEG * Math.cos((ipp.lat * Math.PI) / 180));
  const h = size / 2;
  const ring: [number, number][] = [
    [toLon(dx - h), toLat(dy - h)], [toLon(dx + h), toLat(dy - h)], [toLon(dx + h), toLat(dy + h)],
    [toLon(dx - h), toLat(dy + h)], [toLon(dx - h), toLat(dy - h)],
  ];
  return {
    segmentId, areaM2: size * size, centroid: { lat: toLat(dy), lon: toLon(dx) },
    geometry: { type: "Polygon", coordinates: [ring] }, neighbors: [], downstream: [], upstream: [], nearFrac,
    featureClasses: nearFrac > 0 ? ["trail"] : [],
  };
}

export function grid(segments: GridSegment[]): Grid {
  return { gridId: "test", cellM: 125, bbox: [0, 0, 0, 0], segments, attribution: "test fixture" };
}
