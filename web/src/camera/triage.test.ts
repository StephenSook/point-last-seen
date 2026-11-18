import { describe, expect, it } from "vitest";
import { InferenceMode } from "firebase/ai";
import { FRAME_JSON, FRAME_OPTS, frameCheckParams, parseFrameCheck } from "../ai/frameCheck";
import { triageClip, type TriageDeps } from "./triage";
import type { MotionFrame } from "./motion";

const W = 64;
const H = 36;
const still = (t: number): MotionFrame => ({ t, px: new Float32Array(W * H).fill(0.5) });
const withBox = (t: number, x: number): MotionFrame => {
  const f = still(t);
  for (let y = 10; y < 20; y++) for (let k = x; k < x + 6; k++) f.px[y * W + k] = 0.2;
  return f;
};
// 20 s: a mover from 2 to 4 s and another from 12 to 14 s.
const twoMovers = Array.from({ length: 40 }, (_, i) => {
  const t = i * 0.5;
  return t >= 2 && t <= 4 ? withBox(t, Math.round((t - 2) * 10)) : t >= 12 && t <= 14 ? withBox(t, 40 + Math.round((t - 12) * 10)) : still(t);
});

function deps(over: Partial<TriageDeps> & { answers?: string[] } = {}) {
  const asked: number[] = [];
  const answers = [...(over.answers ?? [])];
  const d: TriageDeps & { asked: number[]; sampled: number } = {
    asked,
    sampled: 0,
    available: async () => true,
    sample: async () => { d.sampled++; return { durationS: 20, frames: twoMovers }; },
    frameJpeg: async (t) => { asked.push(t); return "JPEG"; },
    checkFrame: async () => ({ text: answers.shift() ?? JSON.stringify({ personVisible: false }) }),
    now: () => 0,
    ...over,
  };
  return d;
}

describe("frame check parameters", () => {
  it("runs only on this laptop's model, asking only whether a person is in the frame", () => {
    const p = frameCheckParams();
    expect(p.mode).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(p.onDeviceParams?.createOptions).toBe(FRAME_OPTS);
    expect(p.onDeviceParams?.promptOptions?.responseConstraint).toEqual(FRAME_JSON);
    expect(FRAME_OPTS.expectedInputs?.some((i) => i.type === "image")).toBe(true);
  });
  it("reads true or false, and nothing else", () => {
    expect(parseFrameCheck('{"personVisible":true}')).toBe(true);
    expect(parseFrameCheck('{"personVisible":false}')).toBe(false);
    expect(parseFrameCheck('{"personVisible":"yes"}')).toBeNull();
    expect(parseFrameCheck("{")).toBeNull();
  });
});

describe("triageClip", () => {
  it("without this laptop's model it samples nothing and leaves the clip to the consented cloud read", async () => {
    const d = deps({ available: async () => false });
    expect(await triageClip(d)).toEqual({ kind: "no-model" });
    expect(d.sampled).toBe(0);
  });

  it("a still clip asks no model", async () => {
    const d = deps({ sample: async () => ({ durationS: 10, frames: Array.from({ length: 20 }, (_, i) => still(i * 0.5)) }) });
    expect(await triageClip(d)).toMatchObject({ kind: "no-motion" });
    expect(d.asked).toEqual([]);
  });

  it("checks one frame per moving span, at its peak, and finds no person", async () => {
    const d = deps();
    const r = await triageClip(d);
    expect(r).toMatchObject({ kind: "no-person" });
    expect(d.asked).toHaveLength(2);
    expect(d.asked[0]).toBeGreaterThanOrEqual(2);
    expect(d.asked[1]).toBeGreaterThanOrEqual(12);
  });

  it("flags only the span where the laptop's model saw a person", async () => {
    const r = await triageClip(deps({ answers: [JSON.stringify({ personVisible: false }), JSON.stringify({ personVisible: true })] }));
    expect(r).toMatchObject({ kind: "flagged", window: { startS: 10.5, endS: 15.5 } });
  });

  it("covers every flagged span, first start to last end", async () => {
    const r = await triageClip(deps({ answers: [JSON.stringify({ personVisible: true }), JSON.stringify({ personVisible: true })] }));
    expect(r).toMatchObject({ kind: "flagged", window: { startS: 0.5, endS: 15.5 } });
  });

  it("an answer it cannot read counts as a person, so nothing is missed", async () => {
    const r = await triageClip(deps({ answers: ["{", JSON.stringify({ personVisible: false })] }));
    expect(r).toMatchObject({ kind: "flagged", window: { startS: 0.5, endS: 5.5 } });
  });

  it("a failed check or an undecodable clip ends triage, leaving the consented cloud read", async () => {
    expect(await triageClip(deps({ checkFrame: async () => { throw new Error("x"); } }))).toEqual({ kind: "unavailable" });
    expect(await triageClip(deps({ sample: async () => { throw new Error("x"); } }))).toEqual({ kind: "unavailable" });
  });
});
