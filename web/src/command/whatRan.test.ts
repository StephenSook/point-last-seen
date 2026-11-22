import { describe, expect, it } from "vitest";
import type { RouteRecord } from "@pls/engine";
import { whatRan } from "./WhatChanged";

const route = (over: Partial<RouteRecord>): RouteRecord => ({ platform: "web", path: "rules", stage: "sdk", model: "template", reason: "template_fallback", latencyMs: 1, sdkReported: false, blocked: null, decidedAtMs: 1, ...over });
const wording = { assignments: [], summary: "" };

describe("whatRan", () => {
  it("describes a model that was asked but not used, then why fixed wording won", () => {
    const lines = whatRan({ wording, notice: null, promptBytes: 900, route: route({}), attempt: { failure: "timeout", route: route({ path: "unknown", model: "gemini-3.5-flash-lite", reason: "sdk_prefer_on_device" }) } });
    expect(lines).toEqual([
      "Asked for: this laptop first.",
      "Ran: not reported by the SDK.",
      "Model: gemini-3.5-flash-lite.",
      "Sent: up to 900 bytes of plan text, if it ran in the cloud.",
      "Not used: the model took too long. The plan uses fixed wording from code.",
    ]);
  });
  it("says when the model's answer used a number that is not in the plan", () => {
    const lines = whatRan({ wording, notice: null, promptBytes: 900, route: route({}), attempt: { failure: "number", route: route({ path: "cloud", sdkReported: true, model: "gemini-3.5-flash-lite", reason: "on_device_unavailable" }) } });
    expect(lines.at(-1)).toBe("Not used: it used a number that is not in the plan. The plan uses fixed wording from code.");
  });
  it("says no model was asked when the cloud was paused", () => {
    expect(whatRan({ wording, notice: null, promptBytes: 900, route: route({}) })).toEqual(["No model was asked: fixed wording from code.", "Sent: no text or image."]);
  });
});
