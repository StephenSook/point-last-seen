// Probability drawn by lightness of one warm hue, with the printed number as
// the third signal. Never by red, never by hue.

export const POA_RAMP = ["#342D23", "#534229", "#765729", "#9A6E2A", "#BD8630", "#DEA143", "#FCC270", "#FFEAC2"] as const;

export function poaClass8(poa: number, maxPoa: number): number {
  if (!(maxPoa > 0) || !(poa > 0)) return 0;
  return Math.min(7, Math.floor((poa / maxPoa) * 8));
}

export function formatPct(poa: number): string {
  if (!(poa > 0)) return "0%";
  if (poa < 0.0005) return "<0.1%";
  return `${(poa * 100).toFixed(1)}%`;
}

export type MapSegment = {
  segmentId: string;
  geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };
  centroid: { lat: number; lon: number };
};

export type SegmentProps = { segmentId: string; poa: number; cls: number; label: string };

export type SegmentCollection = {
  type: "FeatureCollection";
  features: { type: "Feature"; id: number; geometry: MapSegment["geometry"]; properties: SegmentProps }[];
};

/** Segments as GeoJSON for the fill layer. ROW is shown in the rank list, not on the map. */
export function segmentFeatures(segments: readonly MapSegment[], poa: Readonly<Record<string, number>>): SegmentCollection {
  const inGrid = segments.map((s) => poa[s.segmentId] ?? 0);
  const maxPoa = Math.max(0, ...inGrid);
  return {
    type: "FeatureCollection",
    features: segments.map((s, i) => {
      const p = poa[s.segmentId];
      return {
        type: "Feature",
        id: i,
        geometry: s.geometry,
        properties: { segmentId: s.segmentId, poa: p ?? 0, cls: poaClass8(p ?? 0, maxPoa), label: p === undefined ? "" : formatPct(p) },
      };
    }),
  };
}
