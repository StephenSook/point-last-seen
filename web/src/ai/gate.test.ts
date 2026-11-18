import { describe, expect, it } from "vitest";
import { IMAGE_INPUTS, TEXT_INPUTS, TEXT_OUTPUTS, onDeviceAvailable, onDeviceCreateOptions, runOnDeviceOnly } from "./gate";

const TEXT_OPTS = onDeviceCreateOptions("text");
const IMAGE_OPTS = onDeviceCreateOptions("image");

function lm(availability: (o: unknown) => unknown) {
  return { LanguageModel: { availability } };
}

describe("onDeviceAvailable", () => {
  it("is false when LanguageModel is missing", async () => {
    expect(await onDeviceAvailable(TEXT_OPTS, { LanguageModel: undefined })).toBe(false);
    expect(await onDeviceAvailable(TEXT_OPTS, {})).toBe(false);
  });

  it("is false when the model is only downloadable or downloading", async () => {
    expect(await onDeviceAvailable(TEXT_OPTS, lm(async () => "downloadable"))).toBe(false);
    expect(await onDeviceAvailable(TEXT_OPTS, lm(async () => "downloading"))).toBe(false);
    expect(await onDeviceAvailable(TEXT_OPTS, lm(async () => "unavailable"))).toBe(false);
  });

  it("is false when availability throws or rejects", async () => {
    expect(await onDeviceAvailable(TEXT_OPTS, lm(() => { throw new Error("x"); }))).toBe(false);
    expect(await onDeviceAvailable(TEXT_OPTS, lm(async () => { throw new Error("x"); }))).toBe(false);
  });

  it("is false when LanguageModel has no availability function", async () => {
    expect(await onDeviceAvailable(TEXT_OPTS, { LanguageModel: {} })).toBe(false);
  });

  it("is true only for the exact string available", async () => {
    expect(await onDeviceAvailable(TEXT_OPTS, lm(async () => "available"))).toBe(true);
    expect(await onDeviceAvailable(TEXT_OPTS, lm(async () => "AVAILABLE"))).toBe(false);
    expect(await onDeviceAvailable(TEXT_OPTS, lm(async () => true))).toBe(false);
  });

  it("text is available and image is not: text true, image false", async () => {
    const env = lm(async (o: any) => (o.expectedInputs.some((i: any) => i.type === "image") ? "unavailable" : "available"));
    expect(await onDeviceAvailable(TEXT_OPTS, env)).toBe(true);
    expect(await onDeviceAvailable(IMAGE_OPTS, env)).toBe(false);
  });

  it("asks availability with the very options object the session will be created with", async () => {
    const seen: unknown[] = [];
    await onDeviceAvailable(IMAGE_OPTS, lm(async (o) => { seen.push(o); return "available"; }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(IMAGE_OPTS);
  });

  it("gives up after its timeout and answers false", async () => {
    const never = lm(() => new Promise(() => {}));
    expect(await onDeviceAvailable(TEXT_OPTS, never, 20)).toBe(false);
  });
});

describe("onDeviceCreateOptions", () => {
  it("text reads declare English text in and English text out", () => {
    expect(TEXT_OPTS.expectedInputs).toEqual([{ type: "text", languages: ["en"] }]);
    expect(TEXT_OPTS.expectedOutputs).toEqual([{ type: "text", languages: ["en"] }]);
  });

  it("image reads add image input and keep English text in and out", () => {
    expect(IMAGE_OPTS.expectedInputs).toEqual([{ type: "text", languages: ["en"] }, { type: "image" }]);
    expect(IMAGE_OPTS.expectedOutputs).toEqual([{ type: "text", languages: ["en"] }]);
  });

  it("carries the system prompt as an initial prompt", () => {
    const o = onDeviceCreateOptions("text", "Read the note.");
    expect(o.initialPrompts).toEqual([{ role: "system", content: [{ type: "text", value: "Read the note." }] }]);
    expect(o.expectedOutputs).toEqual(TEXT_OUTPUTS);
  });

  it("returns fresh arrays so one caller cannot change another's options", () => {
    const a = onDeviceCreateOptions("text");
    a.expectedInputs!.push({ type: "image" });
    expect(onDeviceCreateOptions("text").expectedInputs).toEqual(TEXT_INPUTS);
    expect(IMAGE_INPUTS).toEqual([{ type: "text", languages: ["en"] }, { type: "image" }]);
  });
});

describe("runOnDeviceOnly", () => {
  it("never calls the SDK when the gate says no", async () => {
    let called = 0;
    const out = await runOnDeviceOnly(TEXT_OPTS, async () => { called++; return 1; }, lm(async () => "downloadable"));
    expect(out).toEqual({ ran: false });
    expect(called).toBe(0);
  });

  it("never calls the SDK when LanguageModel is missing", async () => {
    let called = 0;
    const out = await runOnDeviceOnly(TEXT_OPTS, async () => { called++; return 1; }, {});
    expect(out).toEqual({ ran: false });
    expect(called).toBe(0);
  });

  it("calls the SDK once when the model is available and returns its value", async () => {
    let called = 0;
    const out = await runOnDeviceOnly(TEXT_OPTS, async () => { called++; return "v"; }, lm(async () => "available"));
    expect(out).toEqual({ ran: true, value: "v" });
    expect(called).toBe(1);
  });
});
