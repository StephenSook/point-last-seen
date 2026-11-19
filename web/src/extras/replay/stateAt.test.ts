import { describe, expect, it } from "vitest";
import { viewState, type EventDoc } from "../hostApp";
import { T0, eventDoc, replayPlan, replayView, streamed } from "../testdata/replay";
import { fromLive, type ReplayData } from "./replayData";
import { frameKey, replayWindow, stateAt } from "./stateAt";

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
  it("finds the window of a very large run without spreading its times into one call", () => {
    const d = data();
    const one = d.events.find((e) => e.arrivedAtMs !== null)!;
    const many = Array.from({ length: 200_000 }, (_, k) => ({ ...one, eventId: `big${k}`, sentAtMs: T0 + k, arrivedAtMs: T0 + k + 1, clockSuspect: false }));
    const w = replayWindow({ ...d, events: many, plans: [] });
    expect(w?.startMs).toBe(T0);
    expect(w?.endMs).toBe(T0 + 200_000);
  });

  it("no arrived event gives no window", () => {
    const d = fromLive(replayView(), [streamed(eventDoc({ eventId: "p" }), null, true)], [])!;
    expect(replayWindow(d)).toBeNull();
  });

  it("spans the first send to the last arrival or approval", () => {
    const d = data();
    // No priorBuiltAtMs: the current prior (version 2) is in use from the first server time stamped with version 2.
    expect(replayWindow(d)).toEqual({ startMs: T0 + MIN, endMs: T0 + 20 * MIN, priorInUseFromMs: T0 + 3 * MIN });
  });

  it("with priorBuiltAtMs on the incident, that time is used", () => {
    expect(replayWindow(data({ priorBuiltAtMs: T0 + 12 * MIN }))!.priorInUseFromMs).toBe(T0 + 12 * MIN);
  });

  it("without it, the current prior is in use from the earliest server time stamped with its version, never earlier", () => {
    // Version 1 reports keep arriving after the rebuild; command promoted a sighting to rebuild at some unknown time
    // before the first version 2 report reached the server.
    const old = (id: string, sent: number, arrived: number) => streamed(eventDoc({ eventId: id, priorVersion: 1, clientTimeMs: sent, deviceId: "d9" }), arrived);
    const now = (id: string, sent: number, arrived: number) => streamed(eventDoc({ eventId: id, priorVersion: 2, clientTimeMs: sent, deviceId: "d9" }), arrived);
    const events = [old("o1", T0 + MIN, T0 + 2 * MIN), old("o2", T0 + 3 * MIN, T0 + 4 * MIN), now("n1", T0 + 9 * MIN, T0 + 10 * MIN), old("late", T0 + 5 * MIN, T0 + 12 * MIN)];
    const d = fromLive(replayView(), events, [])!;
    expect(replayWindow(d)!.priorInUseFromMs).toBe(T0 + 10 * MIN);
    // A plan approved on the current prior bounds it too, from its approval time.
    const withPlan = fromLive(replayView(), events, [replayPlan(1, T0 + 7 * MIN)])!;
    expect(replayWindow(withPlan)!.priorInUseFromMs).toBe(T0 + 7 * MIN);
  });

  it("with nothing stamped with the current version, no frame shows a map", () => {
    // The rebuild came after the last recorded activity, at a time nothing records: drawing the new prior at the last
    // report would backdate it.
    const old = streamed(eventDoc({ eventId: "o1", priorVersion: 1, clientTimeMs: T0 + MIN, deviceId: "d9" }), T0 + 2 * MIN);
    const d = fromLive(replayView(), [old], [])!;
    const w = replayWindow(d)!;
    expect(w.priorInUseFromMs).toBe(Number.POSITIVE_INFINITY);
    expect(w.endMs).toBe(T0 + 2 * MIN);
    expect(stateAt(d, w.endMs).phase).toBe("before_prior");
  });

  it("the first prior (version 1) was in use from the start", () => {
    const e = streamed(eventDoc({ eventId: "a", priorVersion: 1, clientTimeMs: T0 + MIN, deviceId: "d9" }), T0 + 5 * MIN);
    const d = fromLive(replayView({ priorVersion: 1 }), [e], [])!;
    expect(replayWindow(d)!.priorInUseFromMs).toBe(T0 + MIN);
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

describe("frameKey", () => {
  it("changes only at an arrival, a plan approval or the prior mark", () => {
    const d = data();
    const w = replayWindow(d)!;
    const key = (t: number) => frameKey(d, w, t);
    // Between the plan at +5 and the arrival at +10 nothing on the map changes.
    expect(new Set([T0 + 5 * MIN, T0 + 6 * MIN, T0 + 10 * MIN - 1].map(key)).size).toBe(1);
    expect(key(T0 + 10 * MIN)).not.toBe(key(T0 + 10 * MIN - 1));
    expect(key(T0 + 15 * MIN)).not.toBe(key(T0 + 15 * MIN - 1));
    expect(key(w.priorInUseFromMs)).not.toBe(key(w.priorInUseFromMs - 1));
  });

  it("two times with the same key give the same frame", () => {
    const d = data();
    const w = replayWindow(d)!;
    const a = stateAt(d, T0 + 6 * MIN);
    const b = stateAt(d, T0 + 9 * MIN);
    expect(frameKey(d, w, T0 + 6 * MIN)).toBe(frameKey(d, w, T0 + 9 * MIN));
    expect(b.shown.map((e) => e.eventId)).toEqual(a.shown.map((e) => e.eventId));
    if (a.phase !== "replayable" || b.phase !== "replayable") throw new Error("expected replayable frames");
    expect(b.view.code).toBe(a.view.code);
    expect(b.planVersion).toBe(a.planVersion);
  });
});
