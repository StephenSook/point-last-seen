import { describe, expect, it } from "vitest";
import type { RouteRecord } from "@pls/engine";
import { whatRan } from "./WhatChanged";

const route = (over: Partial<RouteRecord>): RouteRecord => ({ platform: "web", path: "rules", stage: "sdk", model: "template", reason: "template_fallback", latencyMs: 1, sdkReported: false, blocked: null, decidedAtMs: 1, ...over });
const wording = { assignments: [], summary: "" };

describe("whatRan", () => {
  it("describes a model that was asked but not used, then why fixed wording won", () => {
    const lines = whatRan({ wording, notice: null, promptBytes: 900, route: route({}), attempt: { failure: "timeout", route: route({ path: "unknown", model: "gemini-3.5-flash-lite", reason: "sdk_prefer_on_device" }) } });
    expect(lines).toEqual([
      "Asked for: this device's built-in model first, Gemini in the cloud when it has none.",
      "Ran: not reported by the SDK.",
      "Model: gemini-3.5-flash-lite.",
      "Sent: up to 900 bytes of plan text: team ids, segment codes and fact codes, never a note or a name, if it ran in the cloud.",
      "Not used: the model took too long. The plan uses fixed wording from code.",
    ]);
  });
  it("says when the model's answer named other teams or a fact a team does not have", () => {
    const lines = whatRan({ wording, notice: null, promptBytes: 900, route: route({}), attempt: { failure: "rejected", route: route({ path: "cloud", sdkReported: true, model: "gemini-3.5-flash-lite", reason: "on_device_unavailable" }) } });
    expect(lines.at(-1)).toBe("Not used: its answer named other teams or a fact that team does not have. The plan uses fixed wording from code.");
  });
  it("for a choice that was used, says what the model chose and what code wrote, and what was sent", () => {
    const lines = whatRan({ wording, notice: null, promptBytes: 404, route: route({ path: "cloud", sdkReported: true, model: "gemini-3.5-flash-lite", reason: "on_device_unavailable", latencyMs: 1300 }) });
    expect(lines).toEqual([
      "Asked for: this device's built-in model first, Gemini in the cloud when it has none.",
      "Ran: in the cloud (reported by the SDK).",
      "Took: 1.3 s.",
      "Model: gemini-3.5-flash-lite.",
      "Sent: 404 bytes of plan text: team ids, segment codes and fact codes, never a note or a name.",
      "Chose: each team's main reason, from that team's own facts.",
      "Code added a second fact when the team had one and wrote every word.",
    ]);
  });
  it("says no model was asked when the cloud was paused", () => {
    expect(whatRan({ wording, notice: null, promptBytes: 900, route: route({}) })).toEqual(["No model was asked: fixed wording from code.", "Sent: no text or image."]);
  });
});
