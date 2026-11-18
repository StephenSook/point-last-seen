import { describe, expect, it } from "vitest";
import { eventId, toEngineEvents } from "@pls/engine";
import type { GridSegmentDoc } from "../map/geo";
import { buildConfirmation, buildSightingEvent, removePhoneNumbers, useAsStartPoint, type CommandWriter, type SightingInput } from "./sightings";

const sq = (lon: number, lat: number) => ({ type: "Polygon" as const, coordinates: [[[lon, lat], [lon + 0.01, lat], [lon + 0.01, lat + 0.01], [lon, lat + 0.01], [lon, lat]]] });
const segments: GridSegmentDoc[] = [
  { segmentId: "AA", geometry: sq(-84.0, 33.0), centroid: { lat: 33.005, lon: -83.995 }, areaM2: 1, neighbors: ["AB"], upstream: [], downstream: [] },
  { segmentId: "AB", geometry: sq(-83.99, 33.0), centroid: { lat: 33.005, lon: -83.985 }, areaM2: 1, neighbors: ["AA"], upstream: [], downstream: [] },
];
let seq = 1795860000000;
const writer = (): CommandWriter => ({ incidentId: "drill-dev-1", uid: "uid-cmd", seq: seq++, clientTimeMs: 1795860000000, priorVersion: 2, segments });
const input: SightingInput = {
  observedAtMs: 1795859000000,
  position: { lat: 33.004, lon: -83.996 },
  direction: "e",
  topColor: "blue",
  bottomColor: "unknown",
  footwear: "",
  carried: "",
  reportedBy: "stranger",
  freeText: "saw a woman in a blue coat by the creek",
};

describe("removePhoneNumbers", () => {
  it("handles common shapes and leaves times and segment ids alone", () => {
    expect(removePhoneNumbers("call (404) 555-0142 or 4045550142")).toBe("call [number removed] or [number removed]");
    expect(removePhoneNumbers("seen at 14:03 in segment AC, about 300 m north")).toBe("seen at 14:03 in segment AC, about 300 m north");
  });

  it("also removes country codes, dots and a bare area code before seven digits", () => {
    expect(removePhoneNumbers("+1 404 555 0142")).toBe("[number removed]");
    expect(removePhoneNumbers("call +1 (404) 5550142 now")).toBe("call [number removed] now");
    expect(removePhoneNumbers("404.555.0142")).toBe("[number removed]");
    expect(removePhoneNumbers("ring 555-0142")).toBe("ring [number removed]");
  });
});

describe("buildSightingEvent", () => {
  it("a public sighting changes nothing until a person confirms it", () => {
    const e = buildSightingEvent(input, writer());
    expect(e.reporter).toBe("public_caller");
    expect(e.observedAtMs).toBe(input.observedAtMs);
    expect(e.positionSource).toBe("map_click");
    expect(toEngineEvents([e], [])).toEqual([]);
    expect(toEngineEvents([e, buildConfirmation(e, "confirmed", writer())], [])).toHaveLength(1);
    expect(toEngineEvents([e, buildConfirmation(e, "rejected", writer())], [])).toEqual([]);
  });

  it("has all 25 event keys, the command role, and an id from the engine over (incident, uid, seq)", () => {
    const w = writer();
    const e = buildSightingEvent(input, w);
    expect(Object.keys(e)).toHaveLength(25);
    expect(e).toMatchObject({ schemaVersion: 1, role: "command", type: "sighting", deviceId: "uid-cmd", authorUid: "uid-cmd", seq: w.seq, teamId: null, priorVersion: 2 });
    expect(e.eventId).toBe(eventId("drill-dev-1", "uid-cmd", w.seq));
  });

  it("a family sighting is reported as family", () => {
    expect(buildSightingEvent({ ...input, reportedBy: "family" }, writer()).reporter).toBe("family");
  });

  it("a sighting inside the grid is strong evidence for its segment", () => {
    const e = buildSightingEvent(input, writer());
    expect(e.effect).toMatchObject({ kind: "clue", authenticity: "medium" });
    expect((e.effect as { influences: Record<string, string> }).influences["AA"]).toBe("strong_for");
  });

  it("sighting outside the grid changes nothing", () => {
    expect(buildSightingEvent({ ...input, position: { lat: 40, lon: -80 } }, writer()).effect).toEqual({ kind: "none", why: "outside_area" });
  });

  it("a sighting with no place needs command to place it", () => {
    const e = buildSightingEvent({ ...input, position: null }, writer());
    expect(e.positionSource).toBe("none");
    expect(e.effect).toEqual({ kind: "none", why: "needs_command" });
  });

  it("no caller name or number reaches the stored event, in any field", () => {
    const formState = { callerName: "Zelda Quince", callerPhone: "404-555-0142" };
    const e = buildSightingEvent({ ...input, freeText: "Caller at 404-555-0142 saw a woman in a blue coat by the creek" }, writer());
    expect(Object.keys(e)).toEqual(expect.not.arrayContaining(["callerName", "callerPhone"]));
    const stored = JSON.stringify(e);
    expect(stored).not.toContain("404-555-0142");
    expect(stored).not.toContain("4045550142");
    expect(stored).not.toContain(formState.callerName);
    expect(e.rawText).toContain("[number removed]");
  });

  it("a sighting with no time is refused", () => {
    expect(() => buildSightingEvent({ ...input, observedAtMs: Number.NaN }, writer())).toThrow(/time/);
  });

  it("refuses a note over 2000 characters", () => {
    expect(() => buildSightingEvent({ ...input, freeText: "x".repeat(2001) }, writer())).toThrow(/2000/);
  });
});

describe("buildConfirmation", () => {
  it("targets the sighting, carries the decision and changes nothing itself", () => {
    const s = buildSightingEvent(input, writer());
    const c = buildConfirmation(s, "confirmed", writer());
    expect(c).toMatchObject({ type: "confirmation", targetEventId: s.eventId, decision: "confirmed", role: "command", reporter: "system", inputMethod: "system", effect: { kind: "none", why: "informational" } });
    expect(Object.keys(c)).toHaveLength(25);
  });
});

describe("useAsStartPoint", () => {
  it("a sighting promoted to the start point stops counting as a likelihood", () => {
    const s = buildSightingEvent(input, writer());
    const docs = [s, buildConfirmation(s, "confirmed", writer())];
    const next = useAsStartPoint(s, { priorVersion: 2, priorInputEventIds: ["x".repeat(32)] });
    expect(next.priorInputEventIds).toContain(s.eventId);
    expect(next.priorInputEventIds).toContain("x".repeat(32));
    expect(next.priorVersion).toBe(3);
    expect(next.ipp).toEqual({ lat: 33.004, lon: -83.996 });
    expect(next.ippSource).toBe("sighting");
    expect(toEngineEvents(docs, next.priorInputEventIds)).toEqual([]);
  });

  it("refuses a sighting without a place", () => {
    expect(() => useAsStartPoint(buildSightingEvent({ ...input, position: null }, writer()), { priorVersion: 1 })).toThrow(/place/i);
  });
});
