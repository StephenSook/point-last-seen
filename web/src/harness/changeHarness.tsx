// Dev-server-only harness (web/harness/change.html): the map and the change banner
// for a synthetic report that moves probability toward cell CD. No Firebase.

import type { EventDoc } from "@pls/engine";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ChangeBeat } from "../command/ChangeBeat";
import { changeModel } from "../command/changeModel";
import { beatDistances } from "../map/geo";
import { MapView } from "../map/MapView";
import "../theme/fonts.css";
import "../theme/base.css";
import { HARNESS_POA, HARNESS_SEGMENTS } from "./mapHarness";

// After the synthetic report, CD gains 0.15 and the rest shrink in proportion.
const AFTER: Record<string, number> = Object.fromEntries(Object.entries(HARNESS_POA).map(([id, v]) => [id, id === "CD" ? v * 0.85 + 0.15 : v * 0.85]));
const CAUSE = { type: "clue", isTrainingInject: true, reading: { kind: "clue", item: "slipper", feature: "water", segmentIds: [] } } as unknown as EventDoc;
const CHANGE = changeModel(HARNESS_POA, AFTER, CAUSE);
const DIST = beatDistances(null, CHANGE.changed.map((c) => c.segmentId), HARNESS_SEGMENTS);

function Harness() {
  const [holding, setHolding] = useState(false);
  const [reports, setReports] = useState(1);
  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", gridTemplateColumns: "1fr 320px" }}>
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr" }}>
        <p className="drill" style={{ margin: 0, padding: 8 }}>Synthetic test grid, not drill data.</p>
        <MapView
          segments={HARNESS_SEGMENTS}
          poa={holding ? HARNESS_POA : AFTER}
          moved={holding ? undefined : CHANGE.changed}
          beat={{ key: String(reports), before: HARNESS_POA, change: CHANGE, distanceM: DIST }}
        />
      </div>
      <aside className="rail right">
        <ChangeBeat change={CHANGE} holding={holding} onHold={setHolding} />
        <button type="button" className="btn ghost" onClick={() => setReports((n) => n + 1)}>
          Report again
        </button>
      </aside>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
