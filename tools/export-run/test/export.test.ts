// The public run: built from a drill's stored docs, it must pass the reader's checks, and the checks must refuse a
// run that carries a uid or a home position.
import { describe, expect, it } from "vitest";
import { checkRun } from "../src/check";
import { AUTHOR_PSEUDONYM, DEVICE_PSEUDONYM, RUN_FIELDS } from "../src/contract";
import { toPublishedRun } from "../src/transform";
import { T0, UID_A, UID_B, event, grid, meta, rawDrill } from "./fixtures";

describe("toPublishedRun", () => {
  const run = toPublishedRun(rawDrill(), meta);
  it("passes the reader's checks", () => {
    expect(checkRun(run)).toEqual([]);
  });
  it("writes only the contract's fields at every level", () => {
    expect(Object.keys(run).sort()).toEqual([...RUN_FIELDS.run].sort());
    for (const k of Object.keys(run.incident)) expect(RUN_FIELDS.incident).toContain(k);
    for (const e of run.events) for (const k of Object.keys(e)) expect(RUN_FIELDS.event).toContain(k);
    expect(run.incident).not.toHaveProperty("ipp");
    expect(run.incident).not.toHaveProperty("joinCodeHash");
  });
  it("carries no uid: authors and devices are pseudonyms, the same in the events and the device table", () => {
    const text = JSON.stringify(run);
    expect(text).not.toContain(UID_A);
    expect(text).not.toContain(UID_B);
    for (const e of run.events) {
      expect(e.authorUid).toMatch(AUTHOR_PSEUDONYM);
      expect(e.deviceId).toMatch(DEVICE_PSEUDONYM);
    }
    expect(run.events[0]!.deviceId).toBe(run.devices.find(d => d.clockOffsetMs === -120)!.deviceId);
    expect(run.events[0]!.authorUid).toBe(run.events[2]!.authorUid);
    expect(run.devices.map(d => d.deviceId).sort()).toEqual(["device-1", "device-2"]);
  });
  it("drops report text, cuts a camera reading to its clock and times, and never places a destination", () => {
    for (const e of run.events) expect(e.rawText).toBeNull();
    expect(run.events[0]!.reading).toBeNull();
    expect(run.events[2]!.reading).toEqual({ clipStartMs: T0 - 3_600_000, clockConfirmed: true,
      sighting: { personVisible: true, firstSeen: "00:02", lastSeen: "00:09", keyFrame: { time: "00:05" } } });
    expect(run.events[1]!.type).toBe("destination");
    expect(run.events[1]!.position).toBeNull();
  });
  it("never places a camera: a camera pin is usually the family's home (review)", () => {
    expect(run.events[2]!.positionSource).toBe("camera_pin");
    expect(run.events[2]!.position).toBeNull();
    expect(run.events[0]!.position).toEqual({ lat: 33.786, lon: -84.373, accuracyM: 8 });
  });
  it("gives times as numbers: event server time, plan approval and the prior's build time", () => {
    expect(run.events.map(e => e.serverTimeMs)).toEqual([T0 + 900, T0 + 900, T0 + 900]);
    expect(run.plans[0]).toEqual({ version: 1, approvedAtMs: T0 - 30_000, priorVersion: 2, basedOnEventSetHash: "d".repeat(64),
      assignments: [{ teamId: "T1", segmentIds: ["AA"], taskText: "Sweep the creek bank.", reason: "High probability near water." }] });
    expect(run.incident.priorBuiltAtMs).toBe(T0 - 60_000);
    expect(run.segments.at(-1)).toEqual({ segmentId: "ROW", priorPoa: 0.4 });
  });
});

describe("checkRun refuses what must never be public", () => {
  it("a uid anywhere: a planted uid in a team name, a measurement or the run id", () => {
    const run = toPublishedRun(rawDrill(), meta);
    expect(checkRun({ ...run, teams: [{ teamId: "T1", name: UID_A }] })).not.toEqual([]);
    expect(checkRun({ ...run, measurements: [{ note: `by ${UID_B}` }] })).not.toEqual([]);
    expect(checkRun({ ...run, runId: `judge-${UID_A}` })).not.toEqual([]);
    expect(checkRun({ ...run, events: run.events.map((e, i) => (i === 0 ? { ...e, authorUid: UID_A } : e)) })).not.toEqual([]);
  });
  it("a planted camera position", () => {
    const run = toPublishedRun(rawDrill(), meta);
    const planted = run.events.map(e => (e.type === "camera_sighting" ? { ...e, position: { lat: 33.79, lon: -84.36, accuracyM: null } } : e));
    expect(checkRun({ ...run, events: planted })).not.toEqual([]);
  });
  it("a planted home position on a destination", () => {
    const run = toPublishedRun(rawDrill(), meta);
    const planted = run.events.map(e => (e.type === "destination" ? { ...e, position: { lat: 33.71, lon: -84.31, accuracyM: null } } : e));
    expect(checkRun({ ...run, events: planted })).not.toEqual([]);
  });
  it("report text, a full camera reading, or a field outside the contract", () => {
    const run = toPublishedRun(rawDrill(), meta);
    expect(checkRun({ ...run, events: run.events.map((e, i) => (i === 0 ? { ...e, rawText: "words" } : e)) })).not.toEqual([]);
    expect(checkRun({ ...run, events: run.events.map(e => (e.type === "camera_sighting"
      ? { ...e, reading: { ...e.reading!, sighting: { ...e.reading!.sighting, evidence: "red coat" } } } : e)) })).not.toEqual([]);
    expect(checkRun({ ...run, incident: { ...run.incident, ipp: { lat: 1, lon: 2 } } })).not.toEqual([]);
  });
  it("a report's reading never leaves, while its route (the read's provenance) does", () => {
    const route = { platform: "ios", path: "on_device", stage: "guided", model: "apple-on-device", reason: "on_device_default",
      latencyMs: 820, sdkReported: false, blocked: null, decidedAtMs: T0 };
    const reading = { kind: "sighting", segmentIds: ["AA"], method: "unknown", coverage: null, minutes: null, searchers: null,
      searchType: "unknown", detectionRangeM: null, item: "glove", feature: "trail", direction: "n", topColor: "red",
      bottomColor: "blue", footwear: "slippers", carried: "cane", matchesProfile: "consistent", evidenceQuote: "red coat by the trail" };
    const raw = rawDrill();
    raw.events[0] = event("a".repeat(32), UID_A, { type: "sighting", reading, route });
    const out = toPublishedRun(raw, meta);
    expect(out.events[0]!.reading).toBeNull();
    expect(out.events[0]!.route).toEqual(route);
    expect(checkRun(out)).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("red coat");
  });
  it("a planted evidenceQuote, or any reading content, on a report", () => {
    const run = toPublishedRun(rawDrill(), meta);
    expect(checkRun({ ...run, events: run.events.map((e, i) => (i === 0 ? { ...e, reading: { evidenceQuote: "red coat" } } : e)) }))
      .not.toEqual([]);
  });
  it("a raw device id in the device table", () => {
    const run = toPublishedRun(rawDrill(), meta);
    expect(checkRun({ ...run, devices: run.devices.map((d, i) => (i === 0 ? { ...d, deviceId: "phone-of-sam" } : d)) })).not.toEqual([]);
  });
});

describe("checkRun also holds the reader's shape and size rules (extras reader)", () => {
  const base = () => toPublishedRun(rawDrill(), meta);
  const withEvent = (run: ReturnType<typeof base>, i: number, over: Record<string, unknown>) =>
    ({ ...run, events: run.events.map((e, j) => (j === i ? { ...e, ...over } : e)) });
  it("engineParams in the engine's own shape, filled where the stored copy predates a field, or absent", async () => {
    const { DEFAULT_PARAMS } = await import("@pls/engine");
    const run = base();
    expect(Object.keys(run.incident.engineParams as object).sort()).toEqual(Object.keys(DEFAULT_PARAMS).sort());
    expect((run.incident.engineParams as { sweepWidthFactor: number }).sweepWidthFactor).toBe(1.645);
    expect(checkRun({ ...run, incident: { ...run.incident, engineParams: { sweepWidthFactor: 1.645 } } })).not.toEqual([]);
    const { engineParams: _p, ...noParams } = run.incident;
    expect(checkRun({ ...run, incident: noParams })).toEqual([]);
  });
  const ROUTE = { platform: "ios", path: "cloud", stage: "guided", model: "gemini-3.5-flash-lite", reason: "no_network",
    latencyMs: 1400, sdkReported: false, blocked: null, decidedAtMs: T0 };
  it("a route is an exact route record or null", () => {
    expect(checkRun(withEvent(base(), 0, { route: ROUTE }))).toEqual([]);
    expect(checkRun(withEvent(base(), 0, { route: null }))).toEqual([]);
    expect(checkRun(withEvent(base(), 0, { route: { ...ROUTE, extra: 1 } }))).not.toEqual([]);
    expect(checkRun(withEvent(base(), 0, { route: { platform: "web" } }))).not.toEqual([]);
  });
  it("a route carries only the route record's own values, so nothing from a note can ride in it", () => {
    expect(checkRun(withEvent(base(), 0, { route: { ...ROUTE, blocked: "guardrail" } }))).toEqual([]);
    for (const bad of [{ stage: "read" }, { reason: "consented" }, { path: "laptop" }, { platform: "watch" },
      { sdkReported: "in_cloud" }, { blocked: false }, { latencyMs: -1 }, { latencyMs: "fast" }, { decidedAtMs: "today" },
      { model: "x".repeat(81) }, { model: 7 }]) {
      expect(checkRun(withEvent(base(), 0, { route: { ...ROUTE, ...bad } })), JSON.stringify(bad)).not.toEqual([]);
    }
  });
  it("an effect has the engine's exact shape and names only exported segments", () => {
    const run = base(), seg = String(run.segments[0]!.segmentId);
    const cleared = { kind: "cleared", segmentId: seg, pod: 0.5, inputs: { coverage: 1, sweepWidthM: 20, trackLengthM: 1000, areaM2: 2e4, rdBasis: "measured" } };
    expect(checkRun(withEvent(run, 0, { effect: cleared }))).toEqual([]);
    expect(checkRun(withEvent(run, 0, { effect: { ...cleared, segmentId: "ZZ" } }))).not.toEqual([]);
    expect(checkRun(withEvent(run, 0, { effect: { ...cleared, extra: true } }))).not.toEqual([]);
    expect(checkRun(withEvent(run, 0, { effect: { kind: "clue", influences: { [seg]: "for" }, authenticity: "high" } }))).toEqual([]);
    expect(checkRun(withEvent(run, 0, { effect: { kind: "clue", influences: { ZZ: "for" }, authenticity: "high" } }))).not.toEqual([]);
    expect(checkRun(withEvent(run, 0, { effect: { kind: "none" } }))).not.toEqual([]);
  });
  it("no id may be __proto__, constructor or prototype", () => {
    const run = base();
    for (const id of ["__proto__", "constructor", "prototype"]) {
      expect(checkRun(withEvent(run, 0, { eventId: id }))).not.toEqual([]);
      expect(checkRun({ ...run, teams: [{ teamId: id, name: "Team" }] })).not.toEqual([]);
    }
  });
  it("server times lie between 2000 and 2100, within 7 days of each other, and there are at most 1,000 events", () => {
    const run = base();
    expect(checkRun(withEvent(run, 0, { serverTimeMs: Date.UTC(1999, 11, 31) }))).not.toEqual([]);
    expect(checkRun(withEvent(run, 0, { serverTimeMs: Date.UTC(2100, 0, 2) }))).not.toEqual([]);
    expect(checkRun(withEvent(run, 0, { serverTimeMs: T0 - 8 * 86_400_000 }))).not.toEqual([]);
    const many = Array.from({ length: 1001 }, (_, i) => ({ ...run.events[0]!, eventId: i.toString(16).padStart(32, "0") }));
    expect(checkRun({ ...run, events: many })).not.toEqual([]);
  });
});
