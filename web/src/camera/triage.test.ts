import { describe, expect, it } from "vitest";
import { InferenceMode } from "firebase/ai";
import { FRAME_JSON, FRAME_OPTS, frameCheckParams, parseFrameCheck } from "../ai/frameCheck";
import { triageClip, triageRoute, type TriageDeps } from "./triage";
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

  it("keeps where the frame checks ran: on this laptop only when the SDK reported it for every frame", async () => {
    expect(await triageClip(deps({ checkFrame: async () => ({ text: JSON.stringify({ personVisible: false }), inferenceSource: "on_device" }) }))).toMatchObject({ kind: "no-person", source: "on_device" });
    expect(await triageClip(deps())).toMatchObject({ kind: "no-person", source: "unknown" });
    let n = 0;
    const mixed = deps({ checkFrame: async () => ({ text: JSON.stringify({ personVisible: false }), ...(n++ === 0 ? { inferenceSource: "on_device" } : {}) }) });
    expect(await triageClip(mixed)).toMatchObject({ kind: "no-person", source: "unknown" });
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

describe("triageRoute", () => {
  it("records a still clip as a code decision with no model asked", () => {
    expect(triageRoute({ kind: "no-motion", latencyMs: 40 }, 1000)).toEqual({
      platform: "web", path: "rules", stage: "deterministic_parser", model: "motion-check", reason: "triage_no_motion", latencyMs: 40, sdkReported: false, blocked: null, decidedAtMs: 1000,
    });
  });
  it("records no person as this laptop's model deciding when the SDK said so for every frame", () => {
    expect(triageRoute({ kind: "no-person", windows: [], latencyMs: 900, source: "on_device" }, 1000)).toMatchObject({ path: "on_device", stage: "sdk", model: "chrome-built-in", reason: "on_device_triage_no_person", latencyMs: 900, sdkReported: true });
  });
  it("records an unreported source as unknown, so it never counts as this laptop", () => {
    expect(triageRoute({ kind: "no-person", windows: [], latencyMs: 900, source: "unknown" }, 1000)).toMatchObject({ path: "unknown", sdkReported: false, reason: "on_device_triage_no_person" });
  });
  it("records nothing for the other results (the cloud read traces itself)", () => {
    expect(triageRoute({ kind: "no-model" }, 1)).toBeNull();
    expect(triageRoute({ kind: "flagged", window: { startS: 0, endS: 1 }, windows: [], latencyMs: 1 }, 1)).toBeNull();
  });
});
