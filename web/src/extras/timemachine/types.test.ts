import { describe, expect, it } from "vitest";
import { TRACK_RULES, type ClockTick, type TimeMachineResult, type Track, type TrackEntry } from "./types";

describe("the time machine contract", () => {
  it("keeps the plan's track numbers", () => {
    expect(TRACK_RULES).toEqual({ linkMinIoU: 0.3, bridgeMaxGapS: 2, agreeWithinS: 1, holdS: 0.5 });
  });

  it("describes a stored track, a tick and a result row", () => {
    const entry: TrackEntry = { t: 4, box: [120, 300, 880, 420], source: "cloud" };
    const track: Track = { version: "track-v1", window: { startS: 0, endS: 9 }, entries: [entry] };
    const tick: ClockTick = { timeS: 4.2, source: "video" };
    const row: TimeMachineResult = { id: "first_seen", label: "First seen 0:04", timeS: 4 };
    expect([track.entries[0]?.box.length, tick.source, row.timeS]).toEqual([4, "video", 4]);
  });
});
