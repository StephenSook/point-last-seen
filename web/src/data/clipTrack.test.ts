import type { RouteRecord } from "@pls/engine";
import { describe, expect, it } from "vitest";
import type { Track } from "../extras/timemachine/types";
import { clipTrackDoc, clipTrackFromDoc } from "./clipTrack";

const SHA = "b".repeat(64);
const ROUTE: RouteRecord = { platform: "web", path: "cloud", stage: "sdk", model: "gemini-3.5-flash-lite", reason: "sdk_only_in_cloud", latencyMs: 4000, sdkReported: true, blocked: null, decidedAtMs: 1 };
const TRACK: Track = {
  version: "track-v1",
  window: { startS: 0, endS: 9 },
  entries: [
    { t: 0, box: [700, 418, 1000, 591], source: "cloud", mask: [[700, 450], [800, 590], [1000, 560]] },
    { t: 1, box: [657, 470, 1000, 684], source: "cloud" },
  ],
};

describe("clipTrackDoc", () => {
  it("stores each outline as a flat list of numbers, since Firestore holds no list inside a list", () => {
    const d = clipTrackDoc({ sha256: SHA, track: TRACK, model: "gemini-3.5-flash-lite", route: ROUTE, framesSent: 10, uid: "u1" });
    expect(d.entries[0]).toEqual({ t: 0, box: [700, 418, 1000, 591], source: "cloud", mask: [700, 450, 800, 590, 1000, 560] });
    expect(d.entries[1]).toEqual({ t: 1, box: [657, 470, 1000, 684], source: "cloud" });
    expect(d).toMatchObject({ version: "track-v1", sha256: SHA, window: { startS: 0, endS: 9 }, model: "gemini-3.5-flash-lite", framesSent: 10, createdByUid: "u1" });
    expect(Object.keys(d).sort()).toEqual(["createdAt", "createdByUid", "entries", "framesSent", "model", "route", "sha256", "version", "window"]);
  });
});

describe("clipTrackFromDoc", () => {
  it("reads back the same track", () => {
    const d = clipTrackDoc({ sha256: SHA, track: TRACK, model: "gemini-3.5-flash-lite", route: ROUTE, framesSent: 10, uid: "u1" });
    expect(clipTrackFromDoc({ ...d, createdAt: { toMillis: () => 5 } })).toEqual({ track: TRACK, sha256: SHA, model: "gemini-3.5-flash-lite", route: ROUTE, framesSent: 10, createdAtMs: 5 });
  });

  it.each([
    ["another version", { version: "track-v2" }],
    ["a box with three numbers", { entries: [{ t: 0, box: [1, 2, 3], source: "cloud" }] }],
    ["an outline with an odd count", { entries: [{ t: 0, box: [1, 2, 3, 4], source: "cloud", mask: [1, 2, 3, 4, 5, 6, 7] }] }],
    ["times out of order", { entries: [{ t: 2, box: [1, 2, 3, 4], source: "cloud" }, { t: 1, box: [1, 2, 3, 4], source: "cloud" }] }],
    ["an unknown source", { entries: [{ t: 0, box: [1, 2, 3, 4], source: "guess" }] }],
  ])("gives null for %s", (_why, over) => {
    const d = clipTrackDoc({ sha256: SHA, track: TRACK, model: "m", route: ROUTE, framesSent: 2, uid: "u" });
    expect(clipTrackFromDoc({ ...d, ...over, createdAt: { toMillis: () => 1 } })).toBeNull();
  });
});
