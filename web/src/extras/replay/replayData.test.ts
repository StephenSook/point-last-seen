import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, mergeModel, viewState, type EventDoc, type PublishedRun } from "../laneC";
import { T0, cameraReading, eventDoc, replayPlan, replayView, streamed } from "../testdata/replay";
import { fromLive, fromPublishedRun, mmssToMs } from "./replayData";
import { runEvent } from "../testdata/replayIncident";
import { PUBLISHED_RUN_VERSION, type PublishedRunV1 } from "./runContract";

const MIN = 60_000;
const DAY = 24 * 3_600_000;

function liveEvents() {
  return [
    streamed(eventDoc({ eventId: "e1", teamId: "alfa", deviceId: "d1", clientTimeMs: T0 + MIN }), T0 + 10 * MIN),
    streamed(eventDoc({ eventId: "e2", teamId: "bravo", deviceId: "d2", type: "sighting", clientTimeMs: T0 + 2 * MIN }), T0 + 2 * MIN + 5_000),
    streamed(eventDoc({ eventId: "e3", teamId: "alfa", deviceId: "d1", clientTimeMs: T0 + 2 * DAY }), T0 + 3 * MIN),
  ];
}

describe("mmssToMs", () => {
  it("reads the schema's two-digit minutes and seconds", () => {
    expect(mmssToMs("00:10")).toBe(10_000);
    expect(mmssToMs("02:14")).toBe(134_000);
    expect(mmssToMs("2:14")).toBeNull();
    expect(mmssToMs("00:61")).toBeNull();
  });
});

describe("fromLive", () => {
  it("sent and arrived times equal the merge lanes' times for the same docs", () => {
    const view = replayView();
    const events = liveEvents();
    const data = fromLive(view, events, [])!;
    const lanes = mergeModel(
      events.map((e) => ({ eventId: e.eventId, teamId: e["teamId"] as string, deviceId: String(e["deviceId"]), clientTimeMs: Number(e["clientTimeMs"]), serverTimeMs: e.serverTimeMs })),
      view.teams,
      T0 + 60 * MIN,
      view.clockOffsets,
    );
    const cards = lanes.flatMap((l) => l.cards);
    expect(cards).toHaveLength(3);
    for (const c of cards) {
      const r = data.events.find((e) => e.eventId === c.eventId)!;
      expect({ sentAtMs: r.sentAtMs, arrivedAtMs: r.arrivedAtMs, offlineForMs: r.offlineForMs, clockSuspect: r.clockSuspect }).toEqual({
        sentAtMs: c.sentAtMs,
        arrivedAtMs: c.arrivedAtMs,
        offlineForMs: c.offlineForMs,
        clockSuspect: c.clockSuspect,
      });
    }
  });

  it("a negative or over-24-hour gap is marked clock suspect and has no offline span", () => {
    const view = replayView();
    const events = [
      streamed(eventDoc({ eventId: "late", deviceId: "d9", clientTimeMs: T0 + 5 * MIN }), T0),
      streamed(eventDoc({ eventId: "old", deviceId: "d9", clientTimeMs: T0 - DAY - 1 }), T0),
      streamed(eventDoc({ eventId: "ok", deviceId: "d9", clientTimeMs: T0 - DAY }), T0),
    ];
    const byId = Object.fromEntries(fromLive(view, events, [])!.events.map((e) => [e.eventId, e]));
    expect(byId["late"]).toMatchObject({ clockSuspect: true, offlineForMs: null });
    expect(byId["old"]).toMatchObject({ clockSuspect: true, offlineForMs: null });
    expect(byId["ok"]).toMatchObject({ clockSuspect: false, offlineForMs: DAY });
  });

  it("events are deduplicated by id and ordered by arrival, then id", () => {
    const view = replayView();
    const events = [
      streamed(eventDoc({ eventId: "b" }), T0 + 2 * MIN),
      streamed(eventDoc({ eventId: "c" }), T0 + MIN),
      streamed(eventDoc({ eventId: "a" }), T0 + 2 * MIN),
      streamed(eventDoc({ eventId: "c" }), T0 + MIN),
    ];
    expect(fromLive(view, events, [])!.events.map((e) => e.eventId)).toEqual(["c", "a", "b"]);
  });

  it("a pending write has no arrival time and sorts last", () => {
    const view = replayView();
    const events = [
      streamed(eventDoc({ eventId: "a-pending" }), null, true),
      streamed(eventDoc({ eventId: "z-landed" }), T0 + MIN),
      streamed(eventDoc({ eventId: "m-flagged" }), T0 + 2 * MIN, true),
    ];
    const out = fromLive(view, events, [])!.events;
    expect(out.map((e) => e.eventId)).toEqual(["z-landed", "a-pending", "m-flagged"]);
    expect(out[1]).toMatchObject({ arrivedAtMs: null, offlineForMs: null, clockSuspect: false });
    expect(out[2]!.arrivedAtMs).toBeNull();
  });

  it("a camera sighting with a confirmed clock gives a person-in-view interval", () => {
    const doc = eventDoc({ eventId: "cam", type: "camera_sighting", reading: cameraReading() });
    const out = fromLive(replayView(), [streamed(doc, T0)], [])!.events[0]!;
    expect(out.camera).toEqual({ startMs: 1_010_000, endMs: 1_134_000, keyFrameMs: 1_060_000 });
  });

  it("a camera sighting with an unconfirmed clock gives no interval", () => {
    const unconfirmed = eventDoc({ eventId: "cam1", type: "camera_sighting", reading: cameraReading({ clockConfirmed: false }) });
    const nobody = eventDoc({ eventId: "cam2", type: "camera_sighting", reading: cameraReading({}, { personVisible: false }) });
    const out = fromLive(replayView(), [streamed(unconfirmed, T0), streamed(nobody, T0)], [])!.events;
    expect(out.map((e) => e.camera)).toEqual([null, null]);
  });

  it("the prior array equals the one the command post builds", () => {
    const view = replayView();
    const data = fromLive(view, liveEvents(), [])!;
    const postPrior = [...view.segments.map((s) => ({ segmentId: s.segmentId, priorPoa: s.priorPoa })), { segmentId: "ROW", priorPoa: view.rowPrior! }];
    expect(data.prior).toEqual(postPrior);
    expect(data.params).toBe(DEFAULT_PARAMS);
    expect(data.priorVersion).toBe(2);
    expect(data.priorInputEventIds).toEqual(["e0"]);
    const docs = liveEvents() as unknown as EventDoc[];
    expect(viewState(data.prior, docs, data.priorInputEventIds, data.params, data.priorVersion).code).toBe(
      viewState(postPrior, docs, ["e0"], DEFAULT_PARAMS, 2).code,
    );
  });

  it("fromLive returns null until the incident, the prior and the engine parameters are loaded", () => {
    expect(fromLive(null, [], [])).toBeNull();
    expect(fromLive({ ...replayView(), incident: null }, [], [])).toBeNull();
    expect(fromLive({ ...replayView(), segments: [] }, [], [])).toBeNull();
    expect(fromLive({ ...replayView(), rowPrior: null }, [], [])).toBeNull();
    expect(fromLive(replayView(), [], [])).not.toBeNull();
  });

  it("keeps the drill line, the plans' approval times and the stored prior build time", () => {
    const data = fromLive(replayView({ priorBuiltAtMs: T0 - MIN } as object), [], [replayPlan(2, T0 + 5 * MIN), replayPlan(1, T0)])!;
    expect(data.source).toBe("live");
    expect(data.drillLabel).toBe("Training drill. Nobody is missing.");
    expect(data.priorBuiltAtMs).toBe(T0 - MIN);
    expect(data.plans.map((p) => [p.version, p.approvedAtMs])).toEqual([[1, T0], [2, T0 + 5 * MIN]]);
    expect(fromLive(replayView({ drillLabel: "Training drill. Practice search; nobody is missing." }), [], [])!.drillLabel).toBe(
      "Training drill. Practice search; nobody is missing.",
    );
    expect(fromLive(replayView(), [], [])!.priorBuiltAtMs).toBeNull();
  });

  it("carries the grid's own licence line for the map credit", () => {
    expect(fromLive(replayView({ gridAttribution: "Grid from OpenStreetMap (ODbL)" }), [], [])!.gridAttribution).toBe("Grid from OpenStreetMap (ODbL)");
    expect(fromLive(replayView(), [], [])!.gridAttribution).toBeNull();
    const r = fromPublishedRun(run({ incident: { ...runV1().incident, gridAttribution: "Grid from OpenStreetMap (ODbL)" } }));
    expect(r.ok && r.data.gridAttribution).toBe("Grid from OpenStreetMap (ODbL)");
  });
});

// Typed as the contract, so a change to the contract the reader does not follow fails the typecheck.
function runV1(): PublishedRunV1 {
  const view = replayView();
  const inc = view.incident!;
  return {
    runId: "run-1",
    label: "Training drill. Nobody is missing.",
    exportedAt: "2026-11-23T12:00:00Z",
    incident: { name: inc.name, mode: inc.mode, priorVersion: inc.priorVersion, priorInputEventIds: inc.priorInputEventIds ?? [] },
    segments: [
      ...view.segments.map(({ geometry, ...s }) => ({ ...s, geometryJson: JSON.stringify(geometry) })),
      { segmentId: "ROW", priorPoa: 0.1 },
    ],
    teams: view.teams,
    devices: [{ deviceId: "d1", teamId: "alfa", clockOffsetMs: 5_000 }, { deviceId: "d2", teamId: "bravo", clockOffsetMs: -2_000 }],
    events: [
      runEvent(eventDoc({ eventId: "e1", clientTimeMs: T0 + MIN }), T0 + 10 * MIN),
      runEvent(eventDoc({ eventId: "e2", teamId: "bravo", deviceId: "d2", clientTimeMs: T0 + 2 * MIN }), T0 + 3 * MIN),
    ],
    plans: [{ version: 1, approvedAtMs: T0 + 4 * MIN, priorVersion: 2, basedOnEventSetHash: "0".repeat(64), assignments: replayPlan(1, 0).assignments }],
    measurements: {},
  };
}

function run(over: Partial<Record<keyof PublishedRun, unknown>> = {}): PublishedRun {
  return { ...runV1(), ...over };
}

describe("fromPublishedRun", () => {
  it("reads a complete run with the same times and prior as the live post", () => {
    const r = fromPublishedRun(run());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const live = fromLive(replayView(), [streamed(eventDoc({ eventId: "e1", clientTimeMs: T0 + MIN }), T0 + 10 * MIN)], [])!;
    expect(r.data.source).toBe("published_run");
    expect(r.data.prior).toEqual(live.prior);
    expect(r.data.segments.map((s) => s.geometry)).toEqual(replayView().segments.map((s) => s.geometry));
    expect(r.data.events.map((e) => e.eventId)).toEqual(["e2", "e1"]);
    expect(r.data.events[1]).toMatchObject({ eventId: "e1", sentAtMs: live.events[0]!.sentAtMs, arrivedAtMs: T0 + 10 * MIN });
    expect(r.data.plans).toEqual([{ version: 1, approvedAtMs: T0 + 4 * MIN, assignments: replayPlan(1, 0).assignments }]);
    expect(r.data.drillLabel).toBe("Training drill. Nobody is missing.");
  });

  it("a published run with a missing part is refused with a reason", () => {
    for (const part of ["incident", "segments", "teams", "devices", "events", "plans"] as const) {
      const r = fromPublishedRun(run({ [part]: undefined }));
      expect(r).toEqual({ ok: false, reason: expect.stringMatching(/^The run .+\.$/) });
    }
    expect(fromPublishedRun(run({ segments: [{ segmentId: "AA", priorPoa: 1, geometryJson: "{}" }] })).ok).toBe(false);
  });

  it("a published run whose event has no server time is refused", () => {
    const events = [{ ...eventDoc({ eventId: "e1" }), serverTimeMs: null }];
    expect(fromPublishedRun(run({ events }))).toEqual({ ok: false, reason: "The run has no arrival time for a report." });
  });

  it("a published run whose plan has no approval time is refused", () => {
    expect(fromPublishedRun(run({ plans: [{ version: 1, assignments: [] }] }))).toEqual({ ok: false, reason: "The run has no approval time for a plan." });
  });

  it("a public run that carries report text is refused", () => {
    const withText = { ...runEvent(eventDoc({ eventId: "e1" }), T0), rawText: "private caller words" };
    expect(fromPublishedRun(run({ events: [withText] }))).toEqual({ ok: false, reason: "The run carries report text. A public run must not." });
  });

  it("a public run that carries a report reading is refused; a camera reading is kept", () => {
    const quote = { kind: "clue", evidenceQuote: "private caller words" };
    const report = { ...runEvent(eventDoc({ eventId: "e1" }), T0), reading: quote };
    expect(fromPublishedRun(run({ events: [report] }))).toEqual({ ok: false, reason: "The run carries report text. A public run must not." });
    const cam = runEvent(eventDoc({ eventId: "cam", type: "camera_sighting", reading: cameraReading() }), T0);
    const r = fromPublishedRun(run({ events: [cam] }));
    expect(r.ok && r.data.events[0]!.camera).toEqual({ startMs: 1_010_000, endMs: 1_134_000, keyFrameMs: 1_060_000 });
  });

  it("names the contract version it reads", () => {
    expect(PUBLISHED_RUN_VERSION).toBe(1);
  });
});
