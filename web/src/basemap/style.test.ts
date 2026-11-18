import { describe, expect, it } from "vitest";
import { COMMAND } from "../theme/tokens";
import { basemapLayers } from "./style";

const PROTOMAPS_V4 = new Set(["boundaries", "buildings", "earth", "landcover", "landuse", "places", "pois", "roads", "water"]);
const colours = (paint: Record<string, unknown>) =>
  Object.entries(paint).filter(([k]) => k.endsWith("-color")).map(([, v]) => String(v).toUpperCase());

describe("basemapLayers (instrument greys)", () => {
  const { under, over } = basemapLayers("bm");

  it("uses only the 22.1 tokens, so the basemap never carries a hue of its own", () => {
    const tokens = new Set(Object.values(COMMAND).map((c) => c.toUpperCase()));
    for (const l of [...under, ...over]) for (const c of colours((l as { paint?: Record<string, unknown> }).paint ?? {})) expect(tokens.has(c), `${l.id} ${c}`).toBe(true);
  });

  it("draws shapes under the probability fills and lines over them, with no labels", () => {
    expect(under.length).toBeGreaterThan(0);
    expect(over.length).toBeGreaterThan(0);
    for (const l of under) expect(l.type).toBe("fill");
    for (const l of over) expect(l.type).toBe("line");
  });

  it("reads only Protomaps v4 layers from the given source", () => {
    for (const l of [...under, ...over]) {
      const s = l as { source?: string; "source-layer"?: string };
      expect(s.source).toBe("bm");
      expect(PROTOMAPS_V4.has(s["source-layer"] ?? ""), l.id).toBe(true);
    }
  });

  it("draws water as a bg-3 shape and streets, paths and streams in fg-4", () => {
    const water = under.find((l) => l.id === "bm-water");
    expect(colours((water as { paint: Record<string, unknown> }).paint)).toEqual([COMMAND.bg3]);
    for (const l of over) expect(colours((l as { paint: Record<string, unknown> }).paint)).toEqual([COMMAND.fg4]);
  });
});
