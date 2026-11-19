import { createRoot } from "react-dom/client";
import { ExtrasDock } from "../ExtrasDock";
import { viewState, type EventDoc, type PostState } from "../hostApp";
import { fromLive } from "../replay/replayData";
import { harnessIncident } from "../testdata/replayIncident";

// Made-up harness data for the replay e2e. Dev server only; never in the production build.
// ?pending=1 adds a command write still on its way to the server; ?reports=none keeps the built prior and drops every
// report and plan, as a new practice search has.
const params = new URLSearchParams(location.search);
const incident = harnessIncident({ pending: params.get("pending") === "1" });
const empty = params.get("reports") === "none";
const { view } = incident;
const events = empty ? [] : incident.events;
const plans = empty ? [] : incident.plans;
const state: PostState = { view, events, plans, profile: null, denied: false, offline: false };

// The live header computes the map exactly as the command post does.
const live = fromLive(view, events, plans)!;
const vs = viewState(live.prior, events as unknown as EventDoc[], live.priorInputEventIds, live.params, live.priorVersion);

const root = document.getElementById("root");
if (!root) throw new Error("Missing harness root");
createRoot(root).render(
  <main>
    <header className="post-head">
      <span className="drill">{view.incident?.drillLabel ?? "Training drill. Nobody is missing."}</span>
      <span>Made-up harness data</span>
      <span>Live match code <span className="num" data-testid="live-code">{vs.code}</span></span>
      <ExtrasDock incidentId="replay-harness" state={state} vs={vs} map={null} />
    </header>
  </main>,
);
