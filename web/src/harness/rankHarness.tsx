// Dev-server-only harness (web/harness/rank.html): the POA rank list with a synthetic
// report that moves AC to the top. ?delay=<ms> sets the reorder delay; ?rows=N lists N made-up segments instead.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PoaRank } from "../command/PoaRank";
// The practice grid's bounds and the flat-terrain rings, as the command post would compute them.
const REACH = "The search rings reach 12.8 km; this drill area covers about 1.0 by 1.6 km.";
import "../theme/fonts.css";
import "../theme/base.css";

const BEFORE = [{ segmentId: "AA", poa: 0.3 }, { segmentId: "AB", poa: 0.25 }, { segmentId: "AC", poa: 0.12 }, { segmentId: "AD", poa: 0.08 }];
const AFTER = [{ segmentId: "AC", poa: 0.31 }, { segmentId: "AA", poa: 0.22 }, { segmentId: "AB", poa: 0.21 }, { segmentId: "AD", poa: 0.07 }];
const delay = Number(new URLSearchParams(location.search).get("delay") ?? "0");
const many = Number(new URLSearchParams(location.search).get("rows") ?? "0");
// N segments with falling POA, named S01, S02, ...
const MANY = Array.from({ length: many }, (_, i) => ({ segmentId: `S${String(i + 1).padStart(2, "0")}`, poa: (many - i) / (many * 40) }));

function Harness() {
  const [after, setAfter] = useState(false);
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic ranks, not drill data.</p>
      <button type="button" className="btn ghost" onClick={() => setAfter(true)}>
        Report
      </button>
      <PoaRank rows={many > 0 ? MANY : after ? AFTER : BEFORE} row={0.19} reorderDelayMs={delay} reach={REACH} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
