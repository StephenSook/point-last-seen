import { createRoot } from "react-dom/client";
import { JudgeExtras } from "../JudgeExtras";
import { formatPct, viewState, type EventDoc, type PublishedRun } from "../laneC";
import { fromLive } from "../replay/replayData";
import { harnessIncident, harnessRun } from "../testdata/replayIncident";
import { parseScam, type loadScam } from "../scam/scamModel";
import { scamFixture } from "../testdata/scam";

// Made-up harness data for the judge replay e2e. Dev server only; never in the production build.
// ?run=ok (default) passes the run file, ?run=broken one with a report missing its arrival time, ?run=thin one with
// only two positioned reports (below the cube's gate), ?run=weights one whose prior weights differ from the incident's
// (same reports, so the same match code, but a different map), ?run=none nothing.
const which = new URLSearchParams(location.search).get("run") ?? "ok";
const good = harnessRun();
const broken = { ...good, events: good.events.map((e, i) => (i === 0 ? { ...e, serverTimeMs: undefined } : e)) };
const thin = { ...good, events: good.events.map((e) => (e.type === "sighting" ? e : { ...e, position: null })) };
const weights = { ...good, segments: good.segments.map((s) => (s.segmentId === "AA" ? { ...s, priorPoa: 0.35 } : s.segmentId === "BB" ? { ...s, priorPoa: 0.1 } : s)) };
const run = (which === "none" ? null : which === "broken" ? broken : which === "thin" ? thin : which === "weights" ? weights : good) as unknown as PublishedRun | null;

// ?scam=ok passes the fixture camera check, ?scam=fail one below its gate, ?scam=bad one whose stored verdict lies,
// ?scam=none (default) no file. The panel reads it through the same parser the real file goes through.
const scamWhich = new URLSearchParams(location.search).get("scam") ?? "none";
function scamFile(): unknown {
  const f = scamFixture();
  if (scamWhich === "fail") return { ...f, passed: 4, clips: f.clips.map((c, i) => (i === 0 ? { ...c, nightColorsUnknown: false, pass: false, missReasons: ["night_color"] } : c)) };
  if (scamWhich === "bad") return { ...f, clips: f.clips.map((c, i) => (i === 1 ? { ...c, pass: true, missReasons: [] } : c)), passed: 6 };
  return f;
}
const scamLoad: typeof loadScam = async () => {
  if (scamWhich === "none") return { state: "none" };
  const parsed = parseScam(scamFile());
  return parsed.ok ? { state: "result", result: parsed.result } : { state: "invalid", reason: parsed.reason };
};

// The same incident's live map, as the command post computes it: the run's last frame must match it.
const { view, events, plans } = harnessIncident();
const live = fromLive(view, events, plans)!;
const liveView = viewState(live.prior, events as unknown as EventDoc[], live.priorInputEventIds, live.params, live.priorVersion);
const code = liveView.code;
// The percent plates the live map draws for this incident, for the replay's last frame to be checked against.
const expectedPlates = JSON.stringify(live.segments.map((s) => formatPct(liveView.result.poa[s.segmentId] ?? 0)).sort());

const root = document.getElementById("root");
if (!root) throw new Error("Missing harness root");
createRoot(root).render(
  <main className="judge">
    <p className="drill">Training drill. Nobody is missing.</p>
    <p>Made-up harness data. The incident's live match code: <span className="num" data-testid="expected-code" data-expected-plates={expectedPlates}>{code}</span></p>
    <JudgeExtras run={run} scamLoad={scamLoad} />
  </main>,
);
