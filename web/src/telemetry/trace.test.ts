import type { RouteRecord } from "@pls/engine";
import { describe, expect, it } from "vitest";
import { recordInference, traceAttributes } from "./trace";

const route: RouteRecord = { platform: "ios", path: "on_device", stage: "guided", model: "apple-fm", reason: "no_network", latencyMs: 812, sdkReported: false, blocked: null, decidedAtMs: 1_700_000_000_000 };

describe("telemetry", () => {
  it("maps a route record to four short attributes and no report text", () => {
    expect(traceAttributes(route)).toEqual({ path: "on_device", reason: "no_network", platform: "ios", stage: "guided" });
  });

  it("records one hybrid-inference trace per model call, with the latency as a metric", () => {
    const calls: { name: string; start: number; duration: number; options: unknown }[] = [];
    recordInference({ ...route, platform: "web", path: "cloud", reason: "sdk_prefer_in_cloud", stage: "sdk" }, {
      record: (name, start, duration, options) => calls.push({ name, start, duration, options }),
    });
    expect(calls).toEqual([
      {
        name: "hybrid-inference",
        start: 1_700_000_000_000 - 812,
        duration: 812,
        options: { attributes: { path: "cloud", reason: "sdk_prefer_in_cloud", platform: "web", stage: "sdk" }, metrics: { latency_ms: 812 } },
      },
    ]);
  });

  it("never throws into the caller when telemetry fails", () => {
    expect(() => recordInference(route, { record: () => { throw new Error("perf off"); } })).not.toThrow();
  });
});
