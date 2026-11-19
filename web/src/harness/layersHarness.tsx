// Dev-server-only harness (web/harness/layers.html): the prior layer switches with a
// rebuild that never reaches a server. Synthetic settings, no Firebase.

import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { LayerSwitches } from "../command/LayerSwitches";
import "../theme/fonts.css";
import "../theme/base.css";
import { PRIOR_SUPERSEDED } from "../prior/refusal";

function Harness() {
  const [applied, setApplied] = useState("");
  // Each rebuild is a queued write, as offline: "Server acknowledges" settles the newest one,
  // "Server refuses the first" rejects the first one still waiting.
  const writes = useRef<{ resolve: () => void; reject: (e: unknown) => void }[]>([]);
  const next = useRef(4);
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
          next.current += 1;
          return { version: next.current, ack: new Promise<void>((resolve, reject) => writes.current.push({ resolve, reject })) };
        }}
      />
      <pre data-testid="applied">{applied}</pre>
      <button type="button" onClick={() => writes.current.at(-1)?.resolve()}>
        Server acknowledges
      </button>
      <button type="button" onClick={() => writes.current.shift()?.reject(Object.assign(new Error("x"), { code: "permission-denied" }))}>
        Server refuses the first
      </button>
      {/* What writePrior reports after the server confirms another seat saved a newer prior. */}
      <button type="button" onClick={() => writes.current.shift()?.reject(Object.assign(new Error("x"), { code: PRIOR_SUPERSEDED }))}>
        Another seat saved first
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
