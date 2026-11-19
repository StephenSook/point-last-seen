// The committed grids (from OpenStreetMap) parse as the engine's Grid, carry their credit and fit one prior batch,
// so lanes can build against real sites: the Piedmont Park development grid and the Kennesaw Mountain drill grid.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Grid } from "../src/index";

/** The most segments one prior batch can hold (tools/grid-builder MAX_SEGMENTS). */
const MAX_SEGMENTS = 480;
const read = (name: string): Grid => JSON.parse(readFileSync(new URL(`../../grid/${name}.grid.json`, import.meta.url), "utf8"));

describe.each(["piedmont-park-dev", "kennesaw-mountain-drill"])("shared/grid/%s.grid.json", (gridId) => {
  const grid = read(gridId);
  it("is a grid of real segments inside its box, with unique ids, small enough for one prior batch", () => {
    expect(grid.gridId).toBe(gridId);
    const [minLon, minLat, maxLon, maxLat] = grid.bbox;
    expect(minLon < maxLon && minLat < maxLat).toBe(true);
    const ids = grid.segments.map(s => s.segmentId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(10);
    expect(ids.length).toBeLessThanOrEqual(MAX_SEGMENTS);
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
