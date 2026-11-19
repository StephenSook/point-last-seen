import { describe, expect, it } from "vitest";
import { settledDraw } from "./frames";

const frame = (v: number) => new Float32Array([v, v, v]);

describe("settledDraw", () => {
  it("redraws a sample that repeats the previous one, so a frame not yet decoded is not taken as stillness", async () => {
    const draws = [frame(0.2), frame(0.2), frame(0.7)]; // the first draw still shows the previous frame
    let waits = 0;
    const out = await settledDraw(() => draws.shift()!, frame(0.2), async () => { waits++; }, 3);
    expect(Array.from(out)).toEqual(Array.from(frame(0.7)));
    expect(waits).toBe(2);
  });
  it("accepts a frame that is still the same after the retries (a still clip)", async () => {
    let draws = 0;
    const out = await settledDraw(() => { draws++; return frame(0.2); }, frame(0.2), async () => {}, 3);
    expect(Array.from(out)).toEqual(Array.from(frame(0.2)));
    expect(draws).toBe(4);
  });
  it("draws once when the frame differs from the previous one, or there is none", async () => {
    let draws = 0;
    await settledDraw(() => { draws++; return frame(0.5); }, frame(0.2), async () => {}, 3);
    await settledDraw(() => { draws++; return frame(0.5); }, null, async () => {}, 3);
    expect(draws).toBe(2);
  });
});
