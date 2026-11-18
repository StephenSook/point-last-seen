import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMS, assignTeams, malformedEventIds, convergenceCode, deriveClearedEffect, eventSetHash, normalizeCoverage, posterior,
  rankSegments, toEngineEvents, validateReading,
} from "../src/index";
import type { EngineEvent, EngineParams, EventDoc, ReportReading, EffectContext, SegmentPrior } from "../src/index";
import { expectVector, VectorMismatch } from "./expectVector";

const params: EngineParams = DEFAULT_PARAMS;
const prior: SegmentPrior[] = [
  { segmentId: "AA", priorPoa: 0.4 }, { segmentId: "AB", priorPoa: 0.3 }, { segmentId: "AC", priorPoa: 0.2 }, { segmentId: "ROW", priorPoa: 0.1 },
];
const cleared = (segmentId: string, p: number) => ({
  kind: "cleared" as const, segmentId, pod: p,
  inputs: { coverage: -Math.log(1 - p), sweepWidthM: null, trackLengthM: null, areaM2: 15625, rdBasis: "open_target" as const },
});
const e1: EngineEvent = { eventId: "0".repeat(31) + "1", effect: cleared("AB", 0.5) };
const clearA: EngineEvent = { eventId: "0".repeat(31) + "2", effect: cleared("AA", 0.6) };
const ids = ["c".repeat(32), "a".repeat(32), "b".repeat(32)];

const raw = "Cleared AA, eighty percent coverage, three of us for 45 minutes";
const ok: ReportReading = {
  kind: "cleared", segmentIds: ["AA"], method: "visual", coverage: 0.8, minutes: 45, searchers: 3, searchType: "sweep",
  detectionRangeM: null, item: "", feature: "none", direction: "unknown", topColor: "unknown", bottomColor: "unknown",
  footwear: "", carried: "", matchesProfile: "unknown", evidenceQuote: "eighty percent coverage",
};
const ctx: EffectContext = {
  segments: { AA: { areaM2: 15625, neighbors: [], upstream: [], downstream: [] } },
  assignedSegmentIds: ["AA"], visualDetectionRangeM: 10, rdBasis: "open_target", position: null, positionSegmentId: null,
};

function doc(id: string, type: EventDoc["type"], effect: EventDoc["effect"], extra: Partial<EventDoc> = {}): EventDoc {
  return {
    eventId: id, schemaVersion: 1, incidentId: "I1", teamId: null, deviceId: "d", seq: 1, authorUid: "u", role: "family",
    type, reporter: "camera", clientTimeMs: 1, serverTime: null, observedAtMs: null, position: null, positionSource: "camera_pin",
    rawText: null, inputMethod: "clip", isTrainingInject: false, reading: null, effect, route: null, targetEventId: null,
    decision: null, planVersion: null, priorVersion: 1, ...extra,
  };
}
const cam = doc("d".repeat(32), "camera_sighting", { kind: "none", why: "incorporated_in_prior" });
const confirm = (target: string) => doc("e".repeat(32), "confirmation", { kind: "none", why: "informational" },
  { role: "command", reporter: "system", targetEventId: target, decision: "confirmed", clientTimeMs: 2 });

describe("engine behaviour", () => {
  it("expectVector is exact for strings and tolerant for numbers", () => {
    expect(() => expectVector({ kind: "none", why: "invalid" }, { kind: "none", why: "sound_only" })).toThrow(VectorMismatch);
    expect(() => expectVector({ a: 1 + 1e-14 }, { a: 1 })).not.toThrow();
    expect(() => expectVector({ a: 1 }, { a: 1, b: 2 })).toThrow();
    expect(() => expectVector({ a: undefined }, {})).toThrow();
  });
  it("posterior ignores duplicate eventIds", () => {
    expect(posterior(prior, [e1, { ...e1 }], params).poa).toEqual(posterior(prior, [e1], params).poa);
  });
  it("ROW keeps its share of mass through a clear", () => {
    expect(posterior(prior, [clearA], params).poa.ROW).toBeGreaterThan(prior.find(p => p.segmentId === "ROW")!.priorPoa);
  });
  it("eventSetHash changes with priorVersion", () => {
    expect(eventSetHash(1, ids)).not.toBe(eventSetHash(2, ids));
    expect(eventSetHash(1, ids)).toBe(eventSetHash(1, [...ids].reverse()));
    expect(convergenceCode(eventSetHash(1, ids))).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/);
  });
  it("validateReading accepts a sound reading", () => {
    expect(validateReading(ok, ["AA"], raw)).toEqual({ ok: true });
  });
  it("validateReading rejects unknown segment ids and out-of-range values", () => {
    expect(validateReading({ ...ok, segmentIds: ["ZZ"] }, ["AA"], raw).ok).toBe(false);
    expect(validateReading({ ...ok, coverage: Number.NaN }, ["AA"], raw).ok).toBe(false);
    expect(validateReading({ ...ok, evidenceQuote: "not in the text" }, ["AA"], raw).ok).toBe(false);
    expect(validateReading({ ...ok, segmentIds: ["AA", "AA", "AA", "AA"] }, ["AA"], raw).ok).toBe(false);
    expect(validateReading({ ...ok, coverage: 400 }, ["AA"], raw).ok).toBe(false);
    expect(validateReading({ ...ok, detectionRangeM: 0.5 }, ["AA"], raw).ok).toBe(false);
    expect(validateReading({ ...ok, detectionRangeM: 150 }, ["AA"], raw).ok).toBe(false);
    expect(validateReading({ ...ok, minutes: 0 }, ["AA"], raw).ok).toBe(false);
    expect(validateReading({ ...ok, searchers: 0.5 }, ["AA"], raw).ok).toBe(false);
    expect(validateReading({ ...ok, item: "x".repeat(41) }, ["AA"], raw).ok).toBe(false);
    expect(validateReading({ ...ok, kind: "maybe" } as unknown as ReportReading, ["AA"], raw).ok).toBe(false);
    expect(validateReading({ ...ok, topColor: "teal" } as unknown as ReportReading, ["AA"], raw).ok).toBe(false);
  });
  it("validateReading names every reason", () => {
    const r = validateReading({ ...ok, segmentIds: ["ZZ"], minutes: -1 }, ["AA"], raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.length).toBe(2);
  });
  it("normalizes a percentage to a ratio", () => {
    expect(normalizeCoverage(80)).toBe(0.8); expect(normalizeCoverage(0.8)).toBe(0.8); expect(normalizeCoverage(150)).toBe(1.5);
    expect(normalizeCoverage(400)).toBe("invalid"); expect(normalizeCoverage(-1)).toBe("invalid");
    expect(normalizeCoverage(null)).toBe(null); expect(normalizeCoverage(Number.POSITIVE_INFINITY)).toBe("invalid");
  });
  it("a sound-only clear is not counted", () => {
    expect(deriveClearedEffect({ ...ok, method: "sound" }, ctx, { ...params, detectionProfile: { soundCounts: false } }))
      .toEqual({ kind: "none", why: "sound_only" });
  });
  it("a confirmed camera sighting leaves the posterior equal to the prior", () => {
    expect(posterior(prior, toEngineEvents([cam, confirm(cam.eventId)], [cam.eventId]), params).poa)
      .toEqual(posterior(prior, [], params).poa);
  });
  it("assignTeams is greedy, stable and gives one segment per team", () => {
    const rank = rankSegments(posterior(prior, [], params), prior);
    const out = assignTeams(rank, ["T1", "T2"], [{ teamId: "T1", segmentIds: [rank[1]!.segmentId] }]);
    expect(out.find(a => a.teamId === "T1")!.segmentIds).toEqual([rank[1]!.segmentId]);
    expect(out.find(a => a.teamId === "T2")!.segmentIds).toEqual([rank[0]!.segmentId]);
  });
  it("assignTeams moves a team whose segment left the top 2 x teamCount", () => {
    const wide: SegmentPrior[] = ["AA", "AB", "AC", "AD", "AE"].map((s, i) => ({ segmentId: s, priorPoa: (5 - i) / 15 }));
    const rank = rankSegments(posterior(wide, [], params), wide);
    const out = assignTeams(rank, ["T1"], [{ teamId: "T1", segmentIds: ["AE"] }]);
    expect(out).toEqual([{ teamId: "T1", segmentIds: ["AA"] }]);
  });
  it("assignTeams gives a shared current segment to the first team only, and an empty list when none is left", () => {
    const small: SegmentPrior[] = [{ segmentId: "AA", priorPoa: 0.9 }, { segmentId: "ROW", priorPoa: 0.1 }];
    const rank = rankSegments(posterior(small, [], params), small);
    const out = assignTeams(rank, ["T1", "T2"], [{ teamId: "T1", segmentIds: ["AA"] }, { teamId: "T2", segmentIds: ["AA"] }]);
    expect(out).toEqual([{ teamId: "T1", segmentIds: ["AA"] }, { teamId: "T2", segmentIds: [] }]);
  });
  it("malformedEventIds names stored events whose effect is malformed, once each, sorted", () => {
    const bad = doc("f".repeat(32), "cleared", { kind: "cleared", segmentId: "AB", pod: 0.5 } as never);
    const good = doc("1".repeat(32), "found", { kind: "none", why: "informational" });
    expect(malformedEventIds([bad, good, { ...bad }])).toEqual(["f".repeat(32)]);
    expect(malformedEventIds([good])).toEqual([]);
  });
});
