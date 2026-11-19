// The terrain display layer: a small down chevron on each segment lower than the start and an up chevron on each
// higher one, in neutral ink, set off the centre so it never covers the percent plate. No fill, no hue, no lightness
// change: probability keeps its signals to itself. The glyphs are drawn on a canvas, so no sprite host is needed.

import { COMMAND, type MapSegment } from "../laneC";
import type { ExtrasMapLike } from "../types";
import type { TerrainClass } from "./classify";

const SRC = "extras-terrain";
const LAYER = "extras-terrain";
const SIZE = 18;

/** A chevron on a dark casing, pointing down for lower ground and up for higher. */
export function canvasGlyph(kind: "lower" | "higher"): ImageData {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext("2d")!;
  const y0 = kind === "lower" ? 6 : 12;
  const y1 = kind === "lower" ? 12 : 6;
  for (const [color, width] of [[COMMAND.bg0, 5], [COMMAND.fg3, 2.5]] as const) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(4, y0);
    g.lineTo(9, y1);
    g.lineTo(14, y0);
    g.stroke();
  }
  return g.getImageData(0, 0, SIZE, SIZE);
}

export function attachTerrain(
  map: ExtrasMapLike,
  makeGlyph: (kind: "lower" | "higher") => ImageData = canvasGlyph,
): { set(classes: Record<string, TerrainClass>, segments: readonly MapSegment[]): void; remove(): void } {
  for (const kind of ["lower", "higher"] as const) {
    if (!map.hasImage(`${SRC}-${kind}`)) map.addImage(`${SRC}-${kind}`, makeGlyph(kind));
  }
  if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  if (!map.getLayer(LAYER)) {
    map.addLayer({
      id: LAYER,
      type: "symbol",
      source: SRC,
      layout: {
        "icon-image": ["concat", `${SRC}-`, ["get", "cls"]],
        // Up and to the right of the centre dot; the plate hangs below it.
        "icon-offset": [22, -16],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }
  return {
    set(classes, segments) {
      const features = segments.flatMap((s) => {
        const cls = classes[s.segmentId];
        return cls === "lower" || cls === "higher"
          ? [{ type: "Feature", geometry: { type: "Point", coordinates: [s.centroid.lon, s.centroid.lat] }, properties: { segmentId: s.segmentId, cls } }]
          : [];
      });
      (map.getSource(SRC) as { setData?: (d: unknown) => void } | undefined)?.setData?.({ type: "FeatureCollection", features });
    },
    remove() {
      if (map.getLayer(LAYER)) map.removeLayer(LAYER);
      if (map.getSource(SRC)) map.removeSource(SRC);
    },
  };
}
