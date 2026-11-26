import { describe, expect, it } from "vitest";
import { keyFrameOf, timeMachineResults, trackSentLine, trackPaused } from "./timeMachine";

const reading = { firstSeen: "00:04", lastSeen: "01:12", keyFrame: { time: "00:07", box2d: [100, 200, 900, 400] } };

describe("timeMachineResults", () => {
  it("lists first seen, the clearest frame and last seen, each with its second", () => {
    expect(timeMachineResults(reading)).toEqual([
      { id: "first_seen", label: "First seen 0:04", timeS: 4 },
      { id: "clearest", label: "Clearest frame 0:07", timeS: 7 },
      { id: "last_seen", label: "Last seen 1:12", timeS: 72 },
    ]);
  });
});

describe("keyFrameOf", () => {
  it("gives the clearest frame's second and box", () => {
    expect(keyFrameOf(reading)).toEqual({ timeS: 7, box: [100, 200, 900, 400] });
  });

  it("gives null for a box that is not 4 numbers in order on 0 to 1000", () => {
    for (const box2d of [[100, 200, 900], [900, 200, 100, 400], [100, 200, 1200, 400]]) expect(keyFrameOf({ ...reading, keyFrame: { time: "00:07", box2d } })).toBeNull();
  });
});

describe("trackSentLine", () => {
  it("counts the frames that left this laptop", () => {
    expect(trackSentLine(10)).toBe("10 frames of the clip left this laptop for the cloud.");
    expect(trackSentLine(1)).toBe("1 frame of the clip left this laptop for the cloud.");
  });
});

describe("trackPaused", () => {
  it("stops the track read when clip reading is paused or the time machine is turned off", () => {
    expect(trackPaused({ killCloud: false, timeMachineEnabled: true })).toBe(false);
    expect(trackPaused({ killCloud: true, timeMachineEnabled: true })).toBe(true);
    expect(trackPaused({ killCloud: false, timeMachineEnabled: false })).toBe(true);
  });
});
