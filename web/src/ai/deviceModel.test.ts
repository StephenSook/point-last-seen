import { describe, expect, it } from "vitest";
import { deviceState, downloadDeviceModel } from "./deviceModel";

const lm = (answer: (o: { expectedInputs?: { type: string }[] }) => string | Promise<string>) => ({ LanguageModel: { availability: async (o: { expectedInputs?: { type: string }[] }) => answer(o) } });
const wantsImage = (o: { expectedInputs?: { type: string }[] }) => (o.expectedInputs ?? []).some((i) => i.type === "image");

describe("deviceState", () => {
  it("(a) no built-in model", async () => {
    expect(await deviceState({})).toBe("no-model");
    expect(await deviceState(lm(() => "unavailable"))).toBe("no-model");
  });

  it("a model Chrome can download first", async () => {
    expect(await deviceState(lm(() => "downloadable"))).toBe("downloadable");
    expect(await deviceState(lm(() => "downloading"))).toBe("downloadable");
  });

  it("(b) text only: the note can be read here, photos cannot", async () => {
    expect(await deviceState(lm((o) => (wantsImage(o) ? "unavailable" : "available")))).toBe("text");
  });

  it("(c) image input available", async () => {
    expect(await deviceState(lm(() => "available"))).toBe("image");
  });
});

describe("downloadDeviceModel", () => {
  it("reports whole percents from 0 to 100 and resolves when the download ends", async () => {
    const seen: number[] = [];
    await downloadDeviceModel((p) => seen.push(p), async (onProgress) => { onProgress(0); onProgress(0.254); onProgress(1); });
    expect(seen).toEqual([0, 25, 100]);
  });

  it("says plainly when Chrome cannot download a model, never with raw error text", async () => {
    await expect(downloadDeviceModel(() => {}, async () => { throw new Error("[AI/api-not-enabled] internal"); })).rejects.toThrow(/^This browser cannot download a local model\.$/);
  });
});
