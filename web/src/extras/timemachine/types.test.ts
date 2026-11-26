import { describe, expect, it } from "vitest";
import { TRACK_RULES, type ClockTick, type TimeMachineResult, type Track, type TrackEntry } from "./types";

describe("the time machine contract", () => {
  it("keeps the plan's track numbers", () => {
    expect(TRACK_RULES).toEqual({ maxCenterJumpPerS: 450, bridgeMaxGapS: 2, agreeWithinS: 1, holdS: 0.5 });
  });

  it("describes a stored track, a tick and a result row", () => {
    const entry: TrackEntry = { t: 4, box: [120, 300, 880, 420], source: "cloud" };
    const track: Track = { version: "track-v1", window: { startS: 0, endS: 9 }, entries: [entry] };
    const tick: ClockTick = { timeS: 4.2, source: "video" };
    const row: TimeMachineResult = { id: "first_seen", label: "First seen 0:04", timeS: 4 };
    expect([track.entries[0]?.box.length, tick.source, row.timeS]).toEqual([4, "video", 4]);
  });

  it("lets an entry carry the person's outline, [y, x] points on 0 to 1000, and lets it be left out", () => {
    const outlined: TrackEntry = { t: 2, box: [600, 650, 1000, 780], source: "cloud", mask: [[600, 700], [650, 780], [1000, 770], [1000, 655]] };
    const boxOnly: TrackEntry = { t: 3, box: [550, 700, 1000, 840], source: "cloud" };
    expect([outlined.mask?.length, outlined.mask?.[0], boxOnly.mask]).toEqual([4, [600, 700], undefined]);
  });
});
