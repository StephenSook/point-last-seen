import { describe, expect, it } from "vitest";
import type { RouteRecord } from "@pls/engine";
import { receiptLines } from "./receipt";

const r = (over: Partial<RouteRecord>): RouteRecord => ({ platform: "web", path: "cloud", stage: "sdk", model: "gemini-3.5-flash-lite", reason: "on_device_unavailable", latencyMs: 900, sdkReported: true, blocked: null, decidedAtMs: 1, ...over });

describe("receiptLines", () => {
  it("says what was asked for, where it ran as the SDK reported it, the model, and what left this laptop", () => {
    expect(receiptLines({ asked: "this laptop first", route: r({}), sentBytes: 1204, what: "plan text" })).toEqual([
      "Asked for: this laptop first.",
      "Ran: in the cloud (reported by the SDK).",
      "Model: gemini-3.5-flash-lite.",
      "Sent: 1,204 bytes of plan text.",
    ]);
  });
  it("says no text or image left this laptop when it ran here (a timing record still does)", () => {
    expect(receiptLines({ asked: "this laptop first", route: r({ path: "on_device", model: "chrome-built-in", reason: "sdk_prefer_on_device" }), sentBytes: 1204, what: "plan text" })).toEqual([
      "Asked for: this laptop first.",
      "Ran: on this laptop (reported by the SDK).",
      "Model: chrome-built-in.",
      "Sent: no text or image left this laptop.",
    ]);
  });
  it("is plain about a source the SDK did not report", () => {
    expect(receiptLines({ asked: "this laptop first", route: r({ path: "unknown", sdkReported: false }), sentBytes: 1204, what: "plan text" }).slice(1)).toEqual([
      "Ran: not reported by the SDK.",
      "Model: gemini-3.5-flash-lite.",
      "Sent: up to 1,204 bytes of plan text, if it ran in the cloud.",
    ]);
  });
  it("says no model was asked for fixed wording", () => {
    expect(receiptLines({ asked: "this laptop first", route: r({ path: "rules", model: "template", reason: "template_fallback", sdkReported: false }), sentBytes: 1204, what: "plan text" })).toEqual([
      "No model was asked: fixed wording from code.",
      "Sent: no text or image.",
    ]);
  });
});
