import { describe, expect, it } from "vitest";
import type { ExtrasMapLike } from "../types";
import { attachTrack, readTrack, trackCollection, trackUpTo } from "./track";

const T0 = Date.UTC(2026, 10, 22, 18, 0);
// A SYNTHETIC track, made up for these tests: three points 10 s apart, walking north.
const file = (over: Record<string, unknown> = {}) => ({
  version: 1, source: "synthetic", gridId: "g", runId: "r",
  points: [[T0, 33.78, -84.37], [T0 + 10_000, 33.7801, -84.37], [T0 + 20_000, 33.7802, -84.37]],
  ...over,
});

describe("readTrack", () => {
  it("takes the import tool's track file and says whether it is synthetic", () => {
    const r = readTrack(file());
    expect(r.ok && r.track.synthetic).toBe(true);
    const real = readTrack(file({ source: "gps-logger" }));
    expect(real.ok && real.track.synthetic).toBe(false);
    expect(real.ok && real.track.points).toHaveLength(3);
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
});

describe("trackUpTo", () => {
  it("the path walked by a time: every point before it and the place at that moment", () => {
    const r = readTrack(file());
    if (!r.ok) throw new Error(r.reason);
    expect(trackUpTo(r.track, T0 - 1)).toEqual([]);
    expect(trackUpTo(r.track, T0 + 15_000)).toEqual([[-84.37, 33.78], [-84.37, 33.7801], [-84.37, expect.closeTo(33.78015, 8)]]);
    expect(trackUpTo(r.track, T0 + 99_000)).toEqual([[-84.37, 33.78], [-84.37, 33.7801], [-84.37, 33.7802]]);
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
    const c = trackCollection([[-84.37, 33.78], [-84.37, 33.7801]]) as { features: { geometry: { type: string } }[] };
    expect(c.features.map((f) => f.geometry.type)).toEqual(["LineString", "Point"]);
    expect((trackCollection([]) as { features: unknown[] }).features).toEqual([]);
    t.set(c);
    expect(sources.get("extras-track")!.data).toBe(c);
    t.remove();
    expect(sources.size + layers.size).toBe(0);
  });
});
