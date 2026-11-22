import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "@pls/engine";
import { draftFacts } from "./draftFacts";
import { draftKeyOf } from "./WhatChanged";

const segments = [
  { segmentId: "AC", centroid: { lat: 34.0, lon: -84.0 }, featureClasses: ["trail" as const] },
  { segmentId: "AB", centroid: { lat: 34.0, lon: -84.02 } },
];
const changed = [
  { segmentId: "AC", fromPct: 10, toPct: 20, deltaPts: 10 },
  { segmentId: "AB", fromPct: 30, toPct: 25, deltaPts: -5 },
];

describe("the plan draft's facts, from what the command post already has", () => {
  it("marks searched from cumulative POD and raised only where the newest report raised a segment", () => {
    const f = draftFacts({ incident: { ipp: { lat: 34.0, lon: -84.0 } }, params: DEFAULT_PARAMS, segments, cumulativePod: { AB: 0.3 }, changed });
    expect(f.AC).toMatchObject({ featureClasses: ["trail"], searched: false, raisedByLastReport: true });
    expect(f.AB).toMatchObject({ featureClasses: [], searched: true, raisedByLastReport: false });
  });
  it("gives each segment its distance band from the last-seen point in the incident's terrain column, flat by default", () => {
    const flat = draftFacts({ incident: { ipp: { lat: 34.0, lon: -84.0 } }, params: DEFAULT_PARAMS, segments, cumulativePod: {}, changed: null });
    expect(flat.AB!.ring).toEqual({ innerKm: 1, outerKm: 2.4, fromPct: 50, toPct: 75 });
    const mountain = draftFacts({ incident: { ipp: { lat: 34.0, lon: -84.0 }, terrain: "temperate_mountain" }, params: DEFAULT_PARAMS, segments, cumulativePod: {}, changed: null });
    expect(mountain.AB!.ring).toEqual({ innerKm: 0.8, outerKm: 1.9, fromPct: 50, toPct: 75 });
  });
  it("gives no distance band without a last-seen point, or when the map uses the walker prior", () => {
    const none = draftFacts({ incident: {}, params: DEFAULT_PARAMS, segments, cumulativePod: {}, changed: null });
    expect(none.AC!.ring).toBeNull();
    const walkers = draftFacts({ incident: { ipp: { lat: 34.0, lon: -84.0 }, priorModel: "walkers" }, params: DEFAULT_PARAMS, segments, cumulativePod: {}, changed: null });
    expect(walkers.AC!.ring).toBeNull();
  });
});

describe("a suggestion belongs to the draft it was worded for, facts included", () => {
  const draft = {
    eventSetHash: "h", priorVersion: 1,
    rank: [{ segmentId: "AC", rank: 1, poa: 0.3, priorPoa: 0.2, deltaPoa: 0.1 }],
    assignments: [{ teamId: "T1", segmentIds: ["AC"] }],
    facts: { AC: { featureClasses: [], searched: false, raisedByLastReport: false, ring: null } },
  };
  it("changes when a segment's facts change, so a reason written from old facts is withdrawn", () => {
    const searched = { ...draft, facts: { AC: { ...draft.facts.AC, searched: true } } };
    expect(draftKeyOf(searched)).not.toBe(draftKeyOf(draft));
    expect(draftKeyOf({ ...draft })).toBe(draftKeyOf(draft));
    expect(draftKeyOf(null)).toBeNull();
  });
});
