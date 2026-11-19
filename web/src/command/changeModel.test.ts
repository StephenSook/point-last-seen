import type { EventDoc, ReportReading } from "@pls/engine";
import { describe, expect, it } from "vitest";
import { changeModel, deltaLabel } from "./changeModel";

const reading = (r: Partial<ReportReading>): ReportReading => ({
  kind: "clue", segmentIds: [], method: "unknown", coverage: null, minutes: null, searchers: null, searchType: "unknown",
  detectionRangeM: null, item: "", feature: "none", direction: "unknown", topColor: "unknown", bottomColor: "unknown",
  footwear: "", carried: "", matchesProfile: "unknown", evidenceQuote: "", ...r,
});
const event = (e: Partial<EventDoc>): EventDoc => ({
  eventId: "e1", schemaVersion: 1, incidentId: "drill-dev-1", teamId: "T2", deviceId: "d", seq: 1, authorUid: "d", role: "searcher",
  type: "clue", reporter: "searcher", clientTimeMs: 0, serverTime: null, observedAtMs: null, position: null, positionSource: "none",
  rawText: null, inputMethod: "typed", isTrainingInject: false, reading: null, effect: { kind: "none", why: "informational" },
  route: null, targetEventId: null, decision: null, planVersion: null, priorVersion: 1, ...e,
});

const before = { AA: 0.3, AB: 0.25, AC: 0.12, AD: 0.08, ROW: 0.25 };
const after = { AA: 0.22, AB: 0.21, AC: 0.31, AD: 0.07, ROW: 0.19 };
const clueEvent = event({
  isTrainingInject: true,
  reading: reading({ item: "slipper", feature: "water" }),
  effect: { kind: "clue", influences: { AC: "strong_for" }, authenticity: "high" },
});
const lowAuthClue = event({ reading: reading({ item: "wrapper" }), effect: { kind: "clue", influences: {}, authenticity: "low" } });

describe("changeModel", () => {
  it("lists changed segments, largest first", () => {
    const m = changeModel(before, after, clueEvent);
    expect(m.changed[0]).toEqual({ segmentId: "AC", fromPct: 12, toPct: 31, deltaPts: 19 });
    expect(m.changed.map((c) => c.segmentId)).toEqual(["AC", "AA", "AB", "AD"]);
    expect(m.banner).toBe("Slipper in water (training inject). AC 12.0% to 31.0%.");
    expect(m.announce).toBe("Segment AC. POA 31.0 percent, up 19.0, after report: slipper in water.");
  });

  it("says the map is unchanged for an event with no effect", () => {
    const m = changeModel(before, before, lowAuthClue);
    expect(m.changed).toEqual([]);
    expect(m.banner).toBe("Report logged. Map unchanged. Ask the team.");
  });

  it("points at Confirm for a sighting that moves the map only once confirmed", () => {
    const sighting = event({ type: "sighting", effect: { kind: "clue", influences: { AC: "strong_for" }, authenticity: "medium" } });
    const m = changeModel(before, before, sighting);
    expect(m.changed).toEqual([]);
    expect(m.banner).toBe("Sighting saved. Confirm it under Sightings to move the map.");
    expect(m.announce).toBe("Sighting saved. Confirm it under Sightings to move the map.");
    // A low-likelihood sighting never moves the map, confirmed or not.
    const low = event({ type: "sighting", effect: { kind: "clue", influences: {}, authenticity: "low" } });
    expect(changeModel(before, before, low).banner).toBe("Report logged. Map unchanged. Ask the team.");
  });

  it("leaves the rest-of-world mass out of the segment list", () => {
    expect(changeModel(before, after, clueEvent).changed.some((c) => c.segmentId === "ROW")).toBe(false);
  });

  it("says down for a drop", () => {
    const m = changeModel({ AA: 0.4, ROW: 0.6 }, { AA: 0.1, ROW: 0.9 }, event({ type: "cleared", reading: reading({ kind: "cleared", segmentIds: ["AA"] }) }));
    expect(m.banner).toBe("AA cleared. AA 40.0% to 10.0%.");
    expect(m.announce).toBe("Segment AA. POA 10.0 percent, down 30.0, after report: AA cleared.");
  });

  it("uses the table's precision (one decimal), so a small move reads the same in the line, the chip and the table", () => {
    const m = changeModel({ AC: 0.014, ROW: 0.986 }, { AC: 0.018, ROW: 0.982 }, clueEvent);
    expect(m.changed).toEqual([{ segmentId: "AC", fromPct: 1.4, toPct: 1.8, deltaPts: 0.4 }]);
    expect(m.banner).toBe("Slipper in water (training inject). AC 1.4% to 1.8%.");
    expect(deltaLabel(m.changed[0]!.deltaPts)).toBe("+0.4 pts");
    // A move under a tenth of a point is no move at that precision.
    expect(changeModel({ AC: 0.0141 }, { AC: 0.0142 }, clueEvent).changed).toEqual([]);
  });

  it("names a confirmation and a withdrawal, never a bare report", () => {
    const confirm = event({ type: "confirmation", role: "command", decision: "confirmed", targetEventId: "s1" });
    expect(changeModel(before, after, confirm).announce).toBe("Segment AC. POA 31.0 percent, up 19.0, after report: sighting confirmed.");
    expect(changeModel(before, after, event({ type: "confirmation", decision: "rejected", targetEventId: "s1" })).banner).toBe("Sighting rejected. AC 12.0% to 31.0%.");
    expect(changeModel(before, after, event({ type: "retraction", targetEventId: "s1" })).banner).toBe("Report withdrawn. AC 12.0% to 31.0%.");
  });
});

describe("deltaLabel", () => {
  it("prints signed percentage points with plain ASCII signs", () => {
    expect(deltaLabel(19)).toBe("+19.0 pts");
    expect(deltaLabel(-8)).toBe("-8.0 pts");
    expect(deltaLabel(0.4)).toBe("+0.4 pts");
    expect(deltaLabel(1)).toBe("+1.0 pt");
  });
});
