import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, eventId, posterior, toEngineEvents, type EventDoc } from "@pls/engine";
import type { GridSegmentDoc } from "../map/geo";
import { buildConfirmation, buildSightingEvent, handEntryRoute, placeFamilySighting, removePhoneNumbers, useAsStartPoint, type CommandWriter, type SightingInput } from "./sightings";

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

describe("a sighting's route: where its reading came from", () => {
  // The same record the iPhone writes for a picked report: a person entered it, no model ran.
  it("a sighting typed by hand records the hand-entry route, decided at the write time", () => {
    expect(handEntryRoute(1795860000000)).toEqual({
      platform: "web", path: "rules", stage: "picklist", model: "none", reason: "on_device_default",
      latencyMs: 0, sdkReported: false, blocked: null, decidedAtMs: 1795860000000,
    });
    expect(buildSightingEvent(input, writer()).route).toEqual(handEntryRoute(1795860000000));
  });

  it("a sighting a model read filled records that read's route", () => {
    const route = { platform: "web" as const, path: "cloud" as const, stage: "sdk" as const, model: "gemini-3.5-flash-lite", reason: "consented_cloud_read" as const, latencyMs: 800, sdkReported: true, blocked: null, decidedAtMs: 1795859900000 };
    expect(buildSightingEvent({ ...input, readFilled: { route } }, writer()).route).toEqual(route);
  });

  it("a model read that reported no route is recorded as not reported, never as hand entry", () => {
    expect(buildSightingEvent({ ...input, readFilled: { route: null } }, writer()).route).toBeNull();
  });

  it("command placing a family sighting records the hand-entry route: command picked the point", () => {
    const family = { ...buildSightingEvent({ ...input, position: null, reportedBy: "family" }, writer()), role: "family" as const, route: null };
    expect(placeFamilySighting(family, { lat: 33.004, lon: -83.996 }, writer()).route).toEqual(handEntryRoute(1795860000000));
  });

  it("a confirmation records no route: nothing was read", () => {
    expect(buildConfirmation(buildSightingEvent(input, writer()), "confirmed", writer()).route).toBeNull();
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

describe("placing a family sighting on the map", () => {
  // The shape the family app writes (Events.familySighting): no position, no effect until command acts.
  const family = {
    eventId: "f".repeat(32), schemaVersion: 1, incidentId: "drill-dev-1", teamId: null, deviceId: "uid-fam", seq: 7, authorUid: "uid-fam", role: "family",
    clientTimeMs: 1795859500000, serverTime: null, isTrainingInject: false, route: null, planVersion: null, priorVersion: 2,
    type: "sighting", reporter: "family", observedAtMs: 1795859000000, position: null, positionSource: "none",
    rawText: "Where: by the creek. Blue coat", inputMethod: "typed",
    reading: { kind: "sighting", segmentIds: [], method: "unknown", coverage: null, minutes: null, searchers: null, searchType: "unknown", detectionRangeM: null, item: "", feature: "none", direction: "e", topColor: "blue", bottomColor: "unknown", footwear: "boots", carried: "", matchesProfile: "unknown", evidenceQuote: "" },
    effect: { kind: "none", why: "needs_command" }, targetEventId: null, decision: null,
  } as unknown as EventDoc;
  const picked = { lat: 33.004, lon: -83.996 };

  it("command's placement keeps the family's report and time, links to it, and is evidence for the picked segment", () => {
    const p = placeFamilySighting(family, picked, writer());
    expect(p).toMatchObject({ type: "sighting", role: "command", reporter: "family", observedAtMs: 1795859000000, positionSource: "map_click", targetEventId: "f".repeat(32), rawText: "Where: by the creek. Blue coat" });
    expect(p.reading).toMatchObject({ direction: "e", topColor: "blue", footwear: "boots" });
    expect((p.effect as { influences: Record<string, string> }).influences["AA"]).toBe("strong_for");
  });

  it("once confirmed, the family's sighting moves the map: segment AA's probability rises", () => {
    const prior = [{ segmentId: "AA", priorPoa: 0.4 }, { segmentId: "AB", priorPoa: 0.4 }, { segmentId: "ROW", priorPoa: 0.2 }];
    const before = posterior(prior, toEngineEvents([family], []), DEFAULT_PARAMS).poa["AA"]!;
    const placed = placeFamilySighting(family, picked, writer());
    const after = posterior(prior, toEngineEvents([family, placed, buildConfirmation(placed, "confirmed", writer())], []), DEFAULT_PARAMS).poa["AA"]!;
    expect(before).toBeCloseTo(0.4);
    expect(after).toBeGreaterThan(before);
  });
});

describe("a scrubbed note is stored as shown", () => {
  it("the sighting save stores every corpus note exactly as the scrubbed text it showed", async () => {
    const { readFileSync } = await import("node:fs");
    const rows = (JSON.parse(readFileSync(new URL("../../../shared/test-vectors/phone-numbers-corpus.json", import.meta.url), "utf8")) as {
      rows: { input: string }[];
    }).rows;
    const differ = rows.flatMap((r) => {
      const shown = removePhoneNumbers(r.input).trim();
      if (shown === "" || shown.length > 2000) return [];
      return buildSightingEvent({ ...input, freeText: shown }, writer()).rawText !== shown ? [JSON.stringify(r.input)] : [];
    });
    expect(differ.length, differ.slice(0, 5).join("\n")).toBe(0);
  });
});
