import { simulateWalkers, type WalkerGrid, type WalkerOptions, type WalkerRouteGraph } from "@pls/engine";
import { describe, expect, it } from "vitest";
import toyFixture from "../../../shared/engine-ts/test/fixtures/toy-graph.json";
import { runWalkerJob, type WalkerMessage } from "./walkerJob";

const { graph, grid } = toyFixture as unknown as { graph: WalkerRouteGraph; grid: WalkerGrid };
const opts: WalkerOptions = { n: 2000, seed: 42, startStationId: 0, travelUnit: null, terrain: "temperate_flat", sampleTracks: 30, attractors: [], lowMobility: false };

describe("runWalkerJob", () => {
  it("posts progress at the start and every 1,000 walkers, then the engine's own result with the measured time", () => {
    const posted: WalkerMessage[] = [];
    let clock = 1000;
    runWalkerJob({ type: "run", graph, grid, opts: { ...opts, n: 2500 } }, (m) => posted.push(m), () => (clock += 250));
    expect(posted.filter((m) => m.type === "progress").map((m) => (m as { done: number }).done)).toEqual([0, 1000, 2000, 2500]);
    const last = posted.at(-1)!;
    if (last.type !== "result") throw new Error("no result");
    expect(last.result).toEqual(simulateWalkers(graph, grid, { ...opts, n: 2500 }));
    expect(last.elapsedMs).toBe(250);
  });

  it("reports an engine refusal as an error message instead of throwing in the worker", () => {
    const posted: WalkerMessage[] = [];
    runWalkerJob({ type: "run", graph, grid, opts: { ...opts, n: 0 } }, (m) => posted.push(m), () => 0);
    expect(posted.at(-1)).toEqual({ type: "error", message: "Walker count must be a positive integer" });
  });
});
