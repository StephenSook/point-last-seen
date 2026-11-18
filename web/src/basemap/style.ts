// The basemap in instrument greys (22.1: everything grey except the active thing).
// Shapes (parks, water, buildings) sit under the probability fills; streets, paths
// and streams are thin fg-4 lines drawn over the fills, so probability sits on the
// ground a searcher walks while the fills keep their measured colours. No labels:
// they would need glyphs from a host, and the grid ids already name every place.

import type { LayerSpecification } from "maplibre-gl";
import { COMMAND } from "../theme/tokens";

const LINE_OPACITY = 0.6;
const GREEN_LANDUSE = ["park", "garden", "grass", "wood", "forest", "nature_reserve", "golf_course", "cemetery", "playground", "pitch"];

export function basemapLayers(source: string): { under: LayerSpecification[]; over: LayerSpecification[] } {
  const under: LayerSpecification[] = [
    { id: "bm-landuse", type: "fill", source, "source-layer": "landuse", filter: ["in", ["get", "kind"], ["literal", GREEN_LANDUSE]], paint: { "fill-color": COMMAND.bg1 } },
    { id: "bm-water", type: "fill", source, "source-layer": "water", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": COMMAND.bg3 } },
    { id: "bm-buildings", type: "fill", source, "source-layer": "buildings", paint: { "fill-color": COMMAND.bg2 } },
  ];
  const over: LayerSpecification[] = [
    {
      id: "bm-streams",
      type: "line",
      source,
      "source-layer": "water",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": COMMAND.fg4, "line-width": 1.4, "line-opacity": LINE_OPACITY },
    },
    {
      id: "bm-roads",
      type: "line",
      source,
      "source-layer": "roads",
      filter: ["!=", ["get", "kind"], "path"],
      paint: {
        "line-color": COMMAND.fg4,
        "line-width": ["match", ["get", "kind"], ["highway", "major_road"], 1.8, "medium_road", 1.4, 1],
        "line-opacity": LINE_OPACITY,
      },
    },
    {
      id: "bm-paths",
      type: "line",
      source,
      "source-layer": "roads",
      filter: ["==", ["get", "kind"], "path"],
      paint: { "line-color": COMMAND.fg4, "line-width": 1, "line-dasharray": [2, 1.5], "line-opacity": LINE_OPACITY },
    },
  ];
  return { under, over };
}
