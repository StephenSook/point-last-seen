import { describe, expect, it } from "vitest";
import type { MapSegment } from "../hostApp";
import type { ExtrasMapLike } from "../types";
import { attachOutline, outlineCollection } from "./outline";

const square = (segmentId: string, x: number): MapSegment => ({
  segmentId,
  centroid: { lat: 0.5, lon: x + 0.5 },
  geometry: { type: "Polygon", coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] },
});

describe("outlineCollection", () => {
  it("holds the outline of each changed segment and nothing else", () => {
    const c = outlineCollection([square("AA", 0), square("AB", 1), square("BA", 2)], ["AB", "BA", "ZZ"]) as {
      features: { geometry: MapSegment["geometry"]; properties: { segmentId: string } }[];
    };
    expect(c.features.map((f) => f.properties.segmentId)).toEqual(["AB", "BA"]);
    expect(c.features[0]!.geometry).toEqual(square("AB", 1).geometry);
    expect((outlineCollection([square("AA", 0)], []) as { features: unknown[] }).features).toEqual([]);
  });
});

describe("attachOutline", () => {
  it("adds one source and one line layer once, sets the outline, and remove takes both away", () => {
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
    const o = attachOutline(map);
    attachOutline(map);
    expect([...sources.keys()]).toEqual(["extras-changed"]);
    expect([...layers.keys()]).toEqual(["extras-changed-line"]);
    expect((layers.get("extras-changed-line") as { type: string }).type).toBe("line");
    const c = outlineCollection([square("AA", 0)], ["AA"]);
    o.set(c);
    expect(sources.get("extras-changed")!.data).toBe(c);
    o.remove();
    expect(sources.size + layers.size).toBe(0);
  });
});
