import { describe, expect, it } from "vitest";
import type { ChangeResult } from "../command/changeModel";
import { beatTotalMs, MOTION, reportBeatPlan } from "./plan";

const change = (ids: string[]): ChangeResult => ({
  changed: ids.map((segmentId, i) => ({ segmentId, fromPct: 10, toPct: 10 + (ids.length - i), deltaPts: ids.length - i })),
  banner: "b",
  announce: "a",
});
const change3 = change(["AC", "AB", "AD"]);
const dist3 = { AC: 300, AB: 120, AD: 800 };
const ids12 = Array.from({ length: 12 }, (_, i) => `A${String.fromCharCode(65 + i)}`);
const change12 = change(ids12);
const dist12 = Object.fromEntries(ids12.map((id, i) => [id, 1000 - i * 50]));
const nearestFirst = (d: Record<string, number>) => Object.keys(d).sort((a, b) => d[a]! - d[b]!);

describe("motion plan (spec 22.1)", () => {
  it("motion tokens hold the measured values", () => {
    expect(MOTION.enter).toEqual({ ms: 350, ease: "out(3)" });
    expect(MOTION.exit).toEqual({ ms: 250, ease: "inOut(3)" });
    expect(MOTION.stroke).toEqual({ ms: 50, ease: "outQuart" });
    expect(MOTION.lineDraw).toEqual({ minMs: 600, maxMs: 1000, ease: "inOutExpo" });
    expect(MOTION.release).toEqual({ bounce: 0.35, ms: 400 });
  });

  it("the REPORT beat has seven steps at the planned offsets and ends at 2000 ms", () => {
    const p = reportBeatPlan(change3, dist3, false);
    expect(p.map((s) => [s.id, s.atMs, s.durationMs])).toEqual([
      ["pin", 0, 400], ["arc", 100, 600], ["lightness", 300, 800], ["pulse", 300, 350], ["chips", 900, 350], ["reorder", 1100, 350], ["arcFade", 1750, 250],
    ]);
    expect(p[1]!.ease).toBe("inOutExpo");
    expect(p[3]!.ease).toBe("outQuart");
    expect(beatTotalMs(p)).toBe(2000);
  });

  it("lightness is staggered by distance, nearest first, and the spread is capped", () => {
    const few = reportBeatPlan(change3, dist3, false)[2]!;
    expect(few.staggerMs).toBe(40);
    expect(few.order).toEqual(nearestFirst(dist3));
    const many = reportBeatPlan(change12, dist12, false);
    expect(many[2]!.staggerMs! * 11).toBeLessThanOrEqual(300);
    expect(beatTotalMs(many)).toBe(2000);
  });

  it("reduced motion is one 150 ms fade and nothing else", () => {
    expect(reportBeatPlan(change3, dist3, true)).toEqual([{ id: "fade", atMs: 0, durationMs: 150, ease: "linear" }]);
  });
});
