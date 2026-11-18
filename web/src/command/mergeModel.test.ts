import { describe, expect, it } from "vitest";
import { mergeModel, type MergeDoc } from "./mergeModel";

const t0 = Date.UTC(2026, 10, 22, 14, 3);
const teams = [
  { teamId: "T1", name: "Team 1" },
  { teamId: "T2", name: "Team 2" },
];
let n = 0;
function ev(over: Partial<MergeDoc>): MergeDoc {
  n++;
  return { eventId: n.toString(16).padStart(32, "0"), teamId: "T1", deviceId: "D1", clientTimeMs: t0, serverTimeMs: t0, ...over };
}

describe("mergeModel", () => {
  it("makes one lane per team, in team order, silent when it has no arrived card", () => {
    const lanes = mergeModel([ev({ teamId: "T2" })], teams, t0);
    expect(lanes.map((l) => l.teamId)).toEqual(["T1", "T2"]);
    expect(lanes[0]!.silent).toBe(true);
    expect(lanes[1]!.silent).toBe(false);
  });

  it("shows time without signal from client and server times", () => {
    expect(mergeModel([ev({ teamId: "T1", clientTimeMs: t0, serverTimeMs: t0 + 18 * 60_000 })], teams, t0 + 20 * 60_000)[0]!.cards[0]!.offlineForMs).toBe(18 * 60_000);
  });

  it("clamps a negative gap to null and flags it", () => {
    const c = mergeModel([ev({ clientTimeMs: t0 + 5000, serverTimeMs: t0 })], teams, t0)[0]!.cards[0]!;
    expect(c.offlineForMs).toBeNull();
    expect(c.clockSuspect).toBe(true);
  });

  it("flags a gap above 24 hours as a clock problem", () => {
    const c = mergeModel([ev({ clientTimeMs: t0, serverTimeMs: t0 + 25 * 3600_000 })], teams, t0)[0]!.cards[0]!;
    expect(c.offlineForMs).toBeNull();
    expect(c.clockSuspect).toBe(true);
  });

  it("applies the device clock offset before comparing with server time", () => {
    // The phone clock runs 4 s slow: server minus device is +4000 ms.
    const c = mergeModel([ev({ deviceId: "D9", clientTimeMs: t0, serverTimeMs: t0 + 60_000 })], teams, t0, { D9: 4000 })[0]!.cards[0]!;
    expect(c.sentAtMs).toBe(t0 + 4000);
    expect(c.offlineForMs).toBe(56_000);
    expect(c.clockSuspect).toBe(false);
  });

  it("a card not yet on the server has no arrival and is not a clock problem", () => {
    const c = mergeModel([ev({ serverTimeMs: null })], teams, t0)[0]!.cards[0]!;
    expect(c.arrivedAtMs).toBeNull();
    expect(c.offlineForMs).toBeNull();
    expect(c.clockSuspect).toBe(false);
  });

  it("orders cards by the time they were sent, oldest first, whatever the arrival order", () => {
    const a = ev({ clientTimeMs: t0 + 2000, serverTimeMs: t0 + 9000 });
    const b = ev({ clientTimeMs: t0 + 1000, serverTimeMs: t0 + 9500 });
    expect(mergeModel([a, b], teams, t0)[0]!.cards.map((c) => c.eventId)).toEqual([b.eventId, a.eventId]);
    expect(mergeModel([b, a], teams, t0)[0]!.cards.map((c) => c.eventId)).toEqual([b.eventId, a.eventId]);
  });

  it("lists an event once even when it arrives twice", () => {
    const a = ev({});
    expect(mergeModel([a, { ...a }], teams, t0)[0]!.cards).toHaveLength(1);
  });

  it("leaves out events with no team or an unknown team", () => {
    const lanes = mergeModel([ev({ teamId: null }), ev({ teamId: "T7" })], teams, t0);
    expect(lanes.flatMap((l) => l.cards)).toEqual([]);
  });

  it("reports how long a lane has been quiet since its last arrival", () => {
    const lanes = mergeModel([ev({ serverTimeMs: t0 + 60_000 })], teams, t0 + 5 * 60_000);
    expect(lanes[0]!.quietForMs).toBe(4 * 60_000);
    expect(lanes[1]!.quietForMs).toBeNull();
  });
});
