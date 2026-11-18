// cloudGuard (beforeGenerateContent): every generateContent call through AI Logic, templated or not, may name only
// a model on shared/constants/models.json, and its output is bounded. Streaming calls and the Live API are not seen
// by this trigger, by Google's design (docs/SECURITY.md row 12).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_MODELS, MAX_OUTPUT_TOKENS, guardRequest } from "../src/cloudGuard";

const listed = JSON.parse(readFileSync(new URL("../../shared/constants/models.json", import.meta.url), "utf8")).models.map((m: { id: string }) => m.id);
const path = (id: string) => `projects/buildhybridai-2026-yg3m/locations/global/publishers/google/models/${id}`;

describe("cloudGuard", () => {
  it("allows exactly the models on shared/constants/models.json", () => {
    expect([...ALLOWED_MODELS].sort()).toEqual([...listed].sort());
  });
  it("refuses a model that is not on the list, in any path form", () => {
    for (const m of [path("gemini-9-pro"), "models/gemini-9-pro", "gemini-9-pro", "", path("gemini-3.5-flash-lite-x")]) {
      expect(() => guardRequest(m, { contents: [] })).toThrow(expect.objectContaining({ code: "permission-denied" }));
    }
  });
  it("lowers maxOutputTokens to the bound and sets it when absent, leaving the rest of the request as sent", () => {
    const req = { contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: { temperature: 0, maxOutputTokens: 50_000 } };
    expect(guardRequest(path("gemini-3.5-flash-lite"), req)).toEqual({ ...req, generationConfig: { temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS } });
    expect(guardRequest("models/gemini-3.5-flash-lite", { contents: [] })).toEqual({ contents: [], generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS } });
    expect(guardRequest("gemini-3.5-flash-lite", { contents: [], generationConfig: { maxOutputTokens: 100 } })).toBeUndefined();
  });
  it("leaves a speech request's output alone: audio is not bounded by the text limit", () => {
    const tts = { contents: [], generationConfig: { responseModalities: ["AUDIO"], maxOutputTokens: 50_000 } };
    expect(guardRequest(path("gemini-3.8-flash-lite-tts"), tts)).toBeUndefined();
  });
  it("is registered as the AI Logic before-generate trigger", async () => {
    const { cloudGuard } = await import("../src/index");
    const ep = (cloudGuard as unknown as { __endpoint: { blockingTrigger?: { eventType: string } } }).__endpoint;
    expect(ep.blockingTrigger?.eventType).toBe("google.firebase.ailogic.v1.beforeGenerate");
  });
});
