import { describe, expect, it } from "vitest";
import { RUN_TYPES, wrongType } from "./runSchema";

describe("wrongType", () => {
  it("counts only a shape's own fields: an inherited name such as toString or __proto__ is an extra field", () => {
    for (const json of ['{"lat":33.79,"lon":-84.37,"toString":1}', '{"lat":33.79,"lon":-84.37,"__proto__":{"a":1}}']) {
      const position: unknown = JSON.parse(json);
      expect(wrongType({ position }, RUN_TYPES.event, "event"), json).toBe("event.position");
    }
    expect(wrongType({ position: { lat: 33.79, lon: -84.37 } }, RUN_TYPES.event, "event")).toBeNull();
  });

  it("skips a field it has no type for, even one named like an inherited property", () => {
    expect(wrongType({ toString: 1 }, RUN_TYPES.team, "team")).toBeNull();
  });
});

describe("a report's route in a public run", () => {
  const route = { platform: "web", path: "cloud", stage: "sdk", model: "gemini-3.5-flash-lite", reason: "consented_cloud_read", latencyMs: 1577, sdkReported: true, blocked: null, decidedAtMs: 1795213590711 };
  const check = (r: Record<string, unknown>) => wrongType({ route: r }, RUN_TYPES.event, "event");

  it("takes a route record the exporter would write", () => {
    expect(check(route)).toBeNull();
    expect(check({ ...route, model: "m".repeat(80) })).toBeNull();
  });

  // The exporter's own value check, held again here so the reader is a second wall: no note text can ride in a
  // route, and a time or a duration below zero is not one a read can have.
  it("refuses a model id longer than a route record holds (80 characters)", () => {
    expect(check({ ...route, model: "m".repeat(81) })).toBe("event.route.model");
  });

  it("refuses a negative latency or decision time", () => {
    expect(check({ ...route, latencyMs: -1 })).toBe("event.route.latencyMs");
    expect(check({ ...route, decidedAtMs: -1 })).toBe("event.route.decidedAtMs");
  });
});
