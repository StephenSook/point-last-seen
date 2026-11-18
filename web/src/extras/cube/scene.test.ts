import { describe, expect, it } from "vitest";
import type { EventDoc } from "../laneC";
import { fromLive } from "../replay/replayData";
import { replayWindow } from "../replay/stateAt";
import { T0, eventDoc, replayView, streamed } from "../testdata/replay";
import { cubeGate, cubeScene, type CubeScene } from "./scene";

const MIN = 60_000;
const at = (dLat: number, dLon = 0) => ({ lat: 33.7805 + dLat, lon: -84.3695 + dLon, accuracyM: 5 });
const confirm = (eventId: string, target: string) =>
  ({ eventId, type: "confirmation", role: "command", teamId: null, deviceId: "cmd", targetEventId: target, decision: "confirmed", effect: { kind: "none", why: "informational" } }) as const;

function scene(docs: [Partial<EventDoc> & { eventId: string }, number][]): CubeScene {
  const d = fromLive(replayView(), docs.map(([doc, arrived]) => streamed(eventDoc({ deviceId: "d9", ...doc }), arrived)), [])!;
  return cubeScene(d, replayWindow(d)!);
}

const four: [Partial<EventDoc> & { eventId: string }, number][] = [
  // Five minutes without signal.
  [{ eventId: "r1", clientTimeMs: T0, position: at(0) }, T0 + 5 * MIN],
  [{ eventId: "r2", clientTimeMs: T0 + MIN, position: at(0.001) }, T0 + MIN + 2_000],
  [{ eventId: "s1", type: "sighting", clientTimeMs: T0 + 2 * MIN, observedAtMs: T0 + 90_000, position: at(0, 0.001) }, T0 + 2 * MIN],
  [{ eventId: "s2", type: "sighting", clientTimeMs: T0 + 3 * MIN, observedAtMs: T0 + 3 * MIN, position: at(0.001, 0.001) }, T0 + 3 * MIN],
  [confirm("c1", "s1"), T0 + 4 * MIN],
  [confirm("c2", "s2"), T0 + 4 * MIN],
];

describe("cubeScene", () => {
  it("a report is a bar from sent to arrived; a sighting runs from when it was seen to its arrival", () => {
    const s = scene(four);
    const byId = Object.fromEntries(s.points.map((p) => [p.id, p]));
    expect(byId["r1"]).toMatchObject({ kind: "report", t0: T0, t1: T0 + 5 * MIN, waitS: 300 });
    expect(byId["s1"]).toMatchObject({ kind: "sighting", t0: T0 + 90_000, t1: T0 + 2 * MIN });
    expect(s.order).toEqual(["s1", "s2"]);
    expect(s.t0).toBe(T0);
    expect(s.t1).toBe(T0 + 5 * MIN);
  });

  it("a clock-suspect report has no bar", () => {
    const s = scene([[{ eventId: "skew", clientTimeMs: T0 + 10 * MIN, position: at(0) }, T0 + MIN]]);
    expect(s.points[0]).toMatchObject({ t0: T0 + MIN, t1: T0 + MIN, waitS: null });
  });

  it("a sighting whose seen time is not trusted has no bar", () => {
    const s = scene([[{ eventId: "late", type: "sighting", clientTimeMs: T0, observedAtMs: T0 + 9 * MIN, position: at(0) }, T0 + 2 * MIN]]);
    expect(s.points[0]).toMatchObject({ t0: T0 + 2 * MIN, t1: T0 + 2 * MIN });
  });

  it("each segment is on the floor once, in metres around the grid centre", () => {
    const s = scene(four);
    expect(s.floor.map((f) => f.segmentId)).toEqual(["AA", "AB", "AC"]);
    for (const f of s.floor) for (const [x, y] of f.ring) expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(s.halfM);
    for (const p of s.points) expect(Math.max(Math.abs(p.x), Math.abs(p.y))).toBeLessThanOrEqual(s.halfM);
  });

  it("a report with no position and a retracted report are not in the cube", () => {
    const s = scene([
      [{ eventId: "nowhere", clientTimeMs: T0 }, T0 + MIN],
      [{ eventId: "gone", clientTimeMs: T0, position: at(0) }, T0 + MIN],
      [{ eventId: "r", type: "retraction", role: "command", teamId: null, deviceId: "cmd", clientTimeMs: T0 + 2 * MIN, targetEventId: "gone", effect: { kind: "none", why: "informational" } }, T0 + 2 * MIN],
    ]);
    expect(s.points).toEqual([]);
  });
});

describe("cubeGate", () => {
  it("the gate fails with 3 positioned events", () => {
    const g = cubeGate(scene(four.filter(([d]) => d.eventId !== "s2")));
    expect(g).toEqual({ pass: false, positioned: 3, longestWaitS: 300 });
  });

  it("the gate fails when no report waited 60 seconds", () => {
    const quick = four.map(([d, at]): [typeof d, number] => (d.eventId === "r1" ? [d, T0 + 50_000] : [d, at]));
    const g = cubeGate(scene(quick));
    expect(g.pass).toBe(false);
    expect(g.positioned).toBe(4);
    expect(g.longestWaitS).toBeLessThan(60);
  });

  it("the gate passes with 4 and one 5-minute wait", () => {
    expect(cubeGate(scene(four))).toEqual({ pass: true, positioned: 4, longestWaitS: 300 });
  });
});
