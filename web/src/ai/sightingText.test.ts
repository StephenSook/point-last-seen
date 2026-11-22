import { describe, expect, it } from "vitest";
import template from "../../../shared/templates/pls-sighting-note-v1.json";
import { InferenceMode } from "firebase/ai";
import { NOTE_READ_TIMEOUT_MS, SIGHTING_CUES_JSON, SIGHTING_TEXT_OPTS, readSightingText, readSightingTextInCloud, sightingTextParams, type SightingTextDeps } from "./sightingText";

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
    timeoutMs: 1_000,
    ...rest,
  };
}

describe("readSightingText", () => {
  // A model can fill a field from the missing person's profile instead of the note; a value the note does not
  // support is blanked, so a report never claims what nobody wrote.
  it("blanks a colour the note does not support, and keeps the ones it does", async () => {
    const reply = JSON.stringify({ direction: "n", topColor: "red", bottomColor: "unknown", footwear: "", carried: "", evidenceQuote: "a woman in a blue coat walking north" });
    const r = await readSightingText(text, deps({ generate: async () => ({ text: reply, inferenceSource: "on_device" }) }));
    expect(r).toEqual({ reading: { direction: "n", topColor: "unknown", bottomColor: "unknown", footwear: "", carried: "", evidenceQuote: "a woman in a blue coat walking north" } });
  });

  it("a reply that does not come within the time limit is not read", async () => {
    const never = () => new Promise<never>(() => undefined);
    expect(await readSightingText(text, deps({ generate: never, timeoutMs: 20 }))).toEqual({ refused: "timeout" });
  });

  it("the note read's limit is the photo read's: 90 seconds", async () => {
    const { PHOTO_READ_TIMEOUT_MS } = await import("./photoCues");
    expect(NOTE_READ_TIMEOUT_MS).toBe(90_000);
    expect(NOTE_READ_TIMEOUT_MS).toBe(PHOTO_READ_TIMEOUT_MS);
  });

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

  it("leaves footwear and carried empty when the model answers unknown, so the word never fills a field", async () => {
    const reply = JSON.stringify({ direction: "n", topColor: "blue", bottomColor: "unknown", footwear: "unknown", carried: " Unknown ", evidenceQuote: "a woman in a blue coat walking north" });
    const out = await readSightingText(text, deps({ generate: async () => ({ text: reply, inferenceSource: "on_device" }) }));
    expect(out).toMatchObject({ reading: { footwear: "", carried: "" } });
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
  // The language screen reads the note exactly as typed: "[number removed]" would add English words to it.
  it("refuses a note that does not look like English before anything is sent, checked before the number is removed", async () => {
    for (const note of ["Бабушка ушла 404-555-0142", "奶奶的電話是 一二三四五六七"]) {
      const r = await readSightingTextInCloud(note, { byUid: "u", atMs: 1 }, { generateCloud: mustNotBeCalled, killCloud: false });
      expect(r, note).toEqual({ refused: "not-english" });
    }
  });

  it("an English note is still read in the cloud", async () => {
    const r = await readSightingTextInCloud(text, { byUid: "u", atMs: 1 }, { generateCloud: async () => ({ text: goodReply, inferenceSource: "in_cloud" }), killCloud: false });
    expect(r).toMatchObject({ reading: { topColor: "blue" } });
  });

  it("blanks a colour the note does not support in a cloud read too", async () => {
    const reply = JSON.stringify({ direction: "n", topColor: "red", bottomColor: "unknown", footwear: "", carried: "", evidenceQuote: "a woman in a blue coat walking north" });
    const r = await readSightingTextInCloud(text, { byUid: "u", atMs: 1 }, { generateCloud: async () => ({ text: reply, inferenceSource: "in_cloud" }), killCloud: false });
    expect(r).toMatchObject({ reading: { topColor: "unknown", direction: "n" } });
  });

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

  it("reports the UTF-8 size of the note it sent, after phone numbers were removed", async () => {
    let sent = "";
    const out = await readSightingTextInCloud(`${text} call 404-555-0100`, consent, { generateCloud: async (t) => { sent = t; return { text: goodReply, inferenceSource: "in_cloud" }; }, killCloud: false });
    expect(sent).not.toContain("555");
    expect(out).toMatchObject({ sentBytes: new TextEncoder().encode(sent).length });
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

describe("the cloud read's server template", () => {
  it("returns the same closed fields, lists and caps the reply is checked against", () => {
    const out = template.output.schema as Record<string, { enum?: string[]; maxLength?: number }>;
    expect(Object.keys(out).sort()).toEqual(Object.keys(SIGHTING_CUES_JSON.properties).sort());
    for (const [k, v] of Object.entries(SIGHTING_CUES_JSON.properties) as [string, { enum?: readonly string[]; maxLength?: number }][]) {
      if (v.enum) expect(out[k]!.enum, k).toEqual([...v.enum]);
      if (v.maxLength) expect(out[k]!.maxLength, k).toBe(v.maxLength);
    }
    expect(template.templateId).toBe("pls-sighting-note-v1");
    expect(template.input.schema.note.maxLength).toBe(2000);
  });
});

describe("the note read's time limit", () => {
  it("is more than twice the slowest note read measured on Chrome's built-in model, and the command post uses it", async () => {
    const { readFileSync } = await import("node:fs");
    const { NOTE_READ_TIMEOUT_MS } = await import("./sightingText");
    const ev = JSON.parse(readFileSync(new URL("../../../docs/evidence/web/2026-11-21-note-read-chrome.json", import.meta.url), "utf8")) as { runs: { replyMs: number }[] };
    const slowest = Math.max(...ev.runs.map((r) => r.replyMs));
    expect(slowest).toBeGreaterThan(25_000);
    expect(NOTE_READ_TIMEOUT_MS).toBeGreaterThan(2 * slowest);
    expect(readFileSync(new URL("../command/CommandPost.tsx", import.meta.url), "utf8")).toMatch(/sightingTextGenerator\(ai\(\)\)\(t\), timeoutMs: NOTE_READ_TIMEOUT_MS/);
  });
});

describe("what the consent shows: the exact note a cloud read sends", () => {
  it("is the note with phone numbers removed, the same text the cloud read sends, with a count of what was removed", async () => {
    const { consentPreview } = await import("./sightingText");
    const typed = "A caller saw a man by the creek, call 404 555 0142 if found.";
    expect(consentPreview(typed)).toEqual({ text: "A caller saw a man by the creek, call [number removed] if found.", removed: 1, removedLine: "1 phone number removed." });
    let sent = "";
    await readSightingTextInCloud(typed, { byUid: "u", atMs: 1 }, { killCloud: false, generateCloud: async (t) => ((sent = t), { text: "{}", inferenceSource: "in_cloud" }) });
    expect(sent).toBe(consentPreview(typed).text);
  });
  it("counts each number removed, and says nothing when none was", async () => {
    const { consentPreview } = await import("./sightingText");
    expect(consentPreview("Call 404 555 0142 or 770 555 0199.").removedLine).toBe("2 phone numbers removed.");
    expect(consentPreview("Red jacket by the gate.")).toEqual({ text: "Red jacket by the gate.", removed: 0, removedLine: null });
    // A marker already in the note was not removed now.
    expect(consentPreview("Call [number removed] again.").removed).toBe(0);
  });
});
