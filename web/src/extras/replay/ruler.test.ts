import { describe, expect, it } from "vitest";
import { T0, cameraReading, eventDoc, replayPlan, replayView, streamed } from "../testdata/replay";
import { fromLive, type ReplayData } from "./replayData";
import { clockLabel, durationLabel, MAX_TICKS, markTimes, nextMark, nextMarkTime, playFrom, playStops, reportCount, rulerModel, sliderScale, tickStepMs, valueText, PLAY_STOP_MS } from "./ruler";
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
  it("never draws more than MAX_TICKS ticks, however long the window", () => {
    const d = data();
    const w = replayWindow(d)!;
    const tenYears = { ...w, endMs: w.startMs + 10 * 365 * 24 * 60 * MIN };
    const m = rulerModel(d, tenYears, WIDTH, "UTC");
    expect(m.ticks.length).toBeGreaterThan(0);
    expect(m.ticks.length).toBeLessThanOrEqual(MAX_TICKS);
  });

  it("labels a time outside the dates a clock can show without throwing", () => {
    expect(() => clockLabel(9e15, "UTC")).not.toThrow();
    expect(clockLabel(9e15, "UTC")).toBe("--:--");
    expect(clockLabel(Number.NaN, "UTC")).toBe("--:--");
  });

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

describe("a prior that came into use after the window", () => {
  it("puts no prior mark on the ruler and no prior time among the marks", () => {
    const d = fromLive(replayView(), [streamed(eventDoc({ eventId: "o1", priorVersion: 1, clientTimeMs: T0, deviceId: "d9" }), T0 + MIN)], [])!;
    const w = replayWindow(d)!;
    expect(rulerModel(d, w, WIDTH, "UTC").marks.some((k) => k.kind === "prior")).toBe(false);
    expect(markTimes(d, w)).toEqual([T0 + MIN]);
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

describe("durationLabel", () => {
  it("says the time since the start in whole minutes, with hours past the first hour", () => {
    expect(durationLabel(0)).toBe("0 min");
    expect(durationLabel(-1)).toBe("0 min");
    expect(durationLabel(42 * MIN + 59_999)).toBe("42 min");
    expect(durationLabel(60 * MIN)).toBe("1 h 0 min");
    expect(durationLabel(21 * 60 * MIN + 18 * MIN + 34_000)).toBe("21 h 18 min");
  });
});

describe("reportCount and valueText", () => {
  it("counts the reports that had arrived by a time, out of every arrived report", () => {
    const d = data();
    expect(reportCount(d, T0)).toEqual({ shown: 0, total: 6 });
    // Arrivals at +2.5, +5 and +6 by then; +8, +10 and +11 later.
    expect(reportCount(d, T0 + 6 * MIN)).toEqual({ shown: 3, total: 6 });
    expect(reportCount(d, T0 + 11 * MIN)).toEqual({ shown: 6, total: 6 });
  });

  it("the replay's one clock, which the slider also announces: time since the start, then the report", () => {
    expect(valueText(T0 + 21 * 60 * MIN + 18 * MIN + 34_000, T0, { shown: 24, total: 24 })).toBe("21 h 18 min, report 24 of 24");
    expect(valueText(T0 + 42 * MIN, T0, { shown: 3, total: 24 })).toBe("42 min, report 3 of 24");
    expect(valueText(T0, T0, { shown: 0, total: 24 })).toBe("0 min, report 0 of 24");
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

describe("playStops", () => {
  it("Play holds on the first stored map, each report after it and the end, never in the span with no map", () => {
    const d = data();
    const w = replayWindow(d)!;
    // The prior came into use at +3; reports arrive after it at +5, +6, +8 and +10; the window ends at +11 (an
    // acknowledgement, which moves no map, so it is a stop only as the end).
    expect(playStops(d, w)).toEqual([3, 5, 6, 8, 10, 11].map((m) => T0 + m * MIN));
    expect(PLAY_STOP_MS).toBe(1_500);
  });

  it("with no stored map at any time, Play still steps report by report from the start", () => {
    const d = fromLive(replayView(), [
      streamed(eventDoc({ eventId: "a", priorVersion: 1, clientTimeMs: T0, deviceId: "d9" }), T0 + MIN),
      streamed(eventDoc({ eventId: "b", priorVersion: 1, clientTimeMs: T0 + 2 * MIN, deviceId: "d9" }), T0 + 3 * MIN),
    ], [])!;
    const w = replayWindow(d)!;
    expect(w.priorInUseFromMs).toBe(Number.POSITIVE_INFINITY);
    expect(playStops(d, w)).toEqual([T0, T0 + MIN, T0 + 3 * MIN]);
  });

  it("Play starts on the first stop from the end or the span before it, and otherwise from where the slider is", () => {
    const stops = [3, 5, 6, 11].map((m) => T0 + m * MIN);
    expect(playFrom(stops, T0 + 11 * MIN)).toBe(T0 + 3 * MIN);
    expect(playFrom(stops, T0 + MIN)).toBe(T0 + 3 * MIN);
    expect(playFrom(stops, T0 + 5.5 * MIN)).toBe(T0 + 6 * MIN);
    expect(playFrom(stops, T0 + 6 * MIN)).toBe(T0 + 6 * MIN);
  });
});
