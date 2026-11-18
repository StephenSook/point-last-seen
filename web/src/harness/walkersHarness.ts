// Dev-server-only harness (web/harness/walkers.html): runs the engine's toy graph in the
// walker Worker and directly, and records on <body> whether the tables match.

import { simulateWalkers, type WalkerGrid, type WalkerOptions, type WalkerRouteGraph } from "@pls/engine";
import toyFixture from "../../../shared/engine-ts/test/fixtures/toy-graph.json";
import { runWalkersInWorker } from "../workers/runWalkers";

const { graph, grid } = toyFixture as unknown as { graph: WalkerRouteGraph; grid: WalkerGrid };
const opts: WalkerOptions = { n: 10_000, seed: 20261122, startStationId: 0, travelUnit: null, terrain: "temperate_flat", sampleTracks: 300, attractors: [], lowMobility: false };
const progress: number[] = [];

runWalkersInWorker({ graph, grid, opts }, (d) => progress.push(d)).then(
  ({ result, elapsedMs }) => {
    const direct = simulateWalkers(graph, grid, opts);
    document.body.dataset["equal"] = String(JSON.stringify(result) === JSON.stringify(direct));
    document.body.dataset["elapsed"] = String(elapsedMs);
    document.body.dataset["progress"] = progress.join(",");
    document.body.dataset["tracks"] = String(result.sampleTracks.length);
  },
  (e: Error) => (document.body.dataset["error"] = e.message),
);
