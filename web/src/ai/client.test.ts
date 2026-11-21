import { describe, expect, it } from "vitest";
import { CLIP_TIMEOUT_MS, PRIVATE_REQUEST_OPTIONS, clipGeneratorFor, debriefSheetGeneratorFor, frameGeneratorFor, generatorFor, photoGeneratorFor, photoTemplateGeneratorFor, templateGeneratorFor } from "./client";
import { clipParts } from "./clipRead";

describe("generatorFor", () => {
  it("returns the reply text and the SDK's reported route", async () => {
    const gen = generatorFor({ generateContent: async () => ({ response: { text: () => "{}", inferenceSource: "in_cloud" } }) });
    expect(await gen("x")).toEqual({ text: "{}", inferenceSource: "in_cloud" });
  });

  it("passes undefined through when the SDK reports no route", async () => {
    const gen = generatorFor({ generateContent: async () => ({ response: { text: () => "{}" } }) });
    expect((await gen("x")).inferenceSource).toBeUndefined();
  });

  it("sends the prompt text as given", async () => {
    let seen = "";
    const gen = generatorFor({ generateContent: async (t: string) => { seen = t; return { response: { text: () => "" } }; } });
    await gen("table");
    expect(seen).toBe("table");
  });
});

describe("PRIVATE_REQUEST_OPTIONS", () => {
  it("points any cloud fallback of a private on-device read at a host that cannot resolve", () => {
    const host = new URL(PRIVATE_REQUEST_OPTIONS.baseUrl).hostname;
    expect(host.endsWith(".invalid")).toBe(true); // RFC 2606: never resolves
    expect(PRIVATE_REQUEST_OPTIONS.timeout).toBeGreaterThan(0);
  });
});

describe("photoGeneratorFor", () => {
  it("sends one prompt and one inline JPEG, and returns the text and the reported route", async () => {
    let sent: unknown;
    const gen = photoGeneratorFor({ generateContent: (async (p: unknown) => { sent = p; return { response: { text: () => "{}", inferenceSource: "on_device" } }; }) as never });
    expect(await gen("QUJD")).toEqual({ text: "{}", inferenceSource: "on_device" });
    expect(sent).toEqual([{ type: "text", text: "Read this photo." }, { type: "inlineData", inlineData: { mimeType: "image/jpeg", data: "QUJD" } }]);
  });
});

describe("debriefSheetGeneratorFor", () => {
  it("sends one prompt and one inline JPEG of the sheet, and returns the text and the reported route", async () => {
    let sent: unknown;
    const gen = debriefSheetGeneratorFor({ generateContent: (async (p: unknown) => { sent = p; return { response: { text: () => "{}", inferenceSource: "on_device" } }; }) as never });
    expect(await gen("QUJD")).toEqual({ text: "{}", inferenceSource: "on_device" });
    expect(sent).toEqual([{ type: "text", text: "Read this debrief sheet." }, { type: "inlineData", inlineData: { mimeType: "image/jpeg", data: "QUJD" } }]);
  });
});

describe("clipGeneratorFor", () => {
  it("sends the clip inline with its type and the clip prompt, and returns the text and the reported route", async () => {
    let sent: unknown;
    const gen = clipGeneratorFor({ generateContent: (async (p: unknown) => { sent = p; return { response: { text: () => "{}", inferenceSource: "in_cloud" } }; }) as never });
    expect(await gen("AAAA", "video/mp4")).toEqual({ text: "{}", inferenceSource: "in_cloud" });
    expect(sent).toEqual(clipParts("AAAA", "video/mp4"));
  });

  it("passes a window on to the request", async () => {
    let sent: unknown;
    const gen = clipGeneratorFor({ generateContent: (async (p: unknown) => { sent = p; return { response: { text: () => "{}" } }; }) as never });
    await gen("AAAA", "video/mp4", { startS: 2, endS: 9 });
    expect(sent).toEqual(clipParts("AAAA", "video/mp4", { startS: 2, endS: 9 }));
  });

  it("gives a clip of up to 14 MB two minutes, longer than a text or photo read", () => {
    expect(CLIP_TIMEOUT_MS).toBe(120_000);
  });
});

describe("frameGeneratorFor", () => {
  it("sends one short instruction and one inline JPEG frame, and returns the text with where it ran", async () => {
    let sent: unknown;
    const gen = frameGeneratorFor({ generateContent: (async (p: unknown) => { sent = p; return { response: { text: () => '{"personVisible":false}', inferenceSource: "on_device" } }; }) as never });
    expect(await gen("QUJD")).toEqual({ text: '{"personVisible":false}', inferenceSource: "on_device" });
    expect(sent).toEqual([{ type: "text", text: "Check this frame." }, { type: "inlineData", inlineData: { mimeType: "image/jpeg", data: "QUJD" } }]);
  });
});

describe("templateGeneratorFor", () => {
  it("sends only the template id and the note; the server holds the model, the instruction and the schema", async () => {
    let sent: unknown;
    const gen = templateGeneratorFor({ generateContent: (async (r: unknown) => { sent = r; return { response: { text: () => "{}", inferenceSource: "in_cloud" } }; }) as never }, "pls-sighting-note-v1");
    expect(await gen("seen by the mill gate")).toEqual({ text: "{}", inferenceSource: "in_cloud" });
    expect(sent).toEqual({ templateId: "pls-sighting-note-v1", templateVariables: { note: "seen by the mill gate" } });
  });
});

describe("photoTemplateGeneratorFor", () => {
  it("sends only the template id and the photo as base64 JPEG; the server holds the model, instruction and schema", async () => {
    let sent: unknown;
    const gen = photoTemplateGeneratorFor({ generateContent: (async (r: unknown) => { sent = r; return { response: { text: () => "{}", inferenceSource: "in_cloud" } }; }) as never }, "pls-photo-cues-v1");
    expect(await gen("QUJD")).toEqual({ text: "{}", inferenceSource: "in_cloud" });
    expect(sent).toEqual({ templateId: "pls-photo-cues-v1", templateVariables: { mimeType: "image/jpeg", imageData: "QUJD" } });
  });
});
