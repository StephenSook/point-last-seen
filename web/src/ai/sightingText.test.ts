import { describe, expect, it } from "vitest";
import { InferenceMode } from "firebase/ai";
import { SIGHTING_CUES_JSON, SIGHTING_TEXT_OPTS, readSightingText, readSightingTextInCloud, sightingCloudParams, sightingTextParams, type SightingTextDeps } from "./sightingText";

const text = "saw a woman in a blue coat walking north by the creek";
const goodReply = JSON.stringify({ direction: "n", topColor: "blue", bottomColor: "unknown", footwear: "", carried: "", evidenceQuote: "a woman in a blue coat walking north" });
const mustNotBeCalled = async (): Promise<never> => { throw new Error("SDK called"); };

function deps(over: Partial<SightingTextDeps> & { availableAnswer?: boolean | "throws" }): SightingTextDeps & { calls: string[]; asked: unknown[] } {
  const calls: string[] = [];
  const asked: unknown[] = [];
  const { availableAnswer = true, ...rest } = over;
  return {
    calls,
    asked,
    available: async (o) => {
      asked.push(o);
      if (availableAnswer === "throws") throw new Error("x");
      return availableAnswer;
    },
    generate: async (t) => { calls.push(t); return { text: goodReply, inferenceSource: "on_device" }; },
    ...rest,
  };
}

describe("readSightingText", () => {
  it("refuses without the local model and calls nothing", async () => {
    const d = deps({ availableAnswer: false, generate: mustNotBeCalled });
    expect(await readSightingText(text, d)).toEqual({ refused: "no-on-device-model" });
    expect(await readSightingText(text, deps({ availableAnswer: "throws", generate: mustNotBeCalled }))).toEqual({ refused: "no-on-device-model" });
  });

  it("asks the gate with the very options the on-device model is created with", async () => {
    const d = deps({});
    await readSightingText(text, d);
    expect(d.asked).toEqual([SIGHTING_TEXT_OPTS]);
    expect(d.asked[0]).toBe(SIGHTING_TEXT_OPTS);
    expect(sightingTextParams().onDeviceParams?.createOptions).toBe(SIGHTING_TEXT_OPTS);
  });

  it("possible evidence in a caller's words goes to no model and asks no gate", async () => {
    const d = deps({ generate: mustNotBeCalled });
    expect(await readSightingText("there was blood on her coat", d)).toEqual({ refused: "possible-evidence" });
    expect(d.asked).toEqual([]);
  });

  it("discards a result that did not run on-device, or whose route was not reported", async () => {
    expect(await readSightingText(text, deps({ generate: async () => ({ text: goodReply, inferenceSource: "in_cloud" }) }))).toEqual({ refused: "not-on-device" });
    expect(await readSightingText(text, deps({ generate: async () => ({ text: goodReply, inferenceSource: undefined }) }))).toEqual({ refused: "not-on-device" });
  });

  it("a reading whose quote is not in the text is dropped", async () => {
    const reply = JSON.stringify({ ...JSON.parse(goodReply), evidenceQuote: "an old man in red" });
    expect(await readSightingText(text, deps({ generate: async () => ({ text: reply, inferenceSource: "on_device" }) }))).toEqual({ refused: "invalid" });
  });

  it("a reply that is not JSON, or has a value outside the closed lists, is dropped", async () => {
    expect(await readSightingText(text, deps({ generate: async () => ({ text: "nope", inferenceSource: "on_device" }) }))).toEqual({ refused: "invalid" });
    const bad = JSON.stringify({ ...JSON.parse(goodReply), topColor: "teal" });
    expect(await readSightingText(text, deps({ generate: async () => ({ text: bad, inferenceSource: "on_device" }) }))).toEqual({ refused: "invalid" });
  });

  it("fills the sighting fields from a valid on-device reading", async () => {
    const out = await readSightingText(text, deps({}));
    expect(out).toEqual({ reading: { direction: "n", topColor: "blue", bottomColor: "unknown", footwear: "", carried: "", evidenceQuote: "a woman in a blue coat walking north" } });
  });

  it("removes phone numbers before the text reaches the model", async () => {
    const d = deps({});
    await readSightingText("caller 404-555-0142 saw a woman in a blue coat walking north", d);
    expect(d.calls[0]).not.toContain("404-555-0142");
    expect(d.calls[0]).toContain("[number removed]");
  });
});

describe("readSightingTextInCloud", () => {
  const consent = { byUid: "uid-cmd", atMs: 1 };

  it("needs a consent record for that note", async () => {
    await expect(readSightingTextInCloud(text, null, { generateCloud: mustNotBeCalled, killCloud: false })).rejects.toThrow(/consent/);
  });

  it("refuses possible evidence and a paused cloud without calling anything", async () => {
    expect(await readSightingTextInCloud("blood on her coat", consent, { generateCloud: mustNotBeCalled, killCloud: false })).toEqual({ refused: "possible-evidence" });
    expect(await readSightingTextInCloud(text, consent, { generateCloud: mustNotBeCalled, killCloud: true })).toEqual({ refused: "cloud-paused" });
  });

  it("with consent makes exactly one cloud call and keeps only a cloud result", async () => {
    const calls: string[] = [];
    const out = await readSightingTextInCloud(text, consent, { generateCloud: async (t) => { calls.push(t); return { text: goodReply, inferenceSource: "in_cloud" }; }, killCloud: false });
    expect(calls).toHaveLength(1);
    expect(out).toMatchObject({ reading: { topColor: "blue" } });
  });
});

describe("sightingTextParams", () => {
  it("is strictly on-device with the schema as the response constraint", () => {
    const p = sightingTextParams();
    expect(p.mode).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(p.onDeviceParams?.promptOptions?.responseConstraint).toBeDefined();
    expect(SIGHTING_TEXT_OPTS.expectedInputs).toEqual([{ type: "text", languages: ["en"] }]);
    expect(SIGHTING_TEXT_OPTS.expectedOutputs).toEqual([{ type: "text", languages: ["en"] }]);
  });
});

describe("sightingCloudParams", () => {
  it("is strictly in the cloud with the same closed schema", () => {
    const p = sightingCloudParams("gemini-3.5-flash-lite");
    expect(p.mode).toBe(InferenceMode.ONLY_IN_CLOUD);
    expect(p.inCloudParams).toMatchObject({ model: "gemini-3.5-flash-lite", generationConfig: { responseMimeType: "application/json", responseJsonSchema: SIGHTING_CUES_JSON } });
    expect(p.onDeviceParams).toBeUndefined();
  });
});
