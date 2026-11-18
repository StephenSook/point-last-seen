// The committed development grid (Piedmont Park, from OpenStreetMap) parses as the engine's Grid and carries its
// credit, so lanes can build against a real site before the drill site is chosen.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Grid } from "../src/index";

const grid: Grid = JSON.parse(readFileSync(new URL("../../grid/piedmont-park-dev.grid.json", import.meta.url), "utf8"));

describe("shared/grid/piedmont-park-dev.grid.json", () => {
  it("is a grid of real segments inside its box, with unique ids", () => {
    expect(grid.gridId).toBe("piedmont-park-dev");
    const [minLon, minLat, maxLon, maxLat] = grid.bbox;
    expect(minLon < maxLon && minLat < maxLat).toBe(true);
    const ids = grid.segments.map(s => s.segmentId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(10);
    expect(ids).not.toContain("ROW");
    for (const s of grid.segments) {
      expect(s.areaM2).toBeGreaterThan(0);
      expect(s.centroid.lon >= minLon && s.centroid.lon <= maxLon && s.centroid.lat >= minLat && s.centroid.lat <= maxLat).toBe(true);
      for (const n of s.neighbors) expect(ids).toContain(n);
    }
  });
  it("carries the OpenStreetMap credit", () => {
    expect(grid.attribution).toContain("OpenStreetMap contributors");
    expect(grid.attribution).toContain("ODbL");
  });
});
