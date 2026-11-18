import type { WalkerResult } from "@pls/engine";
import { describe, expect, it } from "vitest";
import { loadRouteGraph, walkerPriorWrites } from "./walkerPrior";

const graphJson = { stations: [{ x: 0, y: 0, hx: 1, hy: 0, nx: 0, ny: 1, segmentId: "AA", edgeId: 0 }], edges: [{ id: 0, cls: "trail", from: 0, to: 1, stationIds: [0] }], nodes: [{ id: 0, edgeIds: [0], boundary: false }] };
const respond = (body: BodyInit, status = 200, type = "application/json") => async () => new Response(body, { status, headers: { "content-type": type } });

describe("loadRouteGraph", () => {
  it("accepts a graph with stations, edges and nodes", async () => {
    const r = await loadRouteGraph("/tiles/x.graph.json", respond(JSON.stringify(graphJson)));
    expect(r.state).toBe("ok");
    if (r.state === "ok") expect(r.graph.stations).toHaveLength(1);
  });

  it("reads a missing file as absent and a malformed one as invalid", async () => {
    expect((await loadRouteGraph("/tiles/x.graph.json", respond("", 404))).state).toBe("absent");
    expect((await loadRouteGraph("/tiles/x.graph.json", respond("<!doctype html>", 200, "text/html"))).state).toBe("absent");
    expect((await loadRouteGraph("/tiles/x.graph.json", respond(JSON.stringify({ stations: [] })))).state).toBe("invalid");
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
