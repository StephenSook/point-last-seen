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

/** WCAG contrast ratio of two #RRGGBB colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Map ink from the 22.1 tokens. Edges: a 3 px bg-0 casing under a 1 px fg-4 line, so
 * a boundary reads on dark and light steps alike. Dots: fg-2 with a bg-0 ring, so each
 * centre dot is 3:1 or more against every probability step.
 */
export const MAP_INK = { edgeCasing: "#110F0D", edgeLine: "#898583", dot: "#D7D3D0", dotRing: "#110F0D" } as const;

export type CentreCollection = {
  type: "FeatureCollection";
  features: { type: "Feature"; id: number; geometry: { type: "Point"; coordinates: [number, number] }; properties: { segmentId: string; r: number } }[];
};

/** The second signal: a dot at each segment centre, radius 3 + 11 x sqrt(poa / maxPoa) px (3 to 14 px). */
export function centreFeatures(segments: readonly MapSegment[], poa: Readonly<Record<string, number>>): CentreCollection {
  const maxPoa = Math.max(0, ...segments.map((s) => poa[s.segmentId] ?? 0));
  return {
    type: "FeatureCollection",
    features: segments.map((s, i) => {
      const p = poa[s.segmentId] ?? 0;
      const r = maxPoa > 0 && p > 0 ? 3 + 11 * Math.sqrt(p / maxPoa) : 3;
      return { type: "Feature", id: i, geometry: { type: "Point", coordinates: [s.centroid.lon, s.centroid.lat] }, properties: { segmentId: s.segmentId, r } };
    }),
  };
}
