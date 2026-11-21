// The outline the replay draws around the segments the latest report changed: a line, so a person who cannot tell
// the colour still sees it, in change-cyan, the product's one colour for "moved by the last report" (the command
// post's change chips use it too).

import { COMMAND, type MapSegment } from "../hostApp";
import type { ExtrasMapLike } from "../types";

const SRC = "extras-changed";
const LAYER = "extras-changed-line";
const EMPTY = { type: "FeatureCollection", features: [] };

/** The outline of each changed segment, as one GeoJSON collection; an id with no segment is left out. */
export function outlineCollection(segments: readonly MapSegment[], ids: readonly string[]): unknown {
  const wanted = new Set(ids);
  return {
    type: "FeatureCollection",
    features: segments
      .filter((s) => wanted.has(s.segmentId))
      .map((s) => ({ type: "Feature", geometry: s.geometry, properties: { segmentId: s.segmentId } })),
  };
}

/** Adds the outline's source and line layer once; `remove` takes both away again. */
export function attachOutline(map: ExtrasMapLike): { set(c: unknown): void; remove(): void } {
  if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: EMPTY });
  if (!map.getLayer(LAYER)) {
    map.addLayer({ id: LAYER, type: "line", source: SRC, paint: { "line-color": COMMAND.changeCyan, "line-width": 3 } });
  }
  return {
    set(c) {
      (map.getSource(SRC) as { setData?: (d: unknown) => void } | undefined)?.setData?.(c);
    },
    remove() {
      if (map.getLayer(LAYER)) map.removeLayer(LAYER);
      if (map.getSource(SRC)) map.removeSource(SRC);
    },
  };
}
