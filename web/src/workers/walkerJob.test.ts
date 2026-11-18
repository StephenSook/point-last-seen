import { simulateWalkers, type WalkerGrid, type WalkerOptions, type WalkerRouteGraph } from "@pls/engine";
import { describe, expect, it } from "vitest";
import toyFixture from "../../../shared/engine-ts/test/fixtures/toy-graph.json";
import { runWalkerJob, type WalkerMessage } from "./walkerJob";

const { graph, grid } = toyFixture as unknown as { graph: WalkerRouteGraph; grid: WalkerGrid };
const opts: WalkerOptions = { n: 2000, seed: 42, startStationId: 0, travelUnit: null, terrain: "temperate_flat", sampleTracks: 30, attractors: [], lowMobility: false };

describe("runWalkerJob", () => {
  it("posts progress at the start and the end, then the engine's own result with the measured time", () => {
    const posted: WalkerMessage[] = [];
    let clock = 1000;
    runWalkerJob({ type: "run", graph, grid, opts }, (m) => posted.push(m), () => (clock += 250));
    expect(posted.map((m) => m.type)).toEqual(["progress", "progress", "result"]);
    expect(posted[0]).toEqual({ type: "progress", done: 0 });
    expect(posted[1]).toEqual({ type: "progress", done: 2000 });
    const last = posted[2]!;
    if (last.type !== "result") throw new Error("no result");
    expect(last.result).toEqual(simulateWalkers(graph, grid, opts));
    expect(last.elapsedMs).toBe(250);
  });

  it("reports an engine refusal as an error message instead of throwing in the worker", () => {
    const posted: WalkerMessage[] = [];
    runWalkerJob({ type: "run", graph, grid, opts: { ...opts, n: 0 } }, (m) => posted.push(m), () => 0);
    expect(posted.at(-1)).toEqual({ type: "error", message: "Walker count must be a positive integer" });
  });
});
