import type { WalkerResult } from "@pls/engine";
import { describe, expect, it } from "vitest";
import { graphFor, loadRouteGraph, runAgainstVersion, STALE_PRIOR, walkerPriorWrites } from "./walkerPrior";

// A stored route graph as the grid builder writes it: one trail edge of two stations between two nodes.
const st = (x: number) => ({ x, y: 0, hx: 1, hy: 0, nx: 0, ny: 1, segmentId: "AA" });
const graphJson = {
  graphId: "synthetic", gridId: "synthetic", stationSpacingM: 25, origin: { lat: 33.78, lon: -84.38 },
  nodes: [{ nodeId: 0, x: 0, y: 0 }, { nodeId: 1, x: 25, y: 0 }],
  edges: [{ edgeId: 0, class: "trail", from: 0, to: 1, stations: [st(0), st(25)] }],
  bounds: [-84.381, 33.779, -84.379, 33.781], projection: { metresPerDegreeLat: 111_195, metresPerDegreeLon: 92_421 }, attribution: "synthetic",
};
const respond = (body: BodyInit, status = 200, type = "application/json") => async () => new Response(body, { status, headers: { "content-type": type } });

describe("loadRouteGraph", () => {
  it("indexes a stored route graph for the walker engine", async () => {
    const r = await loadRouteGraph("/tiles/x.graph.json", respond(JSON.stringify(graphJson)));
    expect(r.state).toBe("ok");
    if (r.state === "ok") {
      expect(r.graph.stations).toHaveLength(2);
      expect(r.graph.projection?.origin).toEqual({ lat: 33.78, lon: -84.38 });
    }
  });

  it("refuses a stored graph the engine refuses (no projection)", async () => {
    const { projection: _p, ...noProjection } = graphJson;
    expect((await loadRouteGraph("/tiles/x.graph.json", respond(JSON.stringify(noProjection)))).state).toBe("invalid");
  });

  it("reads a missing file as absent and a malformed one as invalid", async () => {
    expect((await loadRouteGraph("/tiles/x.graph.json", respond("", 404))).state).toBe("absent");
    expect((await loadRouteGraph("/tiles/x.graph.json", respond("<!doctype html>", 200, "text/html"))).state).toBe("absent");
    expect((await loadRouteGraph("/tiles/x.graph.json", respond(JSON.stringify({ edges: [] })))).state).toBe("invalid");
    expect((await loadRouteGraph("/tiles/x.graph.json", respond("not json"))).state).toBe("invalid");
  });
});

describe("walkerPriorWrites", () => {
  const result: WalkerResult = { segments: [{ segmentId: "AA", priorPoa: 0.4 }, { segmentId: "AB", priorPoa: 0.35 }], row: 0.25, stdErr: { AA: 0.005, AB: 0.005 }, sampleTracks: [], n: 10_000 };

  it("writes the walker table to priorPoa and leaves the ring baseline alone", () => {
    const w = walkerPriorWrites(result, { priorVersion: 2, priorInputEventIds: ["e1"] }, { seed: 7, attractorEventIds: [] });
    expect(w.segments).toEqual([
      { segmentId: "AA", data: { priorPoa: 0.4, priorVersion: 3 } },
      { segmentId: "AB", data: { priorPoa: 0.35, priorVersion: 3 } },
    ]);
    expect(w.row).toEqual({ priorPoa: 0.25, priorVersion: 3 });
    expect(w.incident).toEqual({ priorModel: "walkers", priorSeed: 7, priorInputEventIds: ["e1"], priorVersion: 3 });
  });

  it("adds each place used as an attractor to the prior's input events, once", () => {
    const w = walkerPriorWrites(result, { priorVersion: 2, priorInputEventIds: ["e1", "d1"] }, { seed: 7, attractorEventIds: ["d1", "d2"] });
    expect(w.incident.priorInputEventIds).toEqual(["e1", "d1", "d2"]);
  });
});

describe("runAgainstVersion", () => {
  it("returns the run's result when the prior is still the one it started from", async () => {
    expect(await runAgainstVersion(7, () => 7, async () => "result")).toBe("result");
  });
  it("refuses a result that finished after the prior moved on, so it cannot overwrite a newer one", async () => {
    let version = 7;
    await expect(runAgainstVersion(7, () => version, async () => { version = 8; return "late"; })).rejects.toThrow(STALE_PRIOR);
  });
});

describe("graphFor: a loaded route graph is used only for the grid it was loaded for", () => {
  it("gives the graph for its own grid, and nothing for another grid or while loading", () => {
    const load = { state: "absent" } as const;
    expect(graphFor("kennesaw-mountain-drill", { gridId: "kennesaw-mountain-drill", load })).toBe(load);
    expect(graphFor("piedmont-park-dev", { gridId: "kennesaw-mountain-drill", load })).toBeNull();
    expect(graphFor("kennesaw-mountain-drill", null)).toBeNull();
    expect(graphFor(undefined, { gridId: "kennesaw-mountain-drill", load })).toBeNull();
  });
});

