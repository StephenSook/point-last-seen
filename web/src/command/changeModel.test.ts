import type { EventDoc, ReportReading } from "@pls/engine";
import { describe, expect, it } from "vitest";
import { changeModel } from "./changeModel";

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
    expect(m.banner).toBe("Slipper in water (training inject). AC 12% to 31%.");
    expect(m.announce).toBe("Segment AC. POA 31 percent, up 19, after report: slipper in water.");
  });

  it("says the map is unchanged for an event with no effect", () => {
    const m = changeModel(before, before, lowAuthClue);
    expect(m.changed).toEqual([]);
    expect(m.banner).toBe("Report logged. Map unchanged. Ask the team.");
  });

  it("leaves the rest-of-world mass out of the segment list", () => {
    expect(changeModel(before, after, clueEvent).changed.some((c) => c.segmentId === "ROW")).toBe(false);
  });

  it("says down for a drop", () => {
    const m = changeModel({ AA: 0.4, ROW: 0.6 }, { AA: 0.1, ROW: 0.9 }, event({ type: "cleared", reading: reading({ kind: "cleared", segmentIds: ["AA"] }) }));
    expect(m.banner).toBe("AA cleared. AA 40% to 10%.");
    expect(m.announce).toBe("Segment AA. POA 10 percent, down 30, after report: AA cleared.");
  });
});
