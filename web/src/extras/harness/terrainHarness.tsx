import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ExtrasDock } from "../ExtrasDock";
import { DEFAULT_PARAMS, MapView, viewState, type MapLibreMap, type PostState, type SegmentDoc } from "../hostApp";
import { drillView } from "../testdata/fixtures";

// Made-up harness data for the terrain e2e. Dev server only; never in the production build.
const D = 0.004;
const LAT = 33.78;
const LON = -84.37;
function cell(segmentId: string, col: number, row: number): SegmentDoc {
  const w = LON + col * D;
  const s = LAT + row * D;
  return {
    segmentId, priorPoa: 0.1, areaM2: 160_000, neighbors: [], upstream: [], downstream: [],
    centroid: { lon: w + D / 2, lat: s + D / 2 },
    geometry: { type: "Polygon", coordinates: [[[w, s], [w + D, s], [w + D, s + D], [w, s + D], [w, s]]] },
  };
}
const segments = ["A", "B", "C"].flatMap((r, row) => [0, 1, 2].map((col) => cell(`${r}${col}`, col, row)));
const meanM: Record<string, number> = { A0: 92, A1: 96, A2: 99, B0: 101, B1: 100, B2: 104, C0: 108, C1: 102, C2: 97 };
const elevation = {
  gridId: "fixture-grid", gridSha256: "0".repeat(64), source: "FIXTURE", license: "FIXTURE", credit: "U.S. Geological Survey",
  fetchedAt: "2026-11-18", samplesPerCell: 5, units: "metres",
  cells: Object.fromEntries(Object.entries(meanM).map(([id, m]) => [id, { meanM: m, minM: m - 1, maxM: m + 1, n: 5 }])),
};
const params = new URLSearchParams(location.search);
const loadElevation = async () => (params.get("elev") === "none" ? null : elevation);

const view = {
  ...drillView,
  incident: { ...drillView.incident!, gridId: "fixture-grid", ipp: { lat: LAT + 1.5 * D, lon: LON + 1.5 * D } },
  segments,
  rowPrior: 0.1,
};
const state: PostState = { view, events: [], plans: [], profile: null, denied: false, offline: false };
const prior = [...segments.map((s) => ({ segmentId: s.segmentId, priorPoa: s.priorPoa })), { segmentId: "ROW", priorPoa: 0.1 }];
const vs = viewState(prior, [], [], DEFAULT_PARAMS, 1);

function Harness() {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  return (
    <main>
      <header className="post-head">
        <span className="drill">Training drill. Nobody is missing.</span>
        <span>Made-up harness data</span>
        <span>Match code <span className="num" data-testid="live-code">{vs.code}</span></span>
        <ExtrasDock incidentId="terrain-harness" state={state} vs={vs} map={map} loadElevation={loadElevation} />
      </header>
      <div>
        <MapView segments={segments} poa={vs.result.poa} onReady={(m) => {
          setMap(m);
          Object.assign(window, { harnessMap: m });
        }} />
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing harness root");
createRoot(root).render(<Harness />);
