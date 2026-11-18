import { describe, expect, it } from "vitest";
import type { EventDoc } from "@pls/engine";
import { sightingCards } from "./sightingCards";

let n = 0;
function ev(over: Partial<EventDoc>): EventDoc {
  n++;
  return {
    eventId: n.toString(16).padStart(32, "0"), schemaVersion: 1, incidentId: "I1", teamId: null, deviceId: "u", seq: n, authorUid: "u", role: "command",
    type: "sighting", reporter: "public_caller", clientTimeMs: 1000 + n, serverTime: null, observedAtMs: 900, position: { lat: 1, lon: 1, accuracyM: null },
    positionSource: "map_click", rawText: null, inputMethod: "picklist", isTrainingInject: false, reading: null,
    effect: { kind: "clue", influences: { AA: "strong_for" }, authenticity: "medium" }, route: null, targetEventId: null, decision: null, planVersion: null, priorVersion: 1,
    ...over,
  };
}
const decide = (target: EventDoc, decision: "confirmed" | "rejected", role: "command" | "family" = "command", t = 5000) =>
  ev({ type: "confirmation", role, targetEventId: target.eventId, decision, clientTimeMs: t, effect: { kind: "none", why: "informational" }, position: null, positionSource: "none" });

describe("sightingCards", () => {
  it("lists each sighting once, newest seen first, awaiting a decision", () => {
    const a = ev({ observedAtMs: 100 }), b = ev({ observedAtMs: 200 });
    expect(sightingCards([a, b, { ...a }]).map((c) => [c.sighting.eventId, c.status])).toEqual([[b.eventId, "awaiting"], [a.eventId, "awaiting"]]);
  });

  it("the latest command decision wins, and outranks a family decision", () => {
    const s = ev({});
    expect(sightingCards([s, decide(s, "confirmed", "command", 10), decide(s, "rejected", "command", 20)])[0]!.status).toBe("rejected");
    expect(sightingCards([s, decide(s, "confirmed", "command", 10), decide(s, "rejected", "family", 20)])[0]!.status).toBe("confirmed");
    expect(sightingCards([s, decide(s, "confirmed", "family", 10)])[0]!.status).toBe("confirmed");
  });

  it("ignores a searcher's confirmation", () => {
    const s = ev({});
    expect(sightingCards([s, decide(s, "confirmed", "searcher" as "command")])[0]!.status).toBe("awaiting");
  });

  it("flags a sighting with no place, and one outside the search area", () => {
    const unplaced = ev({ position: null, positionSource: "none", effect: { kind: "none", why: "needs_command" } });
    const outside = ev({ effect: { kind: "none", why: "outside_area" } });
    const cards = sightingCards([unplaced, outside]);
    expect(cards.find((c) => c.sighting.eventId === unplaced.eventId)).toMatchObject({ needsPlace: true, outside: false });
    expect(cards.find((c) => c.sighting.eventId === outside.eventId)).toMatchObject({ needsPlace: false, outside: true });
  });

  it("a retracted sighting is not listed", () => {
    const s = ev({});
    expect(sightingCards([s, ev({ type: "retraction", targetEventId: s.eventId, effect: { kind: "none", why: "informational" } })])).toEqual([]);
  });
});
