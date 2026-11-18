import type { Feature, LineString, Polygon } from "geojson";

const M_PER_DEG = (6371008.8 * Math.PI) / 180;
export const ORIGIN = { lat: 33.7, lon: -84.3 };
const toLat = (m: number) => ORIGIN.lat + m / M_PER_DEG;
const toLon = (m: number) => ORIGIN.lon + m / (M_PER_DEG * Math.cos((ORIGIN.lat * Math.PI) / 180));

/** A point `x` m east and `y` m north of the origin, as [lon, lat]. */
export const at = (x: number, y: number): [number, number] => [toLon(x), toLat(y)];

/** A square site with its south-west corner at the origin. */
export function squareSite(sizeM: number): Feature<Polygon> {
  return { type: "Feature", properties: {},
    geometry: { type: "Polygon", coordinates: [[at(0, 0), at(sizeM, 0), at(sizeM, sizeM), at(0, sizeM), at(0, 0)]] } };
}

export function line(cls: string, pts: [number, number][]): Feature<LineString> {
  return { type: "Feature", properties: { class: cls }, geometry: { type: "LineString", coordinates: pts.map(([x, y]) => at(x, y)) } };
}
