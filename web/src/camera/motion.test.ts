import { describe, expect, it } from "vitest";
import { MOTION, motionWindows, type MotionFrame } from "./motion";

const W = 64;
const H = 36;
// A grey frame (0.5) with fixed faint noise, a dark box at column x (null: no box), and a brightness offset.
function frame(t: number, boxX: number | null, offset = 0, seed = 1): MotionFrame {
  const px = new Float32Array(W * H);
  for (let i = 0; i < px.length; i++) px[i] = 0.5 + offset + (((i * 2654435761 + seed * 97) % 1000) / 1000 - 0.5) * 0.002;
  if (boxX !== null) for (let y = 14; y < 22; y++) for (let x = boxX; x < boxX + 8 && x < W; x++) px[y * W + x] = 0.25 + offset;
  return { t, px };
}
const times = (n: number) => Array.from({ length: n }, (_, i) => i * 0.5);

describe("motionWindows", () => {
  it("finds nothing in a still clip with sensor noise", () => {
    expect(motionWindows(times(20).map((t, i) => frame(t, null, 0, i)), W, H, 10)).toEqual([]);
  });

  it("ignores a whole-frame brightness change (exposure), with nothing moving", () => {
    expect(motionWindows(times(20).map((t, i) => frame(t, null, i * 0.01)), W, H, 10)).toEqual([]);
  });

  it("finds one padded window around a box crossing from 3 s to 6 s, peaking inside it", () => {
    const fs = times(20).map((t) => frame(t, t >= 3 && t <= 6 ? Math.round((t - 3) * 16) : null));
    const ws = motionWindows(fs, W, H, 10);
    expect(ws).toHaveLength(1);
    expect(ws[0]!.startS).toBe(2.5 - MOTION.padS);
    expect(ws[0]!.endS).toBe(6.5 + MOTION.padS);
    expect(ws[0]!.peakS).toBeGreaterThanOrEqual(3);
    expect(ws[0]!.peakS).toBeLessThanOrEqual(6.5);
  });

  it("keeps two crossings apart when the gap between them is longer than the merge gap, and clamps to the clip", () => {
    const fs = times(40).map((t) => frame(t, t <= 1 ? Math.round(t * 20) : t >= 15 && t <= 16 ? Math.round((t - 15) * 30) : null));
    const ws = motionWindows(fs, W, H, 20);
    expect(ws.map((w) => [w.startS, w.endS])).toEqual([[0, 1.5 + MOTION.padS], [14.5 - MOTION.padS, 16.5 + MOTION.padS]]);
  });

  it("merges crossings closer than the merge gap", () => {
    const fs = times(20).map((t) => frame(t, t >= 2 && t <= 3 ? Math.round((t - 2) * 30) : t >= 3.5 && t <= 4.5 ? Math.round((t - 3.5) * 30) + 10 : null));
    expect(motionWindows(fs, W, H, 10)).toHaveLength(1);
  });

  it("keeps at most four windows, the strongest ones, in time order", () => {
    const fs = times(60).map((t) => {
      const k = Math.floor(t / 5);
      return frame(t, t % 5 >= 1 && t % 5 <= 2 ? Math.round((t % 5) * 10) + k : null);
    });
    const ws = motionWindows(fs, W, H, 30);
    expect(ws.length).toBe(MOTION.maxWindows);
    expect(ws.map((w) => w.startS)).toEqual([...ws.map((w) => w.startS)].sort((a, b) => a - b));
  });
});
