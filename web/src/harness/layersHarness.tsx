// Dev-server-only harness (web/harness/layers.html): the prior layer switches with a
// rebuild that never reaches a server. Synthetic settings, no Firebase.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LayerSwitches } from "../command/LayerSwitches";
import "../theme/fonts.css";
import "../theme/base.css";

function Harness() {
  const [applied, setApplied] = useState("");
  // "Server acknowledges" settles the write; until then it is queued, as offline.
  const [settle, setSettle] = useState<(() => void) | null>(null);
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic settings, not drill data.</p>
      <LayerSwitches
        layers={{ linear: true, wedge: false }}
        terrain="temperate_flat"
        hasBearing={false}
        vehicleInvolved
        model={new URLSearchParams(location.search).get("model") === "walkers" ? "walkers" : "rings"}
        onApply={(layers, terrain) => {
          setApplied(`${JSON.stringify(layers)} ${terrain}`);
          return { version: 5, ack: new Promise<void>((resolve) => setSettle(() => resolve)) };
        }}
      />
      <pre data-testid="applied">{applied}</pre>
      <button type="button" onClick={() => settle?.()}>
        Server acknowledges
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
