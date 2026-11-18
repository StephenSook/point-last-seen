import { createRoot } from "react-dom/client";
import { JudgeExtras } from "../JudgeExtras";
import { viewState, type EventDoc, type PublishedRun } from "../laneC";
import { fromLive } from "../replay/replayData";
import { harnessIncident, harnessRun } from "../testdata/replayIncident";

// Made-up harness data for the judge replay e2e. Dev server only; never in the production build.
// ?run=ok (default) passes the run file, ?run=broken one with a report missing its arrival time, ?run=none nothing.
const which = new URLSearchParams(location.search).get("run") ?? "ok";
const good = harnessRun();
const broken = { ...good, events: good.events.map((e, i) => (i === 0 ? { ...e, serverTimeMs: undefined } : e)) };
const run = (which === "none" ? null : which === "broken" ? broken : good) as unknown as PublishedRun | null;

// The same incident's live map, as the command post computes it: the run's last frame must match it.
const { view, events, plans } = harnessIncident();
const live = fromLive(view, events, plans)!;
const code = viewState(live.prior, events as unknown as EventDoc[], live.priorInputEventIds, live.params, live.priorVersion).code;

const root = document.getElementById("root");
if (!root) throw new Error("Missing harness root");
createRoot(root).render(
  <main className="judge">
    <p className="drill">Training drill. Nobody is missing.</p>
    <p>Made-up harness data. The incident's live match code: <span className="num" data-testid="expected-code">{code}</span></p>
    <JudgeExtras run={run} />
  </main>,
);
