// Dev-server-only harness (web/harness/prior-switch.html): the Walkers / Rings switch with
// a run that takes 50 ms and reports 10,000 walkers in 1,840 ms. ?graph=absent has no graph.
// ?race=1: the first apply returns v6 at once and its write is refused on "Refuse the first write";
// the second apply's run ends only on "Second run finishes", then returns v7, acknowledged.

import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { PriorSwitch } from "../command/PriorSwitch";
import "../theme/fonts.css";
import "../theme/base.css";

const q = new URLSearchParams(location.search);
const graph = q.get("graph") === "absent" ? "absent" : "ok";
const race = q.get("race") === "1";
const refused = () => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });

function Harness() {
  const [model, setModel] = useState<"rings" | "walkers">("rings");
  const [asked, setAsked] = useState("");
  const applies = useRef(0);
  const refuseFirst = useRef<(() => void) | null>(null);
  const finishSecond = useRef<(() => void) | null>(null);
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic settings, not drill data.</p>
      <PriorSwitch
        model={model}
        graph={graph}
        hasPlaces
        onApply={async (choice) => {
          setAsked(JSON.stringify(choice));
          if (race) {
            const n = ++applies.current;
            if (n === 1) {
              setModel(choice.model);
              const ack = new Promise<void>((_, reject) => (refuseFirst.current = () => reject(refused())));
              return { version: 6, ack, run: null };
            }
            await new Promise<void>((resolve) => (finishSecond.current = resolve));
            setModel(choice.model);
            return { version: 7, ack: Promise.resolve(), run: { n: 10_000, elapsedMs: 1840 } };
          }
          await new Promise((r) => setTimeout(r, 50));
          setModel(choice.model);
          return { version: 6, ack: new Promise<void>(() => {}), run: choice.model === "walkers" ? { n: 10_000, elapsedMs: 1840 } : null };
        }}
      />
      <pre data-testid="asked">{asked}</pre>
      {race && (
        <>
          <button type="button" onClick={() => refuseFirst.current?.()}>Refuse the first write</button>
          <button type="button" onClick={() => finishSecond.current?.()}>Second run finishes</button>
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
