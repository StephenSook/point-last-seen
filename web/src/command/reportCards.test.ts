import { describe, expect, it } from "vitest";
import type { EventDoc } from "@pls/engine";
import { reportCards } from "./reportCards";

let n = 0;
function ev(over: Partial<EventDoc>): EventDoc {
  n++;
  return {
    eventId: n.toString(16).padStart(32, "0"), schemaVersion: 1, incidentId: "I1", teamId: "T1", deviceId: "s1", seq: n, authorUid: "s1", role: "searcher",
    type: "clue", reporter: "searcher", clientTimeMs: 1000 + n, serverTime: null, observedAtMs: null, position: null,
    positionSource: "none", rawText: "Glove by the creek", inputMethod: "typed", isTrainingInject: false, reading: null,
    effect: { kind: "clue", influences: { AA: "strong_for" }, authenticity: "medium" }, route: null, targetEventId: null, decision: null, planVersion: null, priorVersion: 1,
    ...over,
  };
}
const retract = (target: EventDoc, by: { role: EventDoc["role"]; authorUid: string }) =>
  ev({ type: "retraction", role: by.role, authorUid: by.authorUid, deviceId: by.authorUid, targetEventId: target.eventId, effect: { kind: "none", why: "informational" }, rawText: null });

describe("reportCards: every report command can retract, newest first", () => {
  it("lists clues, sightings, camera sightings, cleared and found reports, and nothing else", () => {
    const docs = ["clue", "sighting", "camera_sighting", "cleared", "found", "confirmation", "plan_ack", "destination", "retraction"].map((type) => ev({ type: type as EventDoc["type"] }));
    expect(reportCards(docs, []).map((c) => c.report.type)).toEqual(["found", "cleared", "camera_sighting", "sighting", "clue"]);
  });

  it("marks a report retracted by command, or by its own author, by the same rule the map uses", () => {
    const a = ev({}), b = ev({}), c = ev({});
    const cards = reportCards([a, b, c, retract(a, { role: "command", authorUid: "cmd" }), retract(b, { role: "searcher", authorUid: "s1" }), retract(c, { role: "searcher", authorUid: "someone-else" })], []);
    const by = Object.fromEntries(cards.map((x) => [x.report.eventId, x.retractedBy]));
    expect(by[a.eventId]).toBe("command");
    expect(by[b.eventId]).toBe("author");
    // A retraction by anyone else does not count (the map ignores it too).
    expect(by[c.eventId]).toBeNull();
  });

  it("says which report set the current start point", () => {
    const s = ev({ type: "sighting" }), other = ev({ type: "sighting" });
    const cards = reportCards([s, other], [s.eventId]);
    expect(cards.find((x) => x.report.eventId === s.eventId)!.startPoint).toBe(true);
    expect(cards.find((x) => x.report.eventId === other.eventId)!.startPoint).toBe(false);
  });

  it("lists each report once, and a family report command placed only as command's placement", () => {
    const fam = ev({ type: "sighting", role: "family", teamId: null, authorUid: "fam" });
    const placed = ev({ type: "sighting", role: "command", teamId: null, authorUid: "cmd", targetEventId: fam.eventId });
    const dup = { ...fam };
    expect(reportCards([fam, dup, placed], []).map((c) => c.report.eventId)).toEqual([placed.eventId]);
  });
});
