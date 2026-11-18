import { describe, expect, it } from "vitest";
import { bandModel, bandText, intervalsFromReading } from "./band";

const seen = { personVisible: true, firstSeen: "00:10", lastSeen: "02:14" };

describe("intervalsFromReading", () => {
  it("a reading with a person gives one interval from first seen to last seen", () => {
    expect(intervalsFromReading(seen)).toEqual([{ startS: 10, endS: 134, source: "cloud_read" }]);
  });
  it("no person seen gives no interval", () => {
    expect(intervalsFromReading({ ...seen, personVisible: false })).toEqual([]);
  });
});

describe("bandModel", () => {
  it("intervals are clamped to the clip length", () => {
    const m = bandModel(100, [{ startS: 90, endS: 134, source: "cloud_read" }], null, 300);
    expect(m.rects).toEqual([{ x: 270, w: 30, source: "cloud_read" }]);
  });
  it("a zero-length interval is drawn 2 px wide", () => {
    expect(bandModel(100, [{ startS: 50, endS: 50, source: "cloud_read" }], null, 300).rects[0]!.w).toBe(2);
  });
  it("an unknown clip length scales to the last interval and is marked open ended", () => {
    const m = bandModel(null, [{ startS: 10, endS: 40, source: "cloud_read" }], null, 300);
    expect(m.rects).toEqual([{ x: 75, w: 225, source: "cloud_read" }]);
    expect(m.openEnded).toBe(true);
  });
  it("the key frame mark sits inside the width", () => {
    expect(bandModel(100, [], 50, 300).keyX).toBe(150);
    expect(bandModel(100, [], 500, 300).keyX).toBe(300);
  });
  it("extra intervals from on-device checks keep their own source", () => {
    const m = bandModel(100, [{ startS: 0, endS: 10, source: "cloud_read" }, { startS: 20, endS: 30, source: "device_check" }], null, 300);
    expect(m.rects.map((r) => r.source)).toEqual(["cloud_read", "device_check"]);
  });
});

describe("bandText", () => {
  it("says when the person is in view, or that no one was seen", () => {
    expect(bandText(seen)).toBe("Person in view 00:10 to 02:14");
    expect(bandText({ ...seen, personVisible: false })).toBe("No person seen.");
  });
});
