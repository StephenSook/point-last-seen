import { describe, expect, it } from "vitest";
import { viewState, type EventDoc } from "../laneC";
import { T0, eventDoc, replayPlan, replayView, streamed } from "../testdata/replay";
import { fromLive, type ReplayData } from "./replayData";
import { replayWindow, stateAt } from "./stateAt";

const MIN = 60_000;

function data(over: object = {}, extra: ReturnType<typeof streamed>[] = []): ReplayData {
  const events = [
    // Sent at +1 min, arrived at +10 min after nine minutes without signal.
    streamed(eventDoc({ eventId: "e1", clientTimeMs: T0 + MIN, deviceId: "d9", effect: { kind: "clue", influences: { AA: "strong_for" }, authenticity: "high" } }), T0 + 10 * MIN),
    streamed(eventDoc({ eventId: "e2", clientTimeMs: T0 + 2 * MIN, deviceId: "d9", effect: { kind: "clue", influences: { AB: "for" }, authenticity: "high" } }), T0 + 3 * MIN),
    streamed(eventDoc({ eventId: "e3", type: "retraction", role: "command", teamId: null, deviceId: "cmd", clientTimeMs: T0 + 19 * MIN, targetEventId: "e1", effect: { kind: "none", why: "informational" } }), T0 + 20 * MIN),
    streamed(eventDoc({ eventId: "pend", clientTimeMs: T0 + 21 * MIN, deviceId: "d9" }), null, true),
    ...extra,
  ];
  return fromLive(replayView(over), events, [replayPlan(1, T0 + 5 * MIN), replayPlan(2, T0 + 15 * MIN)])!;
}

const arrivedDocs = (d: ReplayData): EventDoc[] => d.events.filter((e) => e.arrivedAtMs !== null).map((e) => e.doc);

describe("replayWindow", () => {
  it("no arrived event gives no window", () => {
    const d = fromLive(replayView(), [streamed(eventDoc({ eventId: "p" }), null, true)], [])!;
    expect(replayWindow(d)).toBeNull();
  });

  it("spans the first send to the last arrival or approval", () => {
    const d = data();
    expect(replayWindow(d)).toEqual({ startMs: T0 + MIN, endMs: T0 + 20 * MIN, priorInUseFromMs: T0 + MIN });
  });

  it("with priorBuiltAtMs on the incident, that time is used", () => {
    expect(replayWindow(data({ priorBuiltAtMs: T0 + 12 * MIN }))!.priorInUseFromMs).toBe(T0 + 12 * MIN);
  });

  it("without it, the latest arrival of a prior input or an older-prior report is used", () => {
    const old = streamed(eventDoc({ eventId: "old", priorVersion: 1, clientTimeMs: T0 + 7 * MIN, deviceId: "d9" }), T0 + 8 * MIN);
    const input = streamed(eventDoc({ eventId: "e0", clientTimeMs: T0 + 3 * MIN, deviceId: "d9" }), T0 + 4 * MIN);
    expect(replayWindow(data({}, [old, input]))!.priorInUseFromMs).toBe(T0 + 8 * MIN);
    expect(replayWindow(data({}, [input]))!.priorInUseFromMs).toBe(T0 + 4 * MIN);
  });

  it("a prior that came into use after the last report extends the window to it", () => {
    expect(replayWindow(data({ priorBuiltAtMs: T0 + 30 * MIN }))).toMatchObject({ endMs: T0 + 30 * MIN });
  });
});

describe("stateAt", () => {
  it("at the end of the window the frame equals the live view", () => {
    const d = data();
    const w = replayWindow(d)!;
    const f = stateAt(d, w.endMs);
    if (f.phase !== "replayable") throw new Error("expected a replayable frame");
    const live = viewState(d.prior, arrivedDocs(d), d.priorInputEventIds, d.params, d.priorVersion);
    expect(f.view.code).toBe(live.code);
    expect(f.view.result.poa).toEqual(live.result.poa);
    expect(f.view.rank).toEqual(live.rank);
  });

  it("the shown set only grows with time", () => {
    const d = data({}, [streamed(eventDoc({ eventId: "e4", clientTimeMs: T0 + 6 * MIN, deviceId: "d9" }), T0 + 6 * MIN)]);
    let prev: string[] = [];
    for (let i = 0; i < 10; i++) {
      const now = stateAt(d, T0 + i * 3 * MIN).shown.map((e) => e.eventId);
      expect(now.slice(0, prev.length)).toEqual(prev);
      prev = now;
    }
    expect(prev).toEqual(["e2", "e4", "e1", "e3"]);
  });

  it("an event is shown from its arrival time, not its sent time", () => {
    const d = data();
    expect(stateAt(d, T0 + 9 * MIN).shown.map((e) => e.eventId)).not.toContain("e1");
    expect(stateAt(d, T0 + 10 * MIN).shown.map((e) => e.eventId)).toContain("e1");
  });

  it("before the current prior was in use the frame has no POA", () => {
    const d = data({ priorBuiltAtMs: T0 + 12 * MIN });
    const f = stateAt(d, T0 + 11 * MIN);
    expect(f.phase).toBe("before_prior");
    expect("view" in f).toBe(false);
    expect(f.shown.map((e) => e.eventId)).toEqual(["e2", "e1"]);
    expect(stateAt(d, T0 + 12 * MIN).phase).toBe("replayable");
  });

  it("a retraction removes its target only from the retraction's arrival on", () => {
    const d = data();
    const before = stateAt(d, T0 + 19 * MIN);
    const after = stateAt(d, T0 + 20 * MIN);
    if (before.phase !== "replayable" || after.phase !== "replayable") throw new Error("expected replayable frames");
    expect(before.view.result.appliedEventIds).toContain("e1");
    expect(after.view.result.appliedEventIds).not.toContain("e1");
    expect(after.view.result.poa).not.toEqual(before.view.result.poa);
  });

  it("the plan version is the latest approved at or before t", () => {
    const d = data();
    const version = (t: number) => {
      const f = stateAt(d, t);
      return f.phase === "replayable" ? f.planVersion : "before";
    };
    expect([version(T0 + 4 * MIN), version(T0 + 5 * MIN), version(T0 + 14 * MIN), version(T0 + 15 * MIN)]).toEqual([null, 1, 1, 2]);
  });

  it("pending writes never appear in a frame", () => {
    const d = data();
    expect(stateAt(d, T0 + 24 * 60 * MIN).shown.map((e) => e.eventId)).not.toContain("pend");
  });
});
