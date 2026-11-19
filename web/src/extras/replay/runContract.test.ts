import { describe, expect, it } from "vitest";
import type { EventDoc, RouteRecord } from "../hostApp";
import { ROUTE_ENUMS, RUN_ENUMS } from "./runContract";

// Each list must name every value the engine allows: a value the engine adds later would otherwise be refused.
type Missing<K extends keyof typeof RUN_ENUMS> = Exclude<EventDoc[K], (typeof RUN_ENUMS)[K][number]>;
const complete: [Missing<"type">, Missing<"role">, Missing<"reporter">, Missing<"positionSource">, Missing<"inputMethod">, Missing<"decision">] extends [never, never, never, never, never, never] ? true : false = true;

type MissingRoute<K extends keyof typeof ROUTE_ENUMS> = Exclude<RouteRecord[K], (typeof ROUTE_ENUMS)[K][number]>;
const routeComplete: [MissingRoute<"platform">, MissingRoute<"path">, MissingRoute<"stage">, MissingRoute<"reason">, MissingRoute<"blocked">] extends [never, never, never, never, never] ? true : false = true;

describe("ROUTE_ENUMS", () => {
  it("names every value the engine allows, each once", () => {
    expect(routeComplete).toBe(true);
    for (const values of Object.values(ROUTE_ENUMS)) expect(new Set(values).size).toBe(values.length);
  });
});

describe("RUN_ENUMS", () => {
  it("names every value the engine allows, each once", () => {
    expect(complete).toBe(true);
    for (const values of Object.values(RUN_ENUMS)) expect(new Set(values).size).toBe(values.length);
  });
});
