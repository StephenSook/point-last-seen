import { describe, expect, it } from "vitest";
import { T0, cameraReading, eventDoc, replayPlan, replayView, streamed } from "../testdata/replay";
import { fromLive, type ReplayData } from "./replayData";
import { elapsedLabel, markTimes, nextMark, nextMarkTime, playbackStep, rulerModel, sliderScale, tickStepMs, valueText, PLAY_WINDOW_IN_MS } from "./ruler";
import { replayWindow, type ReplayWindow } from "./stateAt";

const MIN = 60_000;
const WIDTH = 600;

function data(): ReplayData {
  const events = [
    // Nine minutes without signal.
    streamed(eventDoc({ eventId: "clue", clientTimeMs: T0 + MIN, deviceId: "d9" }), T0 + 10 * MIN),
    // 30 seconds: under the one-minute line.
    streamed(eventDoc({ eventId: "quick", clientTimeMs: T0 + 2 * MIN, deviceId: "d9" }), T0 + 2 * MIN + 30_000),
    // Clock suspect: arrived before it was sent.
    streamed(eventDoc({ eventId: "skew", clientTimeMs: T0 + 30 * MIN, deviceId: "d9" }), T0 + 5 * MIN),
    streamed(eventDoc({ eventId: "seen", type: "sighting", teamId: "bravo", clientTimeMs: T0 + 6 * MIN, deviceId: "d9" }), T0 + 6 * MIN),
    // Camera: person in view one second, at +7 min on the wall clock.
    streamed(
      eventDoc({ eventId: "cam", type: "camera_sighting", clientTimeMs: T0 + 8 * MIN, deviceId: "d9", reading: cameraReading({ clipStartMs: T0 + 7 * MIN }, { firstSeen: "00:00", lastSeen: "00:01", keyFrame: { time: "00:00", box2d: [1, 1, 2, 2] } }) }),
      T0 + 8 * MIN,
    ),
    streamed(eventDoc({ eventId: "ack", type: "plan_ack", clientTimeMs: T0 + 11 * MIN, deviceId: "d9" }), T0 + 11 * MIN),
  ];
  return fromLive(replayView({ priorBuiltAtMs: T0 + 3 * MIN }), events, [replayPlan(1, T0 + 4 * MIN)])!;
}

const model = (d = data(), w: ReplayWindow = replayWindow(d)!) => rulerModel(d, w, WIDTH, "UTC");

describe("tickStepMs", () => {
  it("tick step is 1 minute up to 20 minutes, 5 up to 2 hours, 15 up to 6 hours, else 60", () => {
    expect([20 * MIN, 20 * MIN + 1, 120 * MIN, 120 * MIN + 1, 360 * MIN, 360 * MIN + 1].map(tickStepMs)).toEqual([
      60_000, 300_000, 300_000, 900_000, 900_000, 3_600_000,
    ]);
  });
});

describe("rulerModel", () => {
  it("every x is inside 0 to the width", () => {
    const m = model();
    const xs = [...m.ticks.map((t) => t.x), ...m.marks.map((t) => t.x), ...m.spans.flatMap((s) => [s.x0, s.x1]), ...m.bands.flatMap((b) => [b.x0, b.x1])];
    expect(xs.length).toBeGreaterThan(10);
    for (const x of xs) expect(x >= 0 && x <= WIDTH).toBe(true);
  });

  it("ticks fall on whole steps, and their labels are clock times that do not crowd", () => {
    const m = model();
    expect(m.ticks.every((t) => t.tMs % 60_000 === 0)).toBe(true);
    const labelled = m.ticks.filter((t) => t.label !== null);
    expect(labelled[0]!.label).toMatch(/^[0-2][0-9]:[0-5][0-9]$/);
    for (let i = 1; i < labelled.length; i++) expect(labelled[i]!.x - labelled[i - 1]!.x).toBeGreaterThanOrEqual(48);
  });

  it("marks are sorted by x and carry one kind each", () => {
    const m = model();
    expect(m.marks.map((k) => k.x)).toEqual([...m.marks.map((k) => k.x)].sort((a, b) => a - b));
    const kinds = Object.fromEntries(m.marks.map((k) => [k.id, k.kind]));
    expect(kinds).toEqual({ clue: "report", quick: "report", skew: "report", seen: "sighting", cam: "camera", "plan-1": "plan", prior: "prior" });
    expect(m.marks.every((k) => k.label.length > 0)).toBe(true);
  });

  it("a span is drawn only for a wait of 60 seconds or more, and never for a clock-suspect report", () => {
    expect(model().spans).toEqual([{ eventId: "clue", x0: expect.any(Number), x1: expect.any(Number), minutes: 9 }]);
    const s = model().spans[0]!;
    expect(s.x1 - s.x0).toBeCloseTo((9 / 10) * WIDTH, 5);
  });

  it("a camera band narrower than 2 px is widened to 2 px", () => {
    const b = model().bands;
    expect(b).toHaveLength(1);
    expect(b[0]!.x1 - b[0]!.x0).toBeCloseTo(2, 5);
  });

  it("a plan mark sits at its approval time; the prior mark sits where the current prior came into use", () => {
    const d = data();
    const w = replayWindow(d)!;
    const m = model(d, w);
    const x = (t: number) => ((t - w.startMs) / (w.endMs - w.startMs)) * WIDTH;
    expect(m.marks.find((k) => k.id === "plan-1")!.x).toBeCloseTo(x(T0 + 4 * MIN), 5);
    expect(m.marks.find((k) => k.id === "prior")!.x).toBeCloseTo(x(T0 + 3 * MIN), 5);
  });

  it("a one-instant window does not divide by zero", () => {
    const d = fromLive(replayView(), [streamed(eventDoc({ eventId: "only", clientTimeMs: T0, deviceId: "d9" }), T0)], [])!;
    const m = rulerModel(d, replayWindow(d)!, WIDTH, "UTC");
    expect(m.marks.every((k) => Number.isFinite(k.x))).toBe(true);
  });
});

describe("nextMark", () => {
  it("steps to the next and previous mark, and returns null past the last mark", () => {
    const m = model();
    const xs = m.marks.map((k) => k.x);
    expect(nextMark(m, xs[0]!, 1)).toBe(xs.find((x) => x > xs[0]!));
    expect(nextMark(m, xs[xs.length - 1]!, 1)).toBeNull();
    expect(nextMark(m, xs[0]!, -1)).toBeNull();
    expect(nextMark(m, WIDTH, -1)).toBe(xs[xs.length - 1]);
  });
});

describe("markTimes and nextMarkTime", () => {
  it("lists each marked time once, in order, and steps between them", () => {
    const d = data();
    const times = markTimes(d, replayWindow(d)!);
    expect(times).toEqual([...new Set(times)].sort((a, b) => a - b));
    // Reports at +2.5, +5, +6, +8 and +10 min, the prior at +3 and the plan at +4; never the acknowledgement at +11.
    expect(times).toEqual([2.5, 3, 4, 5, 6, 8, 10].map((m) => T0 + m * MIN));
    expect(nextMarkTime(times, T0 + 4 * MIN, 1)).toBe(T0 + 5 * MIN);
    expect(nextMarkTime(times, T0 + 4 * MIN, -1)).toBe(T0 + 3 * MIN);
    expect(nextMarkTime(times, T0 + 10 * MIN, 1)).toBeNull();
    expect(nextMarkTime(times, T0 + 2.5 * MIN, -1)).toBeNull();
  });
});

describe("elapsedLabel", () => {
  it("elapsedLabel pads hours, minutes and seconds", () => {
    expect(elapsedLabel(T0 + 42 * MIN + 10_000, T0)).toBe("00:42:10");
    expect(elapsedLabel(T0 + 3 * 3_600_000 + 5_000, T0)).toBe("03:00:05");
    expect(elapsedLabel(T0 - 1, T0)).toBe("00:00:00");
  });
});

describe("valueText", () => {
  it("says the clock time and how far in, for the slider's announcement", () => {
    expect(valueText(Date.UTC(2026, 10, 22, 14, 45, 10), Date.UTC(2026, 10, 22, 14, 3), "UTC")).toBe("14:45, 42 minutes in");
    expect(valueText(Date.UTC(2026, 10, 22, 14, 4, 30), Date.UTC(2026, 10, 22, 14, 3), "UTC")).toBe("14:04, 1 minute in");
    expect(valueText(Date.UTC(2026, 10, 22, 14, 45), Date.UTC(2026, 10, 22, 14, 3), "America/New_York")).toBe("09:45, 42 minutes in");
  });
});

describe("sliderScale", () => {
  it("the slider's last step reaches the window end even when the span is not a whole number of seconds", () => {
    const w = { startMs: T0 + 1_000, endMs: T0 + 15 * MIN + 1_123, priorInUseFromMs: T0 };
    const s = sliderScale(w);
    expect(s.max % 1000).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(w.endMs - w.startMs);
    expect(s.timeOf(s.max)).toBe(w.endMs);
    expect(s.timeOf(0)).toBe(w.startMs);
    // At the end the thumb sits on the last step, never snapped one step short.
    expect(s.valueOf(w.endMs)).toBe(s.max);
    expect(s.timeOf(s.valueOf(T0 + 5 * MIN))).toBe(T0 + 5 * MIN);
  });
});

describe("playbackStep", () => {
  it("the whole window plays in 30 seconds and stops at the end", () => {
    const w = { startMs: T0, endMs: T0 + 60 * MIN, priorInUseFromMs: T0 };
    expect(PLAY_WINDOW_IN_MS).toBe(30_000);
    expect(playbackStep(T0, 15_000, w)).toBe(T0 + 30 * MIN);
    expect(playbackStep(T0 + 59 * MIN, 15_000, w)).toBe(T0 + 60 * MIN);
  });
});
