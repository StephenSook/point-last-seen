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
