import { describe, expect, it } from "vitest";
import { boxAt, footPoint, iou, linkTrack, spanAgrees, trackSpan } from "./track";
import type { Box2d, TrackEntry } from "./types";

const box: Box2d = [100, 200, 500, 400];
const movedBox: Box2d = [120, 240, 560, 480];
const distantBox: Box2d = [600, 700, 900, 800];

function entry(t: number, bounds: Box2d = box): TrackEntry {
  return { t, box: bounds, source: "cloud" };
}

describe("iou", () => {
  it("returns one for identical boxes", () => {
    expect(iou(box, box)).toBe(1);
  });

  it("returns zero for disjoint or touching boxes", () => {
    expect(iou(box, distantBox)).toBe(0);
    expect(iou(box, [100, 400, 500, 600])).toBe(0);
  });

  it("returns exactly one third when half of each box overlaps", () => {
    expect(iou(box, [100, 300, 500, 500])).toBe(1 / 3);
  });

  it("returns zero for a degenerate box", () => {
    const line: Box2d = [100, 250, 500, 250];
    expect(iou(line, box)).toBe(0);
    expect(iou(box, line)).toBe(0);
    expect(iou(line, line)).toBe(0);
  });
});

describe("linkTrack", () => {
  it("links a smoothly moving person into one segment", () => {
    const entries = [entry(4), entry(5, movedBox), entry(6, [140, 280, 620, 560])];
    expect(linkTrack(entries)).toEqual([{ startS: 4, endS: 6, entries }]);
  });

  it("bridges two missing seconds", () => {
    const entries = [entry(4), entry(7, movedBox)];
    expect(linkTrack(entries)).toEqual([{ startS: 4, endS: 7, entries }]);
  });

  it("splits at three missing seconds", () => {
    const first = entry(4);
    const last = entry(8, movedBox);
    expect(linkTrack([first, last])).toEqual([
      { startS: 4, endS: 4, entries: [first] },
      { startS: 8, endS: 8, entries: [last] },
    ]);
  });

  it("links at 0.3 IoU and splits a jump below it", () => {
    const first = entry(4, [100, 200, 500, 330]);
    const second = entry(5, [100, 270, 500, 400]);
    const third = entry(6, [100, 341, 500, 471]);
    expect(linkTrack([first, second, third])).toEqual([
      { startS: 4, endS: 5, entries: [first, second] },
      { startS: 6, endS: 6, entries: [third] },
    ]);
  });

  it("sorts without changing the input and keeps the first entry per second", () => {
    const first = entry(4);
    const last = entry(5, movedBox);
    const duplicate = entry(4, distantBox);
    const entries = Object.freeze([last, first, duplicate]);
    expect(linkTrack(entries)).toEqual([{ startS: 4, endS: 5, entries: [first, last] }]);
    expect(entries).toEqual([last, first, duplicate]);
  });
});

describe("boxAt", () => {
  it("returns the recorded box at each entry second", () => {
    const segments = linkTrack([entry(4), entry(5, movedBox), entry(6, box)]);
    expect(boxAt(segments, 4)).toEqual(box);
    expect(boxAt(segments, 5)).toEqual(movedBox);
    expect(boxAt(segments, 6)).toEqual(box);
  });

  it("interpolates every corner between entries", () => {
    const segments = linkTrack([entry(4), entry(5, movedBox)]);
    expect(boxAt(segments, 4.25)).toEqual([105, 210, 515, 420]);
  });

  it("interpolates across bridged seconds", () => {
    const segments = linkTrack([entry(4), entry(7, movedBox)]);
    expect(boxAt(segments, 5.5)).toEqual([110, 220, 530, 440]);
  });

  it("holds endpoint boxes through half a second on either side", () => {
    const segments = linkTrack([entry(4), entry(5, movedBox)]);
    expect(boxAt(segments, 3.5)).toEqual(box);
    expect(boxAt(segments, 5.5)).toEqual(movedBox);
  });

  it("returns null outside the holds and inside a split gap", () => {
    const segments = linkTrack([entry(4), entry(8, movedBox)]);
    expect(boxAt(segments, 3.49)).toBeNull();
    expect(boxAt(segments, 6)).toBeNull();
    expect(boxAt(segments, 8.51)).toBeNull();
    expect(boxAt([], 6)).toBeNull();
  });
});

describe("footPoint", () => {
  it("returns the bottom centre in x, y order on the original scale", () => {
    expect(footPoint(box)).toEqual([300, 500]);
  });
});

describe("trackSpan", () => {
  it("uses the first and last recorded seconds across segments", () => {
    expect(trackSpan(linkTrack([entry(4), entry(62, distantBox)]))).toEqual({ firstS: 4, lastS: 62 });
  });

  it("returns null for an empty track", () => {
    expect(trackSpan(linkTrack([]))).toBeNull();
  });
});

describe("spanAgrees", () => {
  it("accepts a one-second difference at both ends", () => {
    const span = { firstS: 4, lastS: 62 };
    // The reading reports 00:03 and 01:03. Its caller supplies seconds.
    expect(spanAgrees(span, { firstSeenS: 3, lastSeenS: 63 })).toBe(true);
  });

  it("rejects a difference greater than one second at either end", () => {
    const span = { firstS: 4, lastS: 62 };
    expect(spanAgrees(span, { firstSeenS: 2, lastSeenS: 62 })).toBe(false);
    expect(spanAgrees(span, { firstSeenS: 4, lastSeenS: 64 })).toBe(false);
  });
});
