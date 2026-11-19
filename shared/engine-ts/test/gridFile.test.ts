// The committed grids (from OpenStreetMap) parse as the engine's Grid, carry their credit and fit one prior batch,
// so lanes can build against real sites: the Piedmont Park development grid and the Kennesaw Mountain drill grid.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { indexRouteGraph, type Grid, type RouteGraph } from "../src/index";

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

// Each deployed grid ships with its route graph (walkers) and its basemap tiles, kept beside it here so a deploy from
// a clean checkout carries them; the web build copies both to /tiles/.
describe.each(["piedmont-park-dev", "kennesaw-mountain-drill"])("shared/grid/%s: the route graph and the basemap tiles", (gridId) => {
  const grid = read(gridId);
  const file = (ext: string) => new URL(`../../grid/${gridId}.${ext}`, import.meta.url);
  it("has a route graph for the same grid, bounded by the grid's box, that the engine indexes", () => {
    const graph = JSON.parse(readFileSync(file("graph.json"), "utf8")) as RouteGraph;
    expect([graph.graphId, graph.gridId]).toEqual([grid.gridId, grid.gridId]);
    expect(graph.bounds).toEqual(grid.bbox);
    expect(graph.edges.length).toBeGreaterThan(100);
    expect(graph.attribution).toContain("OpenStreetMap");
    expect(() => indexRouteGraph(graph)).not.toThrow();
  });
  it("has PMTiles v3 basemap tiles whose bounds cover the grid's box", () => {
    const b = readFileSync(file("pmtiles"));
    expect(b.subarray(0, 7).toString("latin1")).toBe("PMTiles");
    expect(b[7]).toBe(3);
    const deg = (offset: number) => b.readInt32LE(offset) / 1e7;
    const w = deg(102), s = deg(106), e = deg(110), n = deg(114);
    const [minLon, minLat, maxLon, maxLat] = grid.bbox;
    expect(w <= minLon && s <= minLat && e >= maxLon && n >= maxLat).toBe(true);
  });
});

// The Kennesaw drill runs on the trails south of Dallas Highway (park staff's advice), so its grid stays below the road.
describe("shared/grid/kennesaw-mountain-drill: south of Dallas Highway", () => {
  it("has its northern edge below the road, which crosses the park at about 33.945 north", () => {
    const grid = read("kennesaw-mountain-drill");
    expect(grid.bbox[3]).toBeLessThan(33.945);
    for (const s of grid.segments) expect(s.centroid.lat).toBeLessThan(33.945);
  });
});
