// Dev-server-only harness (web/harness/beat.html): plays the REPORT beat on a
// synthetic change and records, on <body>, which steps finished and how long it took.

import { createRoot } from "react-dom/client";
import type { ChangeResult } from "../command/changeModel";
import { motionScope, playReportBeat } from "../motion/engine";
import { reportBeatPlan } from "../motion/plan";

const CHANGE: ChangeResult = {
  changed: [
    { segmentId: "CD", fromPct: 2, toPct: 17, deltaPts: 15 },
    { segmentId: "AB", fromPct: 15, toPct: 12, deltaPts: -3 },
    { segmentId: "AA", fromPct: 11, toPct: 10, deltaPts: -1 },
  ],
  banner: "synthetic",
  announce: "synthetic",
};
const DIST = { CD: 0, AB: 450, AA: 620 };

let reduced = false;
motionScope((r) => {
  reduced = r;
  document.body.dataset["reduced"] = String(r);
});

function play() {
  const finished = new Set<string>();
  const start = performance.now();
  document.body.dataset["beat"] = "playing";
  playReportBeat(reportBeatPlan(CHANGE, DIST, reduced), {
    progress: (id, seg, t) => {
      if (t >= 1) finished.add(seg ? `${id}:${seg}` : id);
    },
    done: () => {
      document.body.dataset["steps"] = [...finished].sort().join(" ");
      document.body.dataset["ms"] = String(Math.round(performance.now() - start));
      document.body.dataset["beat"] = "done";
    },
  });
}

createRoot(document.getElementById("root")!).render(
  <main style={{ padding: 16 }}>
    <p>Synthetic beat, not drill data.</p>
    <button type="button" onClick={play}>Play</button>
  </main>,
);
