import { describe, expect, it } from "vitest";
import { fromFields, sortEvents } from "../src/firestore";

describe("Firestore REST values", () => {
  it("decode to plain values, timestamps to milliseconds", () => {
    expect(fromFields({
      s: { stringValue: "a" }, i: { integerValue: "42" }, d: { doubleValue: 0.5 }, b: { booleanValue: true }, n: { nullValue: null },
      t: { timestampValue: "2026-11-22T15:00:00.250Z" }, a: { arrayValue: { values: [{ integerValue: "1" }, { stringValue: "x" }] } },
      e: { arrayValue: {} }, m: { mapValue: { fields: { k: { doubleValue: 1.5 } } } }, em: { mapValue: {} },
    })).toEqual({ s: "a", i: 42, d: 0.5, b: true, n: null, t: Date.UTC(2026, 10, 22, 15, 0, 0, 250), a: [1, "x"], e: [], m: { k: 1.5 }, em: {} });
  });
  it("refuse a value type the run cannot carry", () => {
    expect(() => fromFields({ g: { geoPointValue: { latitude: 1, longitude: 2 } } })).toThrow(/geoPointValue/);
  });
  it("events go in server-time order, then by id", () => {
    expect(sortEvents([{ eventId: "b", serverTime: 2 }, { eventId: "c", serverTime: 1 }, { eventId: "a", serverTime: 2 }]).map(e => e.eventId))
      .toEqual(["c", "a", "b"]);
  });
});
