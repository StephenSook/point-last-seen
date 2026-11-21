// Dev-server-only harness (web/harness/end-search.html; never in the production build). It renders the End this
// search control with a stand-in write: ?fail=1 makes the write fail, ?slow=1 holds it until "Server has it".
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { EndSearch } from "../command/EndSearch";
import type { EndReason } from "../data/endSearch";
import "../theme/fonts.css";
import "../theme/base.css";

const q = new URLSearchParams(location.search);

function Harness() {
  const [ended, setEnded] = useState<EndReason | null>(null);
  const [held, setHeld] = useState<(() => void) | null>(null);
  return (
    <div style={{ padding: 16, background: "var(--bg-1)", maxWidth: 340 }}>
      <p className="small">Synthetic control, not drill data.</p>
      <EndSearch
        onEnd={(reason) =>
          new Promise<void>((resolve, reject) => {
            if (q.get("fail") === "1") return reject(new Error("refused"));
            const done = () => {
              setEnded(reason);
              resolve();
            };
            if (q.get("slow") === "1") setHeld(() => done);
            else done();
          })
        }
      />
      {held && (
        <button type="button" onClick={() => { held(); setHeld(null); }}>
          Server has it
        </button>
      )}
      <p data-testid="ended">{ended ?? "open"}</p>
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Harness />);
