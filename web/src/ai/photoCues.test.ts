import { describe, expect, it } from "vitest";
import { InferenceMode } from "firebase/ai";
import template from "../../../shared/templates/pls-photo-cues-v1.json";
import { PHOTO_CUES_JSON, PHOTO_OPTS, cleanCues, photoParams, readPhotoInCloud, readPhotoOnDevice, type PhotoDeps } from "./photoCues";

const b64 = "AAAA";
const cues = { placeType: "store", placeName: "", signText: "HARDWARE OPEN 8-6", landmarks: ["red awning"], outdoors: "yes", evidence: "a store front with a sign" };
const reply = (over: object = {}) => JSON.stringify({ ...cues, ...over });
const mustNotBeCalled = async (): Promise<never> => { throw new Error("SDK called"); };

function deps(over: Partial<PhotoDeps> & { availableFor?: "image" | "text" | "none" | "throws" }): PhotoDeps & { asked: unknown[]; calls: number } {
  const asked: unknown[] = [];
  const { availableFor = "image", ...rest } = over;
  const d = {
    asked,
    calls: 0,
    timeoutMs: 50,
    available: async (o: { expectedInputs?: { type: string }[] }) => {
      asked.push(o);
      if (availableFor === "throws") throw new Error("x");
      if (availableFor === "none") return false;
      const wantsImage = (o.expectedInputs ?? []).some((i) => i.type === "image");
      return availableFor === "image" || !wantsImage;
    },
    generate: async () => { d.calls++; return { text: reply(), inferenceSource: "on_device" as string | undefined }; },
    ...rest,
  };
  return d as PhotoDeps & { asked: unknown[]; calls: number };
}

describe("cleanCues", () => {
  it("drops a place name that is not in the visible sign text", () => {
    expect(cleanCues({ ...cues, signText: "OPEN 8-6", placeName: "Harris Hardware" } as never)?.placeName).toBe("");
    expect(cleanCues({ ...cues, signText: "HARRIS HARDWARE, OPEN 8-6", placeName: "Harris Hardware" } as never)?.placeName).toBe("Harris Hardware");
  });

  it("refuses values outside the closed lists and keeps at most three landmarks", () => {
    expect(cleanCues({ ...cues, placeType: "castle" } as never)).toBeNull();
    expect(cleanCues({ ...cues, outdoors: "maybe" } as never)).toBeNull();
    expect(cleanCues({ ...cues, landmarks: ["a", "b", "c", "d"] } as never)?.landmarks).toEqual(["a", "b", "c"]);
  });
});

describe("readPhotoOnDevice", () => {
  it("refuses when the gate says no, and makes no SDK call", async () => {
    expect(await readPhotoOnDevice(b64, deps({ availableFor: "none", generate: mustNotBeCalled }))).toEqual({ refused: "no-on-device-model" });
  });

  it("refuses when the gate throws", async () => {
    expect(await readPhotoOnDevice(b64, deps({ availableFor: "throws", generate: mustNotBeCalled }))).toEqual({ refused: "no-on-device-model" });
  });

  it("a text-only model leaves photos unread and says so", async () => {
    expect(await readPhotoOnDevice(b64, deps({ availableFor: "text", generate: mustNotBeCalled }))).toEqual({ refused: "no-on-device-model" });
  });

  it("asks the gate with the very options the photo model is created with", async () => {
    const d = deps({});
    await readPhotoOnDevice(b64, d);
    expect(d.asked[0]).toBe(PHOTO_OPTS);
    expect(photoParams().onDeviceParams?.createOptions).toBe(PHOTO_OPTS);
    expect(PHOTO_OPTS.expectedInputs).toEqual([{ type: "text", languages: ["en"] }, { type: "image" }]);
    expect(PHOTO_OPTS.expectedOutputs).toEqual([{ type: "text", languages: ["en"] }]);
  });

  it("discards a result that did not run on-device", async () => {
    expect(await readPhotoOnDevice(b64, deps({ generate: async () => ({ text: reply(), inferenceSource: "in_cloud" }) }))).toEqual({ refused: "not-on-device" });
  });

  it("photo result with no inferenceSource is refused", async () => {
    expect(await readPhotoOnDevice(b64, deps({ generate: async () => ({ text: reply(), inferenceSource: undefined }) }))).toEqual({ refused: "not-on-device" });
  });

  it("a slow reply times out once, without a second call", async () => {
    const d = deps({ timeoutMs: 20 });
    d.generate = () => { d.calls++; return new Promise(() => {}); };
    expect(await readPhotoOnDevice(b64, d)).toEqual({ refused: "timeout" });
    expect(d.calls).toBe(1);
  });

  it("keeps a valid on-device reading", async () => {
    expect(await readPhotoOnDevice(b64, deps({}))).toEqual({ cues });
  });
});

describe("readPhotoInCloud", () => {
  it("a cloud read needs a consent record for that photo", async () => {
    await expect(readPhotoInCloud(b64, null, { generateCloud: mustNotBeCalled, killCloud: false })).rejects.toThrow(/consent/);
  });

  it("with consent makes one cloud call and keeps only a cloud result", async () => {
    let calls = 0;
    const out = await readPhotoInCloud(b64, { byUid: "u", atMs: 1 }, { generateCloud: async () => { calls++; return { text: reply(), inferenceSource: "in_cloud" }; }, killCloud: false });
    expect(calls).toBe(1);
    expect(out).toEqual({ cues });
  });

  it("refuses while the cloud is paused, without a call", async () => {
    expect(await readPhotoInCloud(b64, { byUid: "u", atMs: 1 }, { generateCloud: mustNotBeCalled, killCloud: true })).toEqual({ refused: "cloud-paused" });
  });
});

describe("photo model params", () => {
  it("on-device is strictly on-device with the schema as the constraint", () => {
    expect(photoParams().mode).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(photoParams().onDeviceParams?.promptOptions?.responseConstraint).toEqual(PHOTO_CUES_JSON);
  });
});

describe("the cloud photo read's server template", () => {
  it("returns the same fields, closed lists and caps the reply is checked against", () => {
    const out = template.output.schema as Record<string, { enum?: string[]; maxLength?: number; maxItems?: number; items?: { maxLength?: number } }>;
    const P = PHOTO_CUES_JSON.properties as Record<string, { enum?: readonly string[]; maxLength?: number; maxItems?: number; items?: { maxLength?: number } }>;
    expect(Object.keys(out).sort()).toEqual(Object.keys(P).sort());
    for (const [k, v] of Object.entries(P)) {
      if (v.enum) expect(out[k]!.enum, k).toEqual([...v.enum]);
      if (v.maxLength) expect(out[k]!.maxLength, k).toBe(v.maxLength);
      if (v.maxItems) expect(out[k]!.maxItems, k).toBe(v.maxItems);
      if (v.items?.maxLength) expect(out[k]!.items?.maxLength, k).toBe(v.items.maxLength);
    }
    expect(template.templateId).toBe("pls-photo-cues-v1");
    expect(template.input.schema.mimeType.enum).toEqual(["image/jpeg"]);
  });
});

describe("the photo read's time limit", () => {
  it("is more than twice the slowest photo read measured on Chrome's built-in model, and the command post uses it", async () => {
    const { readFileSync } = await import("node:fs");
    const { PHOTO_READ_TIMEOUT_MS } = await import("./photoCues");
    const ev = JSON.parse(readFileSync(new URL("../../../docs/evidence/web/2026-11-21-photo-read-chrome.json", import.meta.url), "utf8")) as { runs: { replyMs: number }[] };
    const slowest = Math.max(...ev.runs.map((r) => r.replyMs));
    expect(slowest).toBeGreaterThan(15_000);
    expect(PHOTO_READ_TIMEOUT_MS).toBeGreaterThan(2 * slowest);
    // The paper sheet's first read on the same Mac took 31 s; a photo read gets at least as long.
    expect(PHOTO_READ_TIMEOUT_MS).toBeGreaterThanOrEqual(90_000);
    expect(readFileSync(new URL("../command/CommandPost.tsx", import.meta.url), "utf8")).toMatch(/photoGenerator\(ai\(\)\)\(b\), timeoutMs: PHOTO_READ_TIMEOUT_MS/);
  });
});
