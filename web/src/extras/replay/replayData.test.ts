import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, mergeModel, viewState, type EventDoc, type PublishedRun } from "../hostApp";
import { T0, cameraReading, eventDoc, replayPlan, replayView, streamed } from "../testdata/replay";
import { fromLive, fromPublishedRun, lastReportRoute, mmssToMs, pendingLine, runCarriesRoutes } from "./replayData";
import { runDevice, runEvent } from "../testdata/replayIncident";
import { MAX_RUN_EVENTS, PUBLISHED_RUN_VERSION, type PublishedRunV1, type RunCameraReading, type RunSegment } from "./runContract";

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

  it("the time a person was seen gets the phone's measured offset, like the sent time", () => {
    const doc = eventDoc({ eventId: "seen", type: "sighting", deviceId: "d1", observedAtMs: T0, clientTimeMs: T0 + MIN });
    expect(fromLive(replayView(), [streamed(doc, T0 + 2 * MIN)], [])!.events[0]!.observedAtMs).toBe(T0 + 5_000);
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

  it("says how many reports are still sending, because the live map counts them and the replay cannot", () => {
    const sent = streamed(eventDoc({ eventId: "landed" }), T0);
    const one = fromLive(replayView(), [sent, streamed(eventDoc({ eventId: "p1" }), null, true)], [])!;
    const two = fromLive(replayView(), [sent, streamed(eventDoc({ eventId: "p1" }), null, true), streamed(eventDoc({ eventId: "p2" }), null, true)], [])!;
    expect(pendingLine(fromLive(replayView(), [sent], [])!)).toBeNull();
    expect(pendingLine(one)).toBe("1 report is still sending and is not in the replay.");
    expect(pendingLine(two)).toBe("2 reports are still sending and are not in the replay.");
  });

  it("a plan whose server approval time has not arrived is not in the replay", () => {
    // Still being written: its approval time is not on the server yet, and the browser's clock must not stand in.
    const pending = { ...replayPlan(3, T0), approvedAt: null, createdClientTimeMs: T0 - 10 * MIN };
    const d = fromLive(replayView(), [], [replayPlan(1, T0 + MIN), pending])!;
    expect(d.plans.map((p) => p.version)).toEqual([1]);
  });

  it("carries the grid's own licence line for the map credit", () => {
    expect(fromLive(replayView({ gridAttribution: "Grid from OpenStreetMap (ODbL)" }), [], [])!.gridAttribution).toBe("Grid from OpenStreetMap (ODbL)");
    expect(fromLive(replayView(), [], [])!.gridAttribution).toBeNull();
    const r = fromPublishedRun(run({ incident: { ...runV1().incident, gridAttribution: "Grid from OpenStreetMap (ODbL)" } }));
    expect(r.ok && r.data.gridAttribution).toBe("Grid from OpenStreetMap (ODbL)");
  });
});

/**
 * Engine settings of the right shape, every number finite and under 1e19, whose clue factor 1 - w * (1 - base) is
 * about 1e36. Ten clues on one segment multiply past the largest number, so the map has no finite values.
 */
function overflowing(): typeof DEFAULT_PARAMS {
  const big = -1e18;
  return {
    ...DEFAULT_PARAMS,
    authenticityWeight: { high: big, medium: big, low: big },
    iocBase: { strong_for: big, for: big, neutral: big, against: big, strong_against: big },
  };
}

/** Ten clues on AA, one a minute from T0, arriving a minute after each is sent. */
function tenClues() {
  return Array.from({ length: 10 }, (_, k) =>
    runEvent(eventDoc({ eventId: `c${k}`, seq: k + 1, clientTimeMs: T0 + k * MIN, effect: { kind: "clue", influences: { AA: "strong_for" }, authenticity: "high" } }), T0 + (k + 1) * MIN),
  );
}

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
    devices: [{ deviceId: runDevice("d1"), teamId: "alfa", clockOffsetMs: 5_000 }, { deviceId: runDevice("d2"), teamId: "bravo", clockOffsetMs: -2_000 }],
    events: [
      runEvent(eventDoc({ eventId: "e1", clientTimeMs: T0 + MIN }), T0 + 10 * MIN),
      runEvent(eventDoc({ eventId: "e2", teamId: "bravo", deviceId: "d2", clientTimeMs: T0 + 2 * MIN }), T0 + 3 * MIN),
    ],
    plans: [{ version: 1, approvedAtMs: T0 + 4 * MIN, priorVersion: 2, basedOnEventSetHash: "0".repeat(64), assignments: replayPlan(1, 0).assignments }],
    measurements: [],
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
    expect(r.data.plans).toEqual([{ version: 1, priorVersion: 2, approvedAtMs: T0 + 4 * MIN, assignments: replayPlan(1, 0).assignments }]);
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
    const events = [{ ...runEvent(eventDoc({ eventId: "e1" }), T0), serverTimeMs: null }];
    expect(fromPublishedRun(run({ events }))).toEqual({ ok: false, reason: "The run has no arrival time for a report." });
  });

  it("a published run whose plan has no approval time is refused", () => {
    expect(fromPublishedRun(run({ plans: [{ version: 1, priorVersion: 2, assignments: [] }] }))).toEqual({ ok: false, reason: "The run has no approval time for a plan." });
    expect(fromPublishedRun(run({ plans: [{ version: 1, approvedAtMs: T0, assignments: [] }] }))).toEqual({ ok: false, reason: "The run has a plan it cannot read." });
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

  it("refuses a field the contract does not name, on any part of a public run", () => {
    const base = runV1();
    const cases: [Partial<Record<keyof PublishedRun, unknown>>, string][] = [
      [{ incident: { ...base.incident, joinCodeHash: "x" } }, "incident.joinCodeHash"],
      [{ events: [{ ...base.events[0]!, createdAt: 1 }] }, "event.createdAt"],
      [{ plans: [{ ...base.plans[0]!, approvedByUid: "uid-real" }] }, "plan.approvedByUid"],
      [{ devices: [{ ...base.devices[0]!, pushToken: "t" }] }, "device.pushToken"],
      [{ teams: [{ ...base.teams[0]!, leaderPhone: "555" }] }, "team.leaderPhone"],
      [{ segments: [{ ...base.segments[0]!, note: "n" }, ...base.segments.slice(1)] }, "segment.note"],
    ];
    for (const [over, field] of cases) {
      expect(fromPublishedRun(run(over))).toEqual({ ok: false, reason: `The run carries a field a public run must not: ${field}.` });
    }
    expect(fromPublishedRun({ ...run(), consent: [] } as unknown as PublishedRun)).toEqual({ ok: false, reason: "The run carries a field a public run must not: consent." });
  });

  it("refuses an author that is not a run pseudonym", () => {
    const base = runV1();
    const withUid = { ...base.events[0]!, authorUid: "Xq9fZp2uid" };
    expect(fromPublishedRun(run({ events: [withUid] }))).toEqual({ ok: false, reason: "The run carries a user id. A public run must not." });
    expect(fromPublishedRun(run({ events: [{ ...base.events[0]!, authorUid: "author-12" }] })).ok).toBe(true);
  });

  it("refuses a device id that is not a run pseudonym, in a report or in the device table", () => {
    // The rules make a device id the author's auth uid, so a raw one is a user id.
    const base = runV1();
    const uid = "Xq9fZp2uLmN4oPq8RsT1uVw3XyZa";
    const userId = { ok: false, reason: "The run carries a user id. A public run must not." };
    expect(fromPublishedRun(run({ events: [{ ...base.events[0]!, deviceId: uid }] }))).toEqual(userId);
    expect(fromPublishedRun(run({ events: [{ ...base.events[0]!, deviceId: "d1" }] }))).toEqual(userId);
    expect(fromPublishedRun(run({ devices: [{ ...base.devices[0]!, deviceId: uid }] }))).toEqual(userId);
  });

  it("refuses any value shaped like a Firebase user id, wherever it sits", () => {
    const base = runV1();
    const userId = { ok: false, reason: "The run carries a user id. A public run must not." };
    expect(fromPublishedRun(run({ teams: [{ teamId: "alfa", name: "Xq9fZp2uLmN4oPq8RsT1uVw3XyZa" }] }))).toEqual(userId);
    expect(fromPublishedRun(run({ measurements: { note: ["AbCdEfGhIjKlMnOpQrStUvWxYz12"] } }))).toEqual(userId);
    expect(fromPublishedRun(run({ teams: base.teams })).ok).toBe(true);
  });

  it("finds a user id in any form: a key, a long integer, a look-alike, inside text or inside a segment's shape", () => {
    const base = runV1();
    const uid = "Xq9fZp2uLmN4oPq8RsT1uVw3XyZa";
    const userId = { ok: false, reason: "The run carries a user id. A public run must not." };
    const seg = base.segments[0] as { geometryJson: string };
    const shape = JSON.parse(seg.geometryJson) as Record<string, unknown>;
    const cases: Partial<Record<keyof PublishedRun, unknown>>[] = [
      { measurements: { [uid]: 1 } },
      { measurements: { n: 1234567890123456789012 } },
      { teams: [{ teamId: "alfa", name: "\uFF38\uFF51\uFF19\uFF46\uFF3A\uFF50\uFF12\uFF55\uFF2C\uFF4D\uFF2E\uFF14\uFF4F\uFF30\uFF51\uFF18\uFF32\uFF53\uFF34\uFF11\uFF55\uFF36\uFF57\uFF13\uFF38\uFF59\uFF3A\uFF41" }] },
      { teams: [{ teamId: "alfa", name: `Team ${uid} north` }] },
      { segments: [{ ...seg, geometryJson: JSON.stringify({ ...shape, owner: uid }) }, ...base.segments.slice(1)] },
    ];
    for (const over of cases) expect(fromPublishedRun(run(over))).toEqual(userId);
    // Event ids (32 hex) and hashes (64 hex) are not user ids.
    expect(fromPublishedRun(run({ events: [{ ...base.events[0]!, eventId: "0123456789abcdef0123456789abcdef" }] })).ok).toBe(true);
  });

  it("reads a report that leaves out an optional coded field: only a value that is present is checked", () => {
    const base = runEvent(eventDoc({ eventId: "e" }), T0);
    for (const field of ["decision", "positionSource", "inputMethod", "reporter"] as const) {
      const { [field]: _left, ...rest } = base;
      expect(fromPublishedRun(run({ events: [rest as typeof base] })).ok, field).toBe(true);
    }
  });

  it("refuses a report whose kind, role, reporter, place source, input or decision is not an exact known value", () => {
    const base = runEvent(eventDoc({ eventId: "e" }), T0);
    const unknownKind = { ok: false, reason: "The run has a report of a kind it does not know." };
    // A place to check written with a trailing space would dodge the home-position rule if it were read at all.
    const dodged = { ...base, type: "destination ", position: { lat: 33.79, lon: -84.37, accuracyM: null } };
    for (const e of [
      dodged,
      { ...base, type: "Destination" },
      { ...base, type: "note" },
      { ...base, role: "Searcher" },
      { ...base, reporter: "neighbor" },
      { ...base, positionSource: "GPS" },
      { ...base, inputMethod: "voice" },
      { ...base, decision: "maybe" },
    ]) {
      expect(fromPublishedRun(run({ events: [e as typeof base] }))).toEqual(unknownKind);
    }
    expect(fromPublishedRun(run({ events: [{ ...base, decision: "confirmed" }] })).ok).toBe(true);
  });

  it("refuses a field of the wrong type anywhere, and never throws on one", () => {
    const base = runV1();
    const ev = base.events[0]!;
    const cam = runEvent(eventDoc({ eventId: "cam", type: "camera_sighting", reading: cameraReading() }), T0);
    const sighting = (cam.reading as RunCameraReading).sighting;
    const seg = base.segments[0] as RunSegment;
    const wrong = (field: string) => ({ ok: false, reason: `The run has a field of the wrong type: ${field}.` });
    const cases: [Partial<Record<keyof PublishedRun, unknown>>, string][] = [
      [{ events: [{ ...cam, reading: { ...cam.reading, sighting: ["private evidence"] } }] }, "event.reading.sighting"],
      [{ events: [{ ...cam, reading: { ...cam.reading, sighting: { ...sighting, firstSeen: { toString: 1 } } } }] }, "event.reading.sighting.firstSeen"],
      [{ events: [{ ...cam, reading: { ...cam.reading, clockConfirmed: "yes" } }] }, "event.reading.clockConfirmed"],
      [{ events: [{ ...cam, reading: { ...cam.reading, sighting: { ...sighting, keyFrame: ["01:00"] } } }] }, "event.reading.sighting.keyFrame"],
      [{ events: [{ ...ev, seq: "3" }] }, "event.seq"],
      [{ events: [{ ...ev, isTrainingInject: "no" }] }, "event.isTrainingInject"],
      [{ events: [{ ...ev, position: [33.79, -84.37] }] }, "event.position"],
      [{ events: [{ ...ev, position: { lat: 33.79, lon: -84.37, accuracyM: null, address: "x" } }] }, "event.position"],
      [{ events: [{ ...ev, effect: [] }] }, "event.effect"],
      [{ segments: [{ ...seg, neighbors: "AB" }, ...base.segments.slice(1)] }, "segment.neighbors"],
      [{ teams: [{ teamId: "alfa", name: 7 }] }, "team.name"],
      [{ devices: [{ ...base.devices[0]!, clockOffsetMs: "5000" }, ...base.devices.slice(1)] }, "device.clockOffsetMs"],
      [{ plans: [{ ...base.plans[0]!, assignments: [{ teamId: "alfa", segmentIds: "AA", taskText: "t", reason: "r" }] }] }, "plan.assignments"],
      [{ incident: { ...base.incident, priorInputEventIds: "e0" } }, "incident.priorInputEventIds"],
      [{ runId: 1 }, "runId"],
    ];
    for (const [over, field] of cases) expect(fromPublishedRun(run(over)), field).toEqual(wrong(field));
  });

  it("refuses a place to check that keeps its position: it may be a home from the family's profile", () => {
    const place = runEvent(eventDoc({ eventId: "home", type: "destination", role: "command", teamId: null, deviceId: "cmd", position: { lat: 33.79, lon: -84.37, accuracyM: null }, effect: { kind: "none", why: "informational" } }), T0);
    expect(fromPublishedRun(run({ events: [place] }))).toEqual({ ok: false, reason: "The run carries a place from the family's profile. A public run must not." });
    expect(fromPublishedRun(run({ events: [{ ...place, position: null }] })).ok).toBe(true);
  });

  it("refuses a camera sighting that keeps its place: the camera is usually at the family's home", () => {
    const cam = runEvent(eventDoc({ eventId: "cam", type: "camera_sighting", positionSource: "camera_pin", position: { lat: 33.79, lon: -84.37, accuracyM: null }, reading: cameraReading() }), T0);
    expect(fromPublishedRun(run({ events: [cam] }))).toEqual({ ok: false, reason: "The run carries a camera's place. A public run must not." });
    expect(fromPublishedRun(run({ events: [{ ...cam, position: null }] })).ok).toBe(true);
  });

  it("refuses an effect or route with any content beyond its exact shape, and an effect about a segment the run lacks", () => {
    const base = runEvent(eventDoc({ eventId: "e" }), T0);
    const route = { platform: "web", path: "on_device", stage: "guided", model: "gemini-nano", reason: "on_device_default", latencyMs: 820, sdkReported: true, blocked: null, decidedAtMs: T0 };
    expect(fromPublishedRun(run({ events: [{ ...base, route } as typeof base] })).ok).toBe(true);
    // A note the language screen refused: the engine's newest route reason.
    expect(fromPublishedRun(run({ events: [{ ...base, route: { ...route, reason: "not_english" } } as typeof base] })).ok).toBe(true);
    const wrong = (field: string) => ({ ok: false, reason: `The run has a field of the wrong type: ${field}.` });
    const noSegment = { ok: false, reason: "The run has a report about a segment it does not have." };
    const clue = { kind: "clue", influences: { AA: "strong_for" }, authenticity: "high" };
    const cleared = { kind: "cleared", segmentId: "ZZ", pod: 0.5, inputs: { coverage: 0.7, sweepWidthM: null, trackLengthM: null, areaM2: 10_000, rdBasis: "default" } };
    const cases: [unknown, unknown][] = [
      [{ ...base, effect: { ...clue, note: "her daughter says she walks here" } }, wrong("event.effect")],
      [{ ...base, effect: { ...clue, influences: { AA: "certain" } } }, wrong("event.effect")],
      [{ ...base, route: { ...route, note: "x" } }, wrong("event.route")],
      [{ ...base, route: { ...route, path: "satellite" } }, wrong("event.route.path")],
      [{ ...base, effect: { ...clue, influences: { "the blue house": "for" } } }, noSegment],
      [{ ...base, effect: cleared }, noSegment],
    ];
    for (const [e, want] of cases) expect(fromPublishedRun(run({ events: [e as typeof base] })), JSON.stringify(e)).toEqual(want);
  });

  it("refuses any report placed by a camera pin, whatever its kind", () => {
    const at = { lat: 33.79, lon: -84.37, accuracyM: null };
    const pinned = runEvent(eventDoc({ eventId: "s", type: "sighting", positionSource: "camera_pin", position: at }), T0);
    expect(fromPublishedRun(run({ events: [pinned] }))).toEqual({ ok: false, reason: "The run carries a camera's place. A public run must not." });
    expect(fromPublishedRun(run({ events: [{ ...pinned, positionSource: "gps" }] })).ok).toBe(true);
    expect(fromPublishedRun(run({ events: [{ ...pinned, position: null }] })).ok).toBe(true);
  });

  it("refuses a camera reading with any field beyond the times the replay uses", () => {
    const cam = runEvent(eventDoc({ eventId: "cam", type: "camera_sighting", reading: cameraReading() }), T0);
    expect(fromPublishedRun(run({ events: [cam] })).ok).toBe(true);
    const r = cam.reading as unknown as { sighting: Record<string, unknown> } & Record<string, unknown>;
    const withEvidence = { ...cam, reading: { ...r, sighting: { ...r.sighting, evidence: "a person in a blue jacket" } } };
    expect(fromPublishedRun(run({ events: [withEvidence] }))).toEqual({ ok: false, reason: "The run carries a field a public run must not: event.reading.sighting.evidence." });
    const withSha = { ...cam, reading: { ...r, clipSha256: "0".repeat(64) } };
    expect(fromPublishedRun(run({ events: [withSha] }))).toEqual({ ok: false, reason: "The run carries a field a public run must not: event.reading.clipSha256." });
  });

  it("refuses a segment whose shape has a missing or broken ring", () => {
    const base = runV1();
    const seg = base.segments[0] as { geometryJson: string };
    const noShape = { ok: false, reason: "The run has a map segment without a shape." };
    for (const coordinates of [[null], [[[-84.37, 33.78]]], [[[-84.37], [-84.36, 33.78], [-84.36, 33.79], [-84.37]]], [[[-84.37, "x"], [-84.36, 33.78], [-84.36, 33.79], [-84.37, 33.78]]]]) {
      const broken = { ...seg, geometryJson: JSON.stringify({ type: "Polygon", coordinates }) };
      expect(fromPublishedRun(run({ segments: [broken, ...base.segments.slice(1)] }))).toEqual(noShape);
    }
  });

  it("refuses a shape whose positions carry anything beyond two numbers, or which carries fields beyond its kind and rings", () => {
    const base = runV1();
    const seg = base.segments[0] as RunSegment;
    const noShape = { ok: false, reason: "The run has a map segment without a shape." };
    const sq = [[-84.37, 33.78], [-84.369, 33.78], [-84.369, 33.781], [-84.37, 33.781], [-84.37, 33.78]];
    const withThird = (third: unknown) => sq.map((p, i) => (i === 1 ? [...p, third] : p));
    for (const geometry of [
      { type: "Polygon", coordinates: [withThird("her porch")] },
      { type: "Polygon", coordinates: [withThird(12)] },
      { type: "Polygon", coordinates: [sq], note: "behind the church" },
    ]) {
      const broken = { ...seg, geometryJson: JSON.stringify(geometry) };
      expect(fromPublishedRun(run({ segments: [broken, ...base.segments.slice(1)] })), JSON.stringify(geometry)).toEqual(noShape);
    }
  });

  it("refuses a ring that is not closed or leaves the earth's ranges, in a Polygon or a MultiPolygon, and a centroid off the earth", () => {
    const base = runV1();
    const seg = base.segments[0] as RunSegment;
    const noShape = { ok: false, reason: "The run has a map segment without a shape." };
    const sq = (w: number, s0: number) => [[w, s0], [w + 0.001, s0], [w + 0.001, s0 + 0.001], [w, s0 + 0.001], [w, s0]];
    const open = sq(-84.37, 33.78).slice(0, 4).concat([[-84.3695, 33.78]]);
    const farNorth = sq(-84.37, 33.78).map(([x, y], i) => (i === 2 ? [x!, 91] : [x!, y!]));
    const farEast = sq(-84.37, 33.78).map(([x, y], i) => (i === 1 ? [181, y!] : [x!, y!]));
    for (const geometry of [
      { type: "Polygon", coordinates: [open] },
      { type: "Polygon", coordinates: [farNorth] },
      { type: "Polygon", coordinates: [farEast] },
      { type: "MultiPolygon", coordinates: [[sq(-84.37, 33.78)], [farNorth]] },
      { type: "MultiPolygon", coordinates: [[sq(-84.37, 33.78)], [open]] },
    ]) {
      const broken = { ...seg, geometryJson: JSON.stringify(geometry) };
      expect(fromPublishedRun(run({ segments: [broken, ...base.segments.slice(1)] })), JSON.stringify(geometry)).toEqual(noShape);
    }
    const good = { ...seg, geometryJson: JSON.stringify({ type: "MultiPolygon", coordinates: [[sq(-84.37, 33.78)], [sq(-84.36, 33.78)]] }) };
    expect(fromPublishedRun(run({ segments: [good, ...base.segments.slice(1)] })).ok).toBe(true);
    const offEarth = { ...seg, centroid: { lat: 91, lon: -84.37 } };
    expect(fromPublishedRun(run({ segments: [offEarth, ...base.segments.slice(1)] }))).toEqual({ ok: false, reason: "The run has a field of the wrong type: segment.centroid.lat." });
  });

  it("refuses __proto__, constructor and prototype as any key or value", () => {
    const base = runV1();
    const seg = base.segments[0] as RunSegment;
    const e = base.events[0]!;
    const reserved = (name: string) => ({ ok: false, reason: `The run uses a reserved name: ${name}.` });
    const protoPosition: unknown = JSON.parse('{"lat":33.79,"lon":-84.37,"accuracyM":null,"__proto__":{"a":1}}');
    expect(fromPublishedRun(run({ events: [{ ...e, position: protoPosition } as typeof e] }))).toEqual(reserved("__proto__"));
    expect(fromPublishedRun(run({ segments: [{ ...seg, segmentId: "__proto__" }, ...base.segments.slice(1)] }))).toEqual(reserved("__proto__"));
    expect(fromPublishedRun(run({ teams: [{ teamId: "constructor", name: "Alfa" }] }))).toEqual(reserved("constructor"));
    expect(fromPublishedRun(run({ events: [{ ...e, targetEventId: "prototype" }] }))).toEqual(reserved("prototype"));
  });

  it("refuses a run that covers more than 7 days, or carries a server time outside the years 2000 to 2100", () => {
    const base = runV1();
    const e = base.events[0]!;
    const DAY = 24 * 60 * MIN;
    expect(fromPublishedRun(run({ events: [e, { ...e, eventId: "late", seq: 9, clientTimeMs: e.clientTimeMs + 8 * DAY, serverTimeMs: e.serverTimeMs + 8 * DAY }] }))).toEqual({
      ok: false,
      reason: "The run covers more time than the replay can show (7 days at most).",
    });
    const outOfYears = { ok: false, reason: "The run has a server time outside the years 2000 to 2100." };
    expect(fromPublishedRun(run({ events: [{ ...e, serverTimeMs: 9e15 }] }))).toEqual(outOfYears);
    expect(fromPublishedRun(run({ plans: [{ ...base.plans[0]!, approvedAtMs: 0 }] }))).toEqual(outOfYears);
    expect(fromPublishedRun(run({ incident: { ...base.incident, priorBuiltAtMs: 4_200_000_000_000 } }))).toEqual(outOfYears);
  });

  it("refuses a run with more reports than the replay can check and show", () => {
    const base = runV1();
    const e = base.events[0]!;
    const events = Array.from({ length: MAX_RUN_EVENTS + 1 }, (_, k) => ({ ...e, eventId: `n${k}`, seq: k + 1 }));
    expect(fromPublishedRun(run({ events }))).toEqual({ ok: false, reason: `The run has more reports than the replay can show (${MAX_RUN_EVENTS} at most).` });
  });

  it("refuses a run whose engine settings fail on any frame, not only the last", () => {
    // Every clue is retracted later, so the last frame never uses them; the frames before it do.
    const retractions = Array.from({ length: 10 }, (_, k) =>
      runEvent(eventDoc({ eventId: `r${k}`, seq: 100 + k, type: "retraction", role: "command", teamId: null, deviceId: "cmd", clientTimeMs: T0 + (20 + k) * MIN, targetEventId: `c${k}`, effect: { kind: "none", why: "informational" } }), T0 + (20 + k) * MIN),
    );
    const r = fromPublishedRun(run({ incident: { ...runV1().incident, engineParams: overflowing() }, events: [...tenClues(), ...retractions] }));
    expect(r).toEqual({ ok: false, reason: "The run's engine settings cannot be used." });
  });

  it("refuses engine settings of the right shape that it cannot compute with", () => {
    expect(fromPublishedRun(run({ incident: { ...runV1().incident, engineParams: overflowing() }, events: tenClues() }))).toEqual({
      ok: false,
      reason: "The run's engine settings cannot be used.",
    });
  });

  it("refuses engine settings that are not exactly the engine's own shape", () => {
    const wrong = { ok: false, reason: "The run has a field of the wrong type: incident.engineParams." };
    expect(fromPublishedRun(run({ incident: { ...runV1().incident, engineParams: {} as never } }))).toEqual(wrong);
    expect(fromPublishedRun(run({ incident: { ...runV1().incident, engineParams: { ...DEFAULT_PARAMS, note: "x" } as never } }))).toEqual(wrong);
    const textIn = { ...DEFAULT_PARAMS, iocBase: { ...DEFAULT_PARAMS.iocBase, for: "high" } };
    expect(fromPublishedRun(run({ incident: { ...runV1().incident, engineParams: textIn as never } }))).toEqual({
      ok: false,
      reason: "The run has a field of the wrong type: incident.engineParams.iocBase.for.",
    });
    expect(fromPublishedRun(run({ incident: { ...runV1().incident, engineParams: DEFAULT_PARAMS } })).ok).toBe(true);
  });

  it("reads measurement rows of the exact shape and refuses anything else", () => {
    const row = { eventId: "e1", deviceId: "device-1", teamId: "alfa", submittedAtMs: T0, readDoneAtMs: T0 + 900, redrawnAtMs: T0 + 1_000 };
    expect(fromPublishedRun(run({ measurements: [row] })).ok).toBe(true);
    const wrong = { ok: false, reason: "The run has a field of the wrong type: measurements." };
    for (const measurements of [{}, [{ ...row, note: "x" }], [{ ...row, deviceId: "d1" }], [{ ...row, readDoneAtMs: "soon" }]]) {
      expect(fromPublishedRun(run({ measurements: measurements as never })), JSON.stringify(measurements)).toEqual(wrong);
    }
  });

  it("names the contract version it reads", () => {
    expect(PUBLISHED_RUN_VERSION).toBe(1);
  });
});

describe("lastReportRoute", () => {
  const cloud = { platform: "web", path: "cloud", stage: "sdk", model: "gemini-3.5-flash-lite", reason: "consented_cloud_read", latencyMs: 1577, sdkReported: true, blocked: null, decidedAtMs: T0 };
  // Each route goes in as a public run carries it and through the run reader, so the line shows only what it checked.
  const lineFor = (route: unknown) => {
    const read = fromPublishedRun(run({ events: [{ ...runEvent(eventDoc({ eventId: "e" }), T0), route } as never] }));
    if (!read.ok) throw new Error(read.reason);
    return lastReportRoute(read.data.events);
  };

  it("a cloud read says so and names its model", () => {
    expect(lineFor(cloud)).toBe("Read in the cloud, model gemini-3.5-flash-lite");
  });

  it("a read on a phone's own model says so and names the model", () => {
    expect(lineFor({ ...cloud, platform: "ios", path: "on_device", stage: "guided", model: "apple-foundation-model", reason: "on_device_default" })).toBe(
      "Read on the phone, model apple-foundation-model",
    );
    expect(lineFor({ ...cloud, platform: "android", path: "on_device", model: "gemini-nano (ML Kit Prompt API)", reason: "on_device_default" })).toBe(
      "Read on the phone, model gemini-nano (ML Kit Prompt API)",
    );
  });

  it("a read on the browser's own model is on the laptop, not a phone", () => {
    expect(lineFor({ ...cloud, path: "on_device", model: "chrome-built-in", reason: "sdk_prefer_on_device" })).toBe("Read on the laptop, model chrome-built-in");
  });

  it("a rules route says no model ran, whatever placeholder its model field holds", () => {
    expect(lineFor({ ...cloud, path: "rules", stage: "picklist", model: "none", reason: "on_device_default", sdkReported: false })).toBe("Rules, no model");
  });

  it("an unknown route, or a report with no route, says the route was not reported", () => {
    // Where an unknown read ran is not known, so neither is which model read it.
    expect(lineFor({ ...cloud, path: "unknown" })).toBe("Route not reported");
    expect(lineFor(null)).toBe("Route not reported");
  });

  it("names a model only when the route reports one", () => {
    expect(lineFor({ ...cloud, model: "" })).toBe("Read in the cloud");
    expect(lineFor({ ...cloud, model: "  " })).toBe("Read in the cloud");
  });

  it("describes the latest report at that time, not command's confirmation of it", () => {
    const report = eventDoc({ eventId: "s1", type: "sighting", clientTimeMs: T0 + MIN, route: cloud as EventDoc["route"] });
    const confirm = eventDoc({ eventId: "c1", type: "confirmation", clientTimeMs: T0 + 2 * MIN, targetEventId: "s1", decision: "confirmed", effect: { kind: "none", why: "informational" } });
    const data = fromLive(replayView(), [streamed(report, T0 + MIN), streamed(confirm, T0 + 2 * MIN)], [])!;
    expect(lastReportRoute(data.events)).toBe("Read in the cloud, model gemini-3.5-flash-lite");
    expect(lastReportRoute(data.events.filter((e) => e.type === "confirmation"))).toBeNull();
    expect(lastReportRoute([])).toBeNull();
  });

  it("a live route the run reader would refuse is not reported, not shown", () => {
    const odd = eventDoc({ eventId: "s1", type: "sighting", clientTimeMs: T0 + MIN, route: { ...cloud, path: "satellite" } as never });
    const data = fromLive(replayView(), [streamed(odd, T0 + MIN)], [])!;
    expect(lastReportRoute(data.events)).toBe("Route not reported");
  });
});

describe("runCarriesRoutes", () => {
  const cloud = { platform: "web", path: "cloud", stage: "sdk", model: "gemini-3.5-flash-lite", reason: "consented_cloud_read", latencyMs: 1577, sdkReported: true, blocked: null, decidedAtMs: T0 };
  const read = (events: unknown[]) => {
    const r = fromPublishedRun(run({ events: events as never }));
    if (!r.ok) throw new Error(r.reason);
    return r.data;
  };

  // The published development run records no route on any report: a line saying "Route not reported" at every step
  // would read as a broken feature, so the panel shows none.
  it("a run whose events all have route null carries no route", () => {
    const events = ["a", "b", "c"].map((id, i) => runEvent(eventDoc({ eventId: id, clientTimeMs: T0 + i * MIN }), T0 + i * MIN));
    expect(events.every((e) => e.route === null)).toBe(true);
    expect(runCarriesRoutes(read(events).events)).toBe(false);
  });

  it("one report with a route is enough, wherever it falls in the run", () => {
    const events = ["a", "b", "c"].map((id, i) => runEvent(eventDoc({ eventId: id, clientTimeMs: T0 + i * MIN }), T0 + i * MIN));
    expect(runCarriesRoutes(read([...events.slice(0, 2), { ...events[2]!, route: cloud }]).events)).toBe(true);
  });

  it("a live route the reader would refuse does not count as one", () => {
    const odd = eventDoc({ eventId: "s1", type: "sighting", clientTimeMs: T0 + MIN, route: { ...cloud, path: "satellite" } as never });
    expect(runCarriesRoutes(fromLive(replayView(), [streamed(odd, T0 + MIN)], [])!.events)).toBe(false);
  });
});
