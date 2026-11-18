// Dev-server-only harness (web/harness/layers.html): the prior layer switches with a
// rebuild that never reaches a server. Synthetic settings, no Firebase.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LayerSwitches } from "../command/LayerSwitches";
import "../theme/fonts.css";
import "../theme/base.css";

function Harness() {
  const [applied, setApplied] = useState("");
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic settings, not drill data.</p>
      <LayerSwitches
        layers={{ linear: true, wedge: false }}
        terrain="temperate_flat"
        priorVersion={4}
        hasBearing={false}
        vehicleInvolved
        model={new URLSearchParams(location.search).get("model") === "walkers" ? "walkers" : "rings"}
        onApply={(layers, terrain) => {
          setApplied(`${JSON.stringify(layers)} ${terrain}`);
          return { version: 5, ack: new Promise<void>(() => {}) };
        }}
      />
      <pre data-testid="applied">{applied}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
