// cloudGuard (beforeGenerateContent): every generateContent call through AI Logic, templated or not, may name only
// a model on shared/constants/models.json, and its output is bounded. Streaming calls and the Live API are not seen
// by this trigger, by Google's design (docs/SECURITY.md row 12).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_MODELS, MAX_OUTPUT_TOKENS, MAX_REWRITE_MEDIA_CHARS, TTS_MAX_OUTPUT_TOKENS, guardLogLine, guardRequest } from "../src/cloudGuard";

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
  it("has memory for a burst of clip reads: each request can carry a 14 MB clip as base64 (review)", async () => {
    const { cloudGuard } = await import("../src/index");
    const ep = (cloudGuard as unknown as { __endpoint: { availableMemoryMb?: number; concurrency?: number; cpu?: number; maxInstances?: number; minInstances?: unknown } }).__endpoint;
    // About 100 MB per in-flight clip request (raw body, parsed string, rewritten reply), plus the runtime.
    expect(ep.availableMemoryMb).toBe(1024);
    expect(ep.cpu).toBe(1);
    expect(ep.concurrency).toBe(6);
    expect(ep.maxInstances).toBe(10);
    // No warm instance waiting (that costs money while idle).
    expect(typeof ep.minInstances === "number" ? ep.minInstances : 0).toBe(0);
  });
});

/** Sends one AI Logic event through the exported trigger, as the platform does, and returns its HTTP answer. */
async function throughTrigger(data: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const { cloudGuard } = await import("../src/index");
  let status = 0, body: Record<string, unknown> = {};
  const res = { status(s: number) { status = s; return res; }, send(b: Record<string, unknown>) { body = b; return res; } };
  const event = { specversion: "1.0", id: "e1", source: "test", type: "google.firebase.ailogic.v1.beforeGenerate",
    data: { api: "google.ai.generativelanguage.v1beta", ...data } };
  await (cloudGuard as unknown as (req: unknown, res: unknown) => Promise<void>)({ headers: {}, body: event }, res);
  return { status, body };
}

describe("cloudGuard through the exported trigger", () => {
  const model = path("gemini-3.5-flash-lite");
  // A template call's request carries the template's own config, including settings direct calls never send.
  const templateConfig = { temperature: 0, maxOutputTokens: 2048, responseMimeType: "application/json",
    responseJsonSchema: { type: "object", properties: { direction: { type: "string" } } }, thinkingConfig: { thinkingBudget: 0 } };
  it("answers a template call with no request, so the template's own config stands (live 2026-11-18)", async () => {
    const { status, body } = await throughTrigger({ model, template: { templateName: "projects/p/locations/global/templates/pls-sighting-note-v1" },
      request: { contents: [{ role: "user", parts: [{ text: "note" }] }], generationConfig: templateConfig } });
    expect(status).toBe(200);
    expect(Object.keys(body).filter(k => k !== "@type")).toEqual([]);
  });
  it("answers a direct call that asks too much with the bounded request", async () => {
    const { status, body } = await throughTrigger({ model,
      request: { contents: [], generationConfig: { maxOutputTokens: 50_000, candidateCount: 4 } } });
    expect(status).toBe(200);
    expect(body.generationConfig).toEqual({ maxOutputTokens: MAX_OUTPUT_TOKENS });
  });
  it("refuses an off-list model with permission-denied, template call or not", async () => {
    for (const template of [undefined, { templateName: "x" }]) {
      const { status, body } = await throughTrigger({ model: path("gemini-9-pro"), template, request: { contents: [] } });
      expect(status).toBe(500);
      expect(body).toEqual({ code: 7, message: "This model is not allowed here." });
    }
  });
});

describe("cloudGuard on a live template call (seen 2026-11-18)", () => {
  // Live, a template call arrived with data.template null and the template's output schema in generationConfig
  // under "_responseJsonSchema", with no maxOutputTokens. Dropping that key made the sighting template invent
  // field names; it must be kept, and the output still bounded.
  const schema = { type: "object", properties: { direction: { type: "string" } }, required: ["direction"] };
  const live = { "@type": "type.googleapis.com/google.ai.generativelanguage.v1beta.GenerateContentRequest", model: "models/gemini-3.5-flash-lite",
    contents: [], systemInstruction: { parts: [] }, generationConfig: { _responseJsonSchema: schema, responseMimeType: "application/json", temperature: 0 } };
  it("keeps the template's schema and adds the text cap", () => {
    expect(guardRequest(path("gemini-3.5-flash-lite"), live)?.generationConfig).toEqual({ _responseJsonSchema: schema,
      responseMimeType: "application/json", temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS });
  });
  it("keeps it through the exported trigger too", async () => {
    const { status, body } = await throughTrigger({ model: path("gemini-3.5-flash-lite"), template: null, request: live });
    expect(status).toBe(200);
    expect((body.generationConfig as Record<string, unknown>)._responseJsonSchema).toEqual(schema);
  });
});

describe("cloudGuard on a clip-size request (measured 2026-11-18)", () => {
  // Live, the AI Logic proxy accepted a rewritten request of 11.3 MB and failed (HTTP 500) on 15.8 MB; an 18.4 MB
  // request left as sent went through. A request with more inline media than the limit is checked for its model
  // and otherwise left as sent, so a long clip read still works.
  const withMedia = (chars: number, model = "gemini-3.5-flash-lite") => [path(model),
    { contents: [{ role: "user", parts: [{ inlineData: { mimeType: "video/mp4", data: "A".repeat(chars) } }, { text: "read" }] }],
      generationConfig: { maxOutputTokens: 50_000 } }] as const;
  it("is left as sent above the limit, and rewritten at or below it", () => {
    expect(MAX_REWRITE_MEDIA_CHARS).toBe(9_000_000);
    expect(guardRequest(...withMedia(MAX_REWRITE_MEDIA_CHARS + 1))).toBeUndefined();
    expect(guardRequest(...withMedia(MAX_REWRITE_MEDIA_CHARS))?.generationConfig?.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
  });
  it("still refuses an off-list model", () => {
    expect(() => guardRequest(...withMedia(MAX_REWRITE_MEDIA_CHARS + 1, "gemini-9-pro"))).toThrow(expect.objectContaining({ code: "permission-denied" }));
  });
  it("says so in the log line, by size only", () => {
    const [model, request] = withMedia(MAX_REWRITE_MEDIA_CHARS + 1);
    expect(guardLogLine({ model, request }, guardRequest(model, request))).toMatchObject({ rewritten: false, mediaMB: 9 });
  });
});

describe("cloudGuard's log line", () => {
  // One line per call says which path the guard took and which setting names it saw, so a live defect can be read
  // from the logs. It never carries the prompt, inputs, media or values.
  const request = { contents: [{ role: "user", parts: [{ text: "SECRET NOTE ABOUT ROSA" }, { inlineData: { mimeType: "video/mp4", data: "QUJD" } }] }],
    systemInstruction: { parts: [{ text: "SYSTEM SECRET" }] }, generationConfig: { maxOutputTokens: 50_000, temperature: 0.7, responseSchema: { type: "object" } } };
  it("names the path, the template, the setting names and whether the request was rewritten", () => {
    const out = guardRequest(path("gemini-3.5-flash-lite"), request);
    expect(guardLogLine({ model: path("gemini-3.5-flash-lite"), request }, out)).toEqual({ event: "cloudGuard", path: "direct",
      model: "gemini-3.5-flash-lite", template: null, requestKeys: ["contents", "generationConfig", "systemInstruction"],
      configKeys: ["maxOutputTokens", "responseSchema", "temperature"], mediaMB: 0, rewritten: true });
    expect(guardLogLine({ model: path("gemini-3.5-flash-lite"), template: { templateName: "projects/p/locations/global/templates/pls-voice-v1" }, request }, undefined))
      .toMatchObject({ path: "template", template: "projects/p/locations/global/templates/pls-voice-v1", rewritten: false });
  });
  it("never carries the prompt, inputs, media or setting values", () => {
    const line = JSON.stringify(guardLogLine({ model: path("gemini-3.5-flash-lite"), request }, guardRequest(path("gemini-3.5-flash-lite"), request)));
    for (const secret of ["SECRET NOTE", "SYSTEM SECRET", "QUJD", "video/mp4", "50000", "0.7", "object"]) expect(line).not.toContain(secret);
  });
});
