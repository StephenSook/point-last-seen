import { describe, expect, it } from "vitest";
import { PRIVATE_REQUEST_OPTIONS, generatorFor, photoGeneratorFor } from "./client";

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
