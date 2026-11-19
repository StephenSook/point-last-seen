import { createRoot } from "react-dom/client";
import { ExtrasDock } from "../ExtrasDock";
import { MapLibreMap, type PostState, type SegmentDoc, type ViewState } from "../hostApp";
import { DRILL_LABEL } from "../print/printModel";
import { drillView, planFixture } from "../testdata/fixtures";
import { kennesawPlan, kennesawView } from "../testdata/kennesaw";

function square(segmentId: string, lon: number, priorPoa: number): SegmentDoc {
  const lat = 34.1;
  return {
    segmentId, priorPoa, areaM2: 300_000, neighbors: [], upstream: [], downstream: [],
    centroid: { lon: lon + 0.003, lat: lat + 0.003 },
    geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + 0.006, lat], [lon + 0.006, lat + 0.006], [lon, lat + 0.006], [lon, lat]]] },
  };
}

const segments = [square("AA", -84.81, 0.3), square("BB", -84.804, 0.5)];
// ?long=1 gives every added team a task long enough to wrap on the sheet.
const longTask = new URLSearchParams(location.search).get("long") === "1"
  ? "Search BB from the trail to the creek, then sweep the east bank back to the parking area, calling at each junction."
  : "Search BB from the trail.";
const extraTeams = new URLSearchParams(location.search).get("teams") === "11"
  ? Array.from({ length: 9 }, (_, index) => ({ teamId: `team-${index + 3}`, name: `Team ${index + 3}` }))
  : [];
const plan = planFixture(5);
// ?site=kennesaw: the Kennesaw Mountain drill's teams (T1 to T3) and a made-up plan v1 over that grid's real segment
// ids, with no reports yet, as on drill morning.
const kennesaw = new URLSearchParams(location.search).get("site") === "kennesaw";
const harnessState: PostState = {
  view: { ...drillView, segments, teams: [...drillView.teams, ...extraTeams], rowPrior: 0.2 },
  // 14 sightings, command's confirmation of the first and a retraction of the last: 13 reports, 16 events.
  events: [
    ...Array.from({ length: 14 }, (_, index) => ({ eventId: `harness-${index}`, type: "sighting", role: "searcher", targetEventId: null, serverTimeMs: null, pendingWrite: false })),
    { eventId: "harness-confirm", type: "confirmation", role: "command", targetEventId: "harness-0", serverTimeMs: null, pendingWrite: false },
    { eventId: "harness-retract", type: "retraction", role: "command", targetEventId: "harness-13", serverTimeMs: null, pendingWrite: false },
  ],
  plans: [{ ...plan, assignments: [...plan.assignments, ...extraTeams.map(({ teamId }) => ({ teamId, segmentIds: ["BB"], taskText: longTask, reason: "" }))] }],
  profile: null,
  denied: false,
  offline: false,
};
const state: PostState = kennesaw
  ? { view: kennesawView, events: [], plans: [kennesawPlan], profile: null, denied: false, offline: false }
  : harnessState;
const vs: ViewState = {
  code: "K7Q4", hash: "a".repeat(64),
  result: {
    poa: { AA: 0.6, BB: 0.1, ROW: 0.3 }, remainingMass: { AA: 0.2, BB: 0.1, ROW: 0.2 },
    cumulativePod: { AA: 0.4, BB: 0, ROW: 0 }, appliedEventIds: [], ignoredEventIds: [],
  },
  rank: [
    { segmentId: "AA", rank: 1, poa: 0.6, priorPoa: 0.3, deltaPoa: 0.3 },
    { segmentId: "BB", rank: 2, poa: 0.1, priorPoa: 0.5, deltaPoa: -0.4 },
  ],
};

async function queryExportedSegments(text: string): Promise<string[]> {
  const data = JSON.parse(text);
  const container = document.createElement("div");
  container.style.cssText = "position: fixed; left: -500px; top: 0; width: 400px; height: 400px";
  document.body.append(container);
  const map = new MapLibreMap({
    container, style: { version: 8, sources: {}, layers: [] }, center: [-84.804, 34.103], zoom: 13,
    attributionControl: false, interactive: false, fadeDuration: 0,
  });
  try {
    const result = async () => {
      await map.once("load");
      map.addSource("export", { type: "geojson", data });
      map.addLayer({ id: "export-fill", type: "fill", source: "export" });
      await map.once("idle");
      return [...new Set(map.querySourceFeatures("export").map(({ properties }) => String(properties.segmentId)))].sort();
    };
    return await Promise.race([result(), map.once("error").then(({ error }) => { throw error; })]);
  } finally {
    map.remove();
    container.remove();
  }
}

Object.assign(window, { queryExportedSegments });

const root = document.getElementById("root");
if (!root) throw new Error("Missing harness root");
createRoot(root).render(
  <main>
    <header className="post-head">
      <span className="drill">{DRILL_LABEL}</span>
      <span>Made-up harness data</span>
      <ExtrasDock incidentId="print-harness" state={state} vs={vs} map={null} />
    </header>
  </main>,
);
