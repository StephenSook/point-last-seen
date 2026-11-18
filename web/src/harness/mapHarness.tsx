// Dev-server-only harness (web/harness/map.html; never in the production build,
// whose only entry is index.html). It draws MapView over a small synthetic grid so
// map visuals can be checked by screenshot. The data is made up and labelled so.

import { createRoot } from "react-dom/client";
import { MapView } from "../map/MapView";
import type { MapSegment } from "../map/poaStyle";
import "../theme/fonts.css";
import "../theme/base.css";

const COLS = 6;
const ROWS = 4;
const D = 0.002;

export const HARNESS_SEGMENTS: MapSegment[] = Array.from({ length: COLS * ROWS }, (_, i) => {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  const [w, n] = [c * D, -r * D];
  return {
    segmentId: String.fromCharCode(65 + r) + String.fromCharCode(65 + c),
    geometry: { type: "Polygon", coordinates: [[[w, n], [w + D, n], [w + D, n - D], [w, n - D], [w, n]]] },
    centroid: { lat: n - D / 2, lon: w + D / 2 },
  };
});

// Probability falls off with distance from cell AB and sums to 1; one cell is left out of the map's POA.
const RAW = HARNESS_SEGMENTS.filter((s) => s.segmentId !== "DF").map((s) => {
  const [r, c] = [s.segmentId.charCodeAt(0) - 65, s.segmentId.charCodeAt(1) - 65];
  return [s.segmentId, Math.exp(-((r - 0) ** 2 + (c - 1) ** 2) / 4)] as const;
});
const TOTAL = RAW.reduce((a, [, v]) => a + v, 0);
export const HARNESS_POA: Record<string, number> = Object.fromEntries(RAW.map(([id, v]) => [id, v / TOTAL]));

function Harness() {
  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", gridTemplateRows: "auto 1fr" }}>
      <p className="drill" style={{ margin: 0, padding: 8 }}>Synthetic test grid, not drill data.</p>
      <MapView segments={HARNESS_SEGMENTS} poa={HARNESS_POA} onReady={(m) => (document.body.dataset["mapReady"] = m ? "map" : "none")} />
    </div>
  );
}

if (document.title === "Map harness") createRoot(document.getElementById("root")!).render(<Harness />);
