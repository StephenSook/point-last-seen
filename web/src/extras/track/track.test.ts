import { describe, expect, it } from "vitest";
import type { ExtrasMapLike } from "../types";
import { attachTrack, readTrack, trackCollection, trackUpTo } from "./track";

const T0 = Date.UTC(2026, 10, 22, 18, 0);
// A SYNTHETIC track, made up for these tests: three points 10 s apart, walking north.
const file = (over: Record<string, unknown> = {}) => ({
  version: 1, source: "synthetic", gridId: "g", runId: "r",
  points: [[T0, 33.78, -84.37], [T0 + 10_000, 33.7801, -84.37], [T0 + 20_000, 33.7802, -84.37]],
  breaks: [],
  ...over,
});
const read = (over: Record<string, unknown> = {}) => {
  const r = readTrack(file(over));
  if (!r.ok) throw new Error(r.reason);
  return r.track;
};

describe("readTrack", () => {
  it("takes the import tool's track file, says whether it is synthetic, and names its run and grid", () => {
    const t = read();
    expect(t.synthetic).toBe(true);
    expect([t.runId, t.gridId]).toEqual(["r", "g"]);
    expect(read({ source: "gps-logger" }).synthetic).toBe(false);
    expect(read().points).toHaveLength(3);
  });

  it("refuses another shape, times that do not run forward, or a point off the Earth", () => {
    expect(readTrack(file({ version: 2 })).ok).toBe(false);
    expect(readTrack(file({ source: "phone" })).ok).toBe(false);
    expect(readTrack(file({ extra: 1 })).ok).toBe(false);
    expect(readTrack(file({ points: [] })).ok).toBe(false);
    expect(readTrack(file({ points: [[T0, 33.78, -84.37], [T0, 33.78, -84.37]] }))).toEqual({ ok: false, reason: "The track's times do not run forward." });
    expect(readTrack(file({ points: [[T0, 133.78, -84.37]] })).ok).toBe(false);
    expect(readTrack("not a track").ok).toBe(false);
  });

  it("takes segment starts only as rising point numbers inside the track", () => {
    expect(read({ breaks: [2] }).breaks).toEqual([2]);
    for (const breaks of [[0], [3], [2, 1], [1.5], ["1"]]) expect(readTrack(file({ breaks })).ok, JSON.stringify(breaks)).toBe(false);
  });
});

describe("trackUpTo", () => {
  it("the path walked by a time, and the place at that moment on the line to the next point", () => {
    const t = read();
    expect(trackUpTo(t, T0 - 1)).toEqual({ lines: [], now: null });
    const mid = trackUpTo(t, T0 + 15_000);
    expect(mid.lines).toEqual([[[-84.37, 33.78], [-84.37, 33.7801], [-84.37, expect.closeTo(33.78015, 8)]]]);
    expect(mid.now).toEqual([-84.37, expect.closeTo(33.78015, 8)]);
    expect(trackUpTo(t, T0 + 99_000)).toEqual({ lines: [[[-84.37, 33.78], [-84.37, 33.7801], [-84.37, 33.7802]]], now: null });
  });

  it("at a recorded fix the path ends on that fix, once", () => {
    expect(trackUpTo(read(), T0 + 10_000)).toEqual({ lines: [[[-84.37, 33.78], [-84.37, 33.7801]]], now: [-84.37, 33.7801] });
  });

  it("never draws across a segment start or a gap of more than 2 minutes, and has no place inside one", () => {
    const gap = read({ points: [[T0, 33.78, -84.37], [T0 + 10_000, 33.7801, -84.37], [T0 + 190_000, 33.7811, -84.37], [T0 + 200_000, 33.7812, -84.37]] });
    expect(trackUpTo(gap, T0 + 100_000)).toEqual({ lines: [[[-84.37, 33.78], [-84.37, 33.7801]]], now: null });
    expect(trackUpTo(gap, T0 + 200_000).lines).toEqual([[[-84.37, 33.78], [-84.37, 33.7801]], [[-84.37, 33.7811], [-84.37, 33.7812]]]);
    const stopped = read({ breaks: [2] });
    expect(trackUpTo(stopped, T0 + 15_000)).toEqual({ lines: [[[-84.37, 33.78], [-84.37, 33.7801]]], now: null });
    expect(trackUpTo(stopped, T0 + 20_000).lines).toEqual([[[-84.37, 33.78], [-84.37, 33.7801]], [[-84.37, 33.7802]]]);
  });
});

describe("attachTrack", () => {
  it("adds one source and two layers once, sets the walked path and the place, and remove takes them away", () => {
    const sources = new Map<string, { data: unknown; setData(d: unknown): void }>();
    const layers = new Map<string, unknown>();
    const map: ExtrasMapLike = {
      addSource: (id, s) => {
        const src = { data: (s as { data: unknown }).data, setData(d: unknown) { src.data = d; } };
        sources.set(id, src);
      },
      getSource: (id) => sources.get(id),
      removeSource: (id) => sources.delete(id),
      addLayer: (l) => layers.set((l as { id: string }).id, l),
      getLayer: (id) => layers.get(id),
      removeLayer: (id) => layers.delete(id),
      hasImage: () => false,
      addImage: () => undefined,
    };
    const t = attachTrack(map);
    attachTrack(map);
    expect([...sources.keys()]).toEqual(["extras-track"]);
    expect([...layers.keys()]).toEqual(["extras-track-line", "extras-track-now"]);
    const c = trackCollection({ lines: [[[-84.37, 33.78], [-84.37, 33.7801]], [[-84.37, 33.7811]]], now: [-84.37, 33.7811] }) as { features: { geometry: { type: string; coordinates: unknown } }[] };
    expect(c.features.map((f) => f.geometry.type)).toEqual(["MultiLineString", "Point"]);
    // A one-point piece is not a line; it is left out of the drawn path.
    expect(c.features[0]!.geometry.coordinates).toEqual([[[-84.37, 33.78], [-84.37, 33.7801]]]);
    expect((trackCollection({ lines: [], now: null }) as { features: unknown[] }).features).toEqual([]);
    t.set(c);
    expect(sources.get("extras-track")!.data).toBe(c);
    t.remove();
    expect(sources.size + layers.size).toBe(0);
  });
});
