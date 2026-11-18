import { describe, expect, it } from "vitest";
import type { EventDoc } from "../laneC";
import { T0, cameraReading, eventDoc, replayView, streamed } from "../testdata/replay";
import type { ExtrasMapLike } from "../types";
import { fromLive } from "./replayData";
import type { ReplayFrame } from "./stateAt";
import { attachTrail, haversineM, legText, legs, trailCollections, trailOrder, trailPoints, type TrailPoint } from "./trail";

const MIN = 60_000;
const LAT = 33.78;
const LON = -84.37;
// 1,100 m north of LAT on the mean Earth radius the haversine uses.
const NORTH_1100 = 1100 / (6_371_008.8 * (Math.PI / 180));

const at = (dLat: number) => ({ lat: LAT + dLat, lon: LON, accuracyM: 5 });

function frame(docs: (Partial<EventDoc> & { eventId: string })[]): ReplayFrame {
  const events = docs.map((d, i) => streamed(eventDoc({ deviceId: "d9", clientTimeMs: T0 + i * 1000, ...d }), T0 + i * 1000));
  return { phase: "before_prior", tMs: T0 + 60 * MIN, shown: fromLive(replayView(), events, [])!.events };
}

const confirm = (eventId: string, target: string, decision: "confirmed" | "rejected" = "confirmed") =>
  ({ eventId, type: "confirmation", role: "command", teamId: null, targetEventId: target, decision, effect: { kind: "none", why: "informational" } }) as const;

describe("haversineM", () => {
  it("one degree of latitude is 111.19 km within 0.5 percent", () => {
    const m = haversineM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(Math.abs(m - 111_190) / 111_190).toBeLessThan(0.005);
  });
});

describe("trailPoints", () => {
  it("a report with no position gives no point", () => {
    const f = frame([{ eventId: "nowhere", type: "clue", position: null }, { eventId: "here", type: "clue", position: at(0) }]);
    expect(trailPoints(f).map((p) => p.eventId)).toEqual(["here"]);
  });

  it("marks a sighting confirmed only by a command or family confirmation, the latest one winning", () => {
    const f = frame([
      { eventId: "s1", type: "sighting", position: at(0) },
      { eventId: "s2", type: "sighting", position: at(0.001) },
      { eventId: "s3", type: "sighting", position: at(0.002) },
      confirm("c1", "s1"),
      { ...confirm("c2", "s2"), role: "searcher" },
      confirm("c3", "s3"),
      confirm("c4", "s3", "rejected"),
    ]);
    const byId = Object.fromEntries(trailPoints(f).map((p) => [p.eventId, p.confirmed]));
    expect(byId).toEqual({ s1: true, s2: false, s3: false });
  });

  it("a retracted sighting gives no point", () => {
    const f = frame([
      { eventId: "s1", type: "sighting", position: at(0) },
      confirm("c1", "s1"),
      { eventId: "r1", type: "retraction", role: "command", teamId: null, targetEventId: "s1", effect: { kind: "none", why: "informational" } },
    ]);
    expect(trailPoints(f)).toEqual([]);
  });

  it("a camera sighting sits at the time the camera last saw the person", () => {
    const f = frame([{ eventId: "cam", type: "camera_sighting", position: at(0), reading: cameraReading({ clipStartMs: T0 }) }]);
    expect(trailPoints(f)[0]).toMatchObject({ kind: "camera", tMs: T0 + 134_000 });
  });
});

describe("trailOrder and legs", () => {
  const pts: TrailPoint[] = [
    { eventId: "a", kind: "sighting", lat: LAT, lon: LON, tMs: T0, confirmed: true },
    { eventId: "rep", kind: "report", lat: LAT, lon: LON, tMs: T0 + MIN, confirmed: false },
    { eventId: "un", kind: "sighting", lat: LAT, lon: LON, tMs: T0 + 2 * MIN, confirmed: false },
    { eventId: "cam", kind: "camera", lat: LAT + NORTH_1100, lon: LON, tMs: T0 + 40 * MIN, confirmed: true },
  ];

  it("only confirmed sightings join the order line", () => {
    expect(trailOrder([...pts].reverse()).map((p) => p.eventId)).toEqual(["a", "cam"]);
  });

  it("a leg prints metres, minutes and metres per second", () => {
    const [leg] = legs(trailOrder(pts));
    expect(leg!.metres).toBeCloseTo(1100, 0);
    expect(leg!.minutes).toBe(40);
    expect(leg!.mps).toBeCloseTo(0.46, 2);
    expect(legText(leg!)).toBe("1.1 km in 40 min, 0.46 m/s");
    expect(legText({ fromId: "a", toId: "b", metres: 240, minutes: 3, mps: 1.333 })).toBe("240 m in 3 min, 1.33 m/s");
  });

  it("a leg with zero or negative minutes is left out", () => {
    const same = pts.map((p) => ({ ...p, tMs: T0 }));
    expect(legs(trailOrder(same))).toEqual([]);
  });
});

describe("trailCollections", () => {
  it("gives every point and a line through the confirmed order, longitude first", () => {
    const f = frame([
      { eventId: "s1", type: "sighting", position: at(0), observedAtMs: T0 },
      { eventId: "s2", type: "sighting", position: at(0.01), observedAtMs: T0 + MIN },
      { eventId: "rep", type: "clue", position: at(0.02) },
      confirm("c1", "s1"),
      confirm("c2", "s2"),
    ]);
    const c = trailCollections(f) as { points: { features: unknown[] }; line: { features: { geometry: { coordinates: number[][] } }[] } };
    expect(c.points.features).toHaveLength(3);
    expect(c.line.features[0]!.geometry.coordinates).toEqual([[LON, LAT], [LON, LAT + 0.01]]);
    expect((trailCollections(frame([{ eventId: "s1", type: "sighting", position: at(0) }])) as typeof c).line.features).toEqual([]);
  });
});

describe("attachTrail", () => {
  function fakeMap() {
    const sources = new Map<string, { data: unknown; setData(d: unknown): void }>();
    const layers = new Set<string>();
    const calls: string[] = [];
    const map: ExtrasMapLike = {
      addSource: (id, s) => {
        calls.push(`addSource ${id}`);
        const src = { data: (s as { data: unknown }).data, setData(d: unknown) { src.data = d; } };
        sources.set(id, src);
      },
      getSource: (id) => sources.get(id),
      removeSource: (id) => {
        calls.push(`removeSource ${id}`);
        sources.delete(id);
      },
      addLayer: (l) => {
        calls.push(`addLayer ${(l as { id: string }).id}`);
        layers.add((l as { id: string }).id);
      },
      getLayer: (id) => (layers.has(id) ? { id } : undefined),
      removeLayer: (id) => {
        calls.push(`removeLayer ${id}`);
        layers.delete(id);
      },
      hasImage: () => false,
      addImage: () => undefined,
    };
    return { map, sources, layers, calls };
  }

  it("attachTrail adds two sources and three layers once, and remove takes them all away", () => {
    const f = fakeMap();
    const t = attachTrail(f.map);
    attachTrail(f.map);
    expect(f.calls.filter((c) => c.startsWith("addSource"))).toHaveLength(2);
    expect(f.calls.filter((c) => c.startsWith("addLayer"))).toHaveLength(3);
    const c = { points: { type: "FeatureCollection", features: [] }, line: { type: "FeatureCollection", features: [] } };
    t.set(c);
    expect([...f.sources.values()].map((s) => s.data)).toEqual([c.points, c.line]);
    t.remove();
    expect(f.sources.size).toBe(0);
    expect(f.layers.size).toBe(0);
    // Layers go before the sources they draw from.
    expect(f.calls.findIndex((x) => x.startsWith("removeSource"))).toBeGreaterThan(f.calls.findLastIndex((x) => x.startsWith("removeLayer")));
  });
});
