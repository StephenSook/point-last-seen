// cloudGuard (beforeGenerateContent): every generateContent call through AI Logic, templated or not, may name only
// a model on shared/constants/models.json, and its output is bounded. Streaming calls and the Live API are not seen
// by this trigger, by Google's design (docs/SECURITY.md row 12).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_MODELS, MAX_OUTPUT_TOKENS, TTS_MAX_OUTPUT_TOKENS, guardRequest } from "../src/cloudGuard";

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
  it("bounds speech by its own cap, only on the TTS model; asking for audio on a text model gets the text cap (review)", () => {
    const tts = { contents: [], generationConfig: { responseModalities: ["AUDIO"], maxOutputTokens: 50_000 } };
    expect(guardRequest(path("gemini-3.8-flash-lite-tts"), tts)).toEqual({ contents: [], generationConfig: { responseModalities: ["AUDIO"], maxOutputTokens: TTS_MAX_OUTPUT_TOKENS } });
    expect(guardRequest(path("gemini-3.8-flash-lite-tts"), { contents: [], generationConfig: { responseModalities: ["AUDIO"], maxOutputTokens: 1000 } })).toBeUndefined();
    const sneaky = { contents: [], generationConfig: { responseModalities: ["AUDIO"], maxOutputTokens: 50_000 } };
    expect(guardRequest(path("gemini-3.5-flash-lite"), sneaky)?.generationConfig?.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
  });
  it("keeps only the generation settings our apps use, dropping extra candidates and thinking even within the cap (review)", () => {
    const req = { contents: [], generationConfig: { maxOutputTokens: 100, temperature: 0, responseMimeType: "application/json", responseJsonSchema: { type: "object" },
      candidateCount: 8, thinkingConfig: { thinkingBudget: 24_000 }, somethingNew: 1 } };
    expect(guardRequest(path("gemini-3.5-flash-lite"), req)).toEqual({ contents: [],
      generationConfig: { maxOutputTokens: 100, temperature: 0, responseMimeType: "application/json", responseJsonSchema: { type: "object" } } });
  });
  it("a template call is checked for its model and otherwise left alone: the template's own config stands (live 2026-11-18)", () => {
    // Returning a generationConfig on a template call replaced the template's output schema: the sighting template
    // answered with made-up field names until the guard was rolled back.
    expect(guardRequest(path("gemini-3.5-flash-lite"), { contents: [] }, { templateId: "pls-sighting-note-v1" })).toBeUndefined();
    expect(() => guardRequest(path("gemini-9-pro"), { contents: [] }, { templateId: "x" })).toThrow(expect.objectContaining({ code: "permission-denied" }));
  });
  it("is registered as the AI Logic before-generate trigger", async () => {
    const { cloudGuard } = await import("../src/index");
    const ep = (cloudGuard as unknown as { __endpoint: { blockingTrigger?: { eventType: string } } }).__endpoint;
    expect(ep.blockingTrigger?.eventType).toBe("google.firebase.ailogic.v1.beforeGenerate");
  });
});
