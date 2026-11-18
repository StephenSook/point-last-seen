import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGrid, main, osmToFeatures, overpassQuery, type OverpassJson } from "../src/cli";
import { at, squareSite } from "./fixtures";

const node = ([lon, lat]: [number, number]) => ({ lat, lon });
const way = (id: number, tags: Record<string, string>, pts: [number, number][]) =>
  ({ type: "way", id, tags, geometry: pts.map(([x, y]) => node(at(x, y))) });
const osm: OverpassJson = {
  elements: [
    way(1, { highway: "path" }, [[0, -10], [0, 385]]),
    way(2, { waterway: "stream" }, [[10, 300], [360, 300]]),
    way(3, { natural: "water" }, [[200, 50], [260, 50], [260, 110], [200, 110], [200, 50]]),
    way(4, { amenity: "bench" }, [[100, 100], [110, 100]]),
    { type: "relation", id: 5, tags: { type: "multipolygon", natural: "water" },
      members: [{ type: "way", role: "outer", geometry: [[300, 200], [340, 200], [340, 240], [300, 240], [300, 200]].map(p => node(at(p[0]!, p[1]!))) }] },
    { type: "node", id: 6, lat: 33.7, lon: -84.3, tags: { highway: "crossing" } },
  ],
};

describe("OSM to grid features", () => {
  it("classifies ways, makes closed water a polygon, keeps streams as lines and drops other tags", () => {
    const { features, streams } = osmToFeatures(osm);
    expect(features.map(f => [f.properties!.class, f.geometry.type])).toEqual([
      ["trail", "LineString"], ["stream", "LineString"], ["water", "Polygon"], ["water", "Polygon"],
    ]);
    expect(streams).toHaveLength(1);
    expect(streams[0]!.geometry.coordinates[0]).toEqual(at(10, 300));
  });
  it("builds the whole grid from a site and OSM, and the same inputs give the same bytes", () => {
    const g = buildGrid(squareSite(375), "test-site", osm);
    expect(g.segments).toHaveLength(9);
    expect(g.segments.find(s => s.segmentId === "AA")!.downstream).toEqual(["AB"]);
    expect(g.segments.find(s => s.segmentId === "AA")!.featureClasses).toEqual(["stream", "trail"]);
    // AE (the centre cell) is 15 m from the pond and 50 m from the stream, and 125 m from the trail.
    const ae = g.segments.find(s => s.segmentId === "AE")!;
    expect(ae.featureClasses).toEqual(["stream", "water"]);
    expect(ae.nearFrac).toBeGreaterThan(0);
    expect(ae.nearFrac).toBeLessThan(1);
    expect(JSON.stringify(buildGrid(squareSite(375), "test-site", osm))).toBe(JSON.stringify(g));
  });
  it("the Overpass query asks for ways and relations with geometry inside the site's bounding box", () => {
    const q = overpassQuery([-84.31, 33.69, -84.29, 33.71]);
    expect(q).toContain("(33.69,-84.31,33.71,-84.29)");
    expect(q).toContain("out geom");
    for (const k of ["highway", "waterway", "natural", "building"]) expect(q).toContain(`["${k}"]`);
  });
});

describe("cli", () => {
  it("writes the grid file and exits 0; missing arguments print usage and exit 2", () => {
    const dir = mkdtempSync(join(tmpdir(), "grid-"));
    writeFileSync(join(dir, "site.geojson"), JSON.stringify(squareSite(375)));
    writeFileSync(join(dir, "osm.json"), JSON.stringify(osm));
    const out = join(dir, "test-site.grid.json");
    expect(main([join(dir, "site.geojson"), "test-site", "--osm", join(dir, "osm.json"), "--out", out])).toBe(0);
    const g = JSON.parse(readFileSync(out, "utf8"));
    expect([g.gridId, g.cellM, g.segments.length]).toEqual(["test-site", 125, 9]);
    expect(readFileSync(out, "utf8").endsWith("\n")).toBe(true);
    expect(main([])).toBe(2);
  });
});

describe("cli --graph", () => {
  it("writes the stored route graph from a grid and the same OSM extract, bounded by the grid's box", () => {
    const dir = mkdtempSync(join(tmpdir(), "graph-"));
    const grid = buildGrid(squareSite(375), "test-site", osm);
    writeFileSync(join(dir, "g.json"), JSON.stringify(grid));
    writeFileSync(join(dir, "osm.json"), JSON.stringify(osm));
    const out = join(dir, "test-site.graph.json");
    expect(main(["--graph", join(dir, "g.json"), "--osm", join(dir, "osm.json"), "--out", out])).toBe(0);
    const g = JSON.parse(readFileSync(out, "utf8"));
    expect(g.gridId).toBe("test-site");
    expect(g.bounds).toEqual(grid.bbox);
    expect(g.edges.length).toBeGreaterThan(0);
    expect(g.projection.metresPerDegreeLat).toBeGreaterThan(0);
    expect(main(["--graph", join(dir, "g.json"), "--out", out])).toBe(2);
  });
});
