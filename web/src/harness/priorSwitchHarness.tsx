// Dev-server-only harness (web/harness/prior-switch.html): the Walkers / Rings switch with
// a run that takes 50 ms and reports 10,000 walkers in 1,840 ms. ?graph=absent has no graph.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PriorSwitch } from "../command/PriorSwitch";
import "../theme/fonts.css";
import "../theme/base.css";

const graph = new URLSearchParams(location.search).get("graph") === "absent" ? "absent" : "ok";

function Harness() {
  const [model, setModel] = useState<"rings" | "walkers">("rings");
  const [asked, setAsked] = useState("");
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic settings, not drill data.</p>
      <PriorSwitch
        model={model}
        graph={graph}
        hasPlaces
        onApply={async (choice) => {
          setAsked(JSON.stringify(choice));
          await new Promise((r) => setTimeout(r, 50));
          setModel(choice.model);
          return { version: 6, ack: new Promise<void>(() => {}), run: choice.model === "walkers" ? { n: 10_000, elapsedMs: 1840 } : null };
        }}
      />
      <pre data-testid="asked">{asked}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
