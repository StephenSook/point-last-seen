import { describe, expect, it } from "vitest";
import type { MapSegment } from "../laneC";
import type { ExtrasMapLike } from "../types";
import { attachTerrain } from "./terrainLayer";

function fakeMap() {
  const sources = new Map<string, { data: unknown; setData(d: unknown): void }>();
  const layers = new Map<string, unknown>();
  const images = new Set<string>();
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
    hasImage: (id) => images.has(id),
    addImage: (id) => images.add(id),
  };
  return { map, sources, layers, images };
}

const glyph = () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }) as unknown as ImageData;
const seg = (segmentId: string, lon: number): MapSegment => ({
  segmentId,
  centroid: { lat: 33.78, lon },
  geometry: { type: "Polygon", coordinates: [[[lon, 33.78], [lon + 0.001, 33.78], [lon, 33.781], [lon, 33.78]]] },
});

describe("attachTerrain", () => {
  it("attachTerrain adds one source and one layer and removes both", () => {
    const f = fakeMap();
    const t = attachTerrain(f.map, glyph);
    attachTerrain(f.map, glyph);
    expect([...f.sources.keys()]).toEqual(["extras-terrain"]);
    expect([...f.layers.keys()]).toEqual(["extras-terrain"]);
    expect([...f.images].sort()).toEqual(["extras-terrain-higher", "extras-terrain-lower"]);
    t.remove();
    expect(f.sources.size).toBe(0);
    expect(f.layers.size).toBe(0);
  });

  it("marks only lower and higher segments, at their centres, and draws no fill", () => {
    const f = fakeMap();
    const t = attachTerrain(f.map, glyph);
    t.set({ A: "lower", B: "level", C: "higher", D: "no_data" }, [seg("A", -84.37), seg("B", -84.369), seg("C", -84.368), seg("D", -84.367)]);
    const data = f.sources.get("extras-terrain")!.data as { features: { geometry: { coordinates: number[] }; properties: { segmentId: string; cls: string } }[] };
    expect(data.features.map((x) => [x.properties.segmentId, x.properties.cls, x.geometry.coordinates[0]])).toEqual([
      ["A", "lower", -84.37],
      ["C", "higher", -84.368],
    ]);
    const layer = f.layers.get("extras-terrain") as { type: string; paint?: Record<string, unknown> };
    expect(layer.type).toBe("symbol");
    expect(JSON.stringify(layer)).not.toMatch(/fill-color|circle-color/);
  });
});
