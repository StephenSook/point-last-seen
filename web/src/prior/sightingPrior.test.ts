import { buildPrior, DEFAULT_PARAMS, toEngineEvents } from "@pls/engine";
import { describe, expect, it } from "vitest";
import type { SegmentDoc } from "../data/incident";
import { buildConfirmation, buildSightingEvent, type SightingInput } from "../data/sightings";
import { gridFromDocs } from "./rebuild";
import { sightingBearingDeg, sightingConfirmWrites, sightingNewLkp, sightingSeenBeforeStart } from "./sightingPrior";

// A synthetic 3 x 3 grid of 125 m cells around a made-up start point.
const IPP = { lat: 33.78, lon: -84.38 };
const D_LAT = 125 / 111_320;
const D_LON = 125 / (111_320 * Math.cos((IPP.lat * Math.PI) / 180));
const SEGS: SegmentDoc[] = Array.from({ length: 9 }, (_, i) => {
  const [r, c] = [Math.floor(i / 3) - 1, (i % 3) - 1];
  const [s, w] = [IPP.lat + (r - 0.5) * D_LAT, IPP.lon + (c - 0.5) * D_LON];
  return {
    segmentId: String.fromCharCode(65 + r + 1) + String.fromCharCode(65 + c + 1),
    geometry: { type: "Polygon", coordinates: [[[w, s], [w + D_LON, s], [w + D_LON, s + D_LAT], [w, s + D_LAT], [w, s]]] },
    centroid: { lat: s + D_LAT / 2, lon: w + D_LON / 2 },
    areaM2: 125 * 125, priorPoa: 0.05, neighbors: [], upstream: [], downstream: [],
  };
});
// The north-east corner cell, CC: far from the start point at BB.
const SEEN_AT = { lat: IPP.lat + D_LAT, lon: IPP.lon + D_LON };
const T0 = Date.UTC(2026, 10, 22, 15, 0);
const writer = { incidentId: "i", uid: "u1", seq: 3, clientTimeMs: T0, priorVersion: 7, segments: SEGS };
const incident = { gridId: "synthetic", gridAttribution: "a", ipp: IPP, terrain: "temperate_flat" as const, priorLayers: { linear: false, wedge: false }, priorVersion: 7, priorInputEventIds: ["x"] };
const input = (over: Partial<SightingInput>): SightingInput => ({
  observedAtMs: T0 - 10 * 60_000, position: SEEN_AT, direction: "unknown", topColor: "unknown", bottomColor: "unknown",
  footwear: "", carried: "", reportedBy: "stranger", freeText: "Seen by the gate", ...over,
} as SightingInput);

// The prior's one input so far: a sighting seen an hour before T0, loaded with the incident's events.
const PREV = { ...buildSightingEvent(input({ observedAtMs: T0 - 60 * 60_000 }), writer), eventId: "x" };

describe("sightingConfirmWrites: a confirmed sighting with a place is the new last known point", () => {
  it("rebuilds the ring prior from the sighting, adds it to the prior's inputs and raises the version", () => {
    const s = buildSightingEvent(input({}), writer);
    const { events, prior } = sightingConfirmWrites(s, { ...writer, seq: 4 }, SEGS, incident, [PREV]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "confirmation", decision: "confirmed", targetEventId: s.eventId, role: "command" });
    const direct = buildPrior(gridFromDocs(SEGS, "synthetic", "a"), SEEN_AT, "temperate_flat", { linear: false, wedge: false }, null, DEFAULT_PARAMS);
    expect(prior.segments.map((x) => x.data.priorPoa)).toEqual(direct.segments.map((x) => x.priorPoa));
    expect(prior.incident).toEqual({ priorLayers: { linear: false, wedge: false }, terrain: "temperate_flat", priorVersion: 8, priorModel: "rings", ipp: SEEN_AT, priorInputEventIds: ["x", s.eventId] });
  });

  it("puts the most probability at the sighting's own cell and less at the far corner", () => {
    const s = buildSightingEvent(input({}), writer);
    const { prior } = sightingConfirmWrites(s, { ...writer, seq: 4 }, SEGS, incident, [PREV]);
    const poa = Object.fromEntries(prior.segments.map((x) => [x.segmentId, x.data.priorPoa]));
    // Cells wholly inside the first ring tie; the sighting's cell is among the highest, the far corner is lower.
    expect(poa.CC!).toBeCloseTo(Math.max(...Object.values(poa)), 6);
    expect(poa.AA!).toBeLessThan(poa.CC!);
  });

  it("turns the direction-of-travel wedge on when the sighting gives a compass direction", () => {
    const s = buildSightingEvent(input({ direction: "ne" }), writer);
    expect(sightingBearingDeg(s)).toBe(45);
    const { prior } = sightingConfirmWrites(s, { ...writer, seq: 4 }, SEGS, incident, [PREV]);
    expect(prior.incident.priorLayers).toEqual({ linear: false, wedge: true });
    expect(sightingBearingDeg(buildSightingEvent(input({ direction: "downstream" }), writer))).toBeNull();
  });

  it("is not used again as a clue once it is a prior input", () => {
    const s = buildSightingEvent(input({}), writer);
    const conf = buildConfirmation(s, "confirmed", { ...writer, seq: 4 });
    expect(toEngineEvents([s, conf], [s.eventId]).map((e) => e.eventId)).not.toContain(s.eventId);
  });
});

describe("sightingNewLkp: which confirmed sightings move the start point", () => {
  it("needs a place, a time seen and not already being a prior input", () => {
    const s = buildSightingEvent(input({}), writer);
    expect(sightingNewLkp(s, ["x"], [PREV])).toBe(true);
    expect(sightingNewLkp(s, ["x", s.eventId], [PREV, s])).toBe(false);
    const noPlace = buildSightingEvent(input({ position: null }), writer);
    expect(sightingNewLkp(noPlace, ["x"], [PREV])).toBe(false);
    expect(() => sightingConfirmWrites(noPlace, writer, SEGS, incident, [PREV])).toThrow(/no place/);
  });

  // Command confirms in the order reports are reviewed, not the order they were seen.
  it("moves the start only for a sighting seen later than every prior input: 14:00 then 13:30", () => {
    const h = (hh: number, mm: number) => Date.UTC(2026, 10, 22, hh, mm);
    const at14 = { ...buildSightingEvent(input({ observedAtMs: h(14, 0) }), writer), eventId: "at14" };
    const at1330 = buildSightingEvent(input({ observedAtMs: h(13, 30) }), { ...writer, seq: 5 });
    const at1400 = buildSightingEvent(input({ observedAtMs: h(14, 0) }), { ...writer, seq: 6 });
    const at1430 = buildSightingEvent(input({ observedAtMs: h(14, 30) }), { ...writer, seq: 7 });
    const events = [at14, at1330, at1400, at1430];
    expect(sightingNewLkp(at1330, ["at14"], events)).toBe(false);
    expect(sightingNewLkp(at1400, ["at14"], events)).toBe(false);
    expect(sightingNewLkp(at1430, ["at14"], events)).toBe(true);
    expect(sightingSeenBeforeStart(at1330, ["at14"], events)).toBe(true);
    expect(sightingSeenBeforeStart(at1430, ["at14"], events)).toBe(false);
    expect(() => sightingConfirmWrites(at1330, writer, SEGS, { ...incident, priorInputEventIds: ["at14"] }, events)).toThrow(/not seen after/);
  });

  it("counts a camera input's seen time too", () => {
    const cam = { ...PREV, eventId: "cam", type: "camera_sighting", observedAtMs: T0 } as typeof PREV;
    const older = buildSightingEvent(input({ observedAtMs: T0 - 5 * 60_000 }), writer);
    expect(sightingNewLkp(older, ["x", "cam"], [PREV, cam, older])).toBe(false);
  });

  it("refuses to decide while a prior input is not loaded, so nothing is written on a partial list", () => {
    const s = buildSightingEvent(input({}), writer);
    expect(() => sightingNewLkp(s, ["x", "not-loaded"], [PREV, s])).toThrow(/still loading/);
    expect(sightingSeenBeforeStart(s, ["x", "not-loaded"], [PREV, s])).toBe(false);
  });

  it("with no prior inputs yet (a new practice search), any sighting with a place and a time moves the start", () => {
    const s = buildSightingEvent(input({}), writer);
    expect(sightingNewLkp(s, [], [s])).toBe(true);
    expect(sightingSeenBeforeStart(s, [], [s])).toBe(false);
  });
});
