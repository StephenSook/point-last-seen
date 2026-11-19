// A drill site from an OpenStreetMap park relation: its outer rings stitched from their ways, its inner rings kept as
// holes, clipped to a window so the grid fits one prior batch.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { area } from "@turf/area";
import { describe, expect, it } from "vitest";
import { MAX_SEGMENTS, buildCells } from "../src/cells";
import { main } from "../src/cli";
import { siteFromOsm } from "../src/site";
import { at } from "./fixtures";

const pt = (x: number, y: number) => { const [lon, lat] = at(x, y); return { lat, lon }; };
// A 2 km x 2 km park whose outer ring comes in two ways, with a 200 m x 200 m private inholding as a hole.
const park = { elements: [{ type: "relation", id: 42, tags: { name: "Test Park", boundary: "protected_area" }, members: [
  { type: "way", role: "outer", geometry: [pt(0, 0), pt(2000, 0), pt(2000, 2000)] },
  { type: "way", role: "outer", geometry: [pt(0, 0), pt(0, 2000), pt(2000, 2000)] },
  { type: "way", role: "inner", geometry: [pt(900, 900), pt(1100, 900), pt(1100, 1100), pt(900, 1100), pt(900, 900)] },
] }] };
const [w, s] = at(0, 0), [e, n] = at(1000, 1000);

describe("siteFromOsm", () => {
  it("stitches the outer ways, keeps the hole and records its source", () => {
    const site = siteFromOsm(park, 42);
    expect(site.geometry.type).toBe("Polygon");
    expect(site.geometry.coordinates).toHaveLength(2);
    expect(area(site)).toBeGreaterThan(2000 * 2000 * 0.98 - 200 * 200);
    expect(area(site)).toBeLessThan(2000 * 2000 * 1.02 - 200 * 200);
    expect(site.properties).toMatchObject({ name: "Test Park", source: "OpenStreetMap relation 42 (ODbL)" });
  });
  it("clips to a window [south, west, north, east] and records it", () => {
    const site = siteFromOsm(park, 42, [s, w, n, e]);
    expect(area(site)).toBeGreaterThan(1000 * 1000 * 0.98 - 100 * 100);
    expect(area(site)).toBeLessThan(1000 * 1000 * 1.02 - 100 * 100 * 0.5);
    expect(site.properties?.window).toEqual([s, w, n, e]);
  });
  it("refuses a missing relation, an open ring and a window outside the park", () => {
    expect(() => siteFromOsm(park, 7)).toThrow(/relation 7/);
    const open = { elements: [{ ...park.elements[0]!, members: [park.elements[0]!.members[0]!] }] };
    expect(() => siteFromOsm(open, 42)).toThrow(/closed/);
    const [fw, fs] = at(5000, 5000), [fe, fn] = at(6000, 6000);
    expect(() => siteFromOsm(park, 42, [fs, fw, fn, fe])).toThrow(/window/);
  });
});

describe("the grid fits one prior batch", () => {
  it("refuses a site with more cells than a prior batch can write", () => {
    expect(MAX_SEGMENTS).toBe(480);
    const big = siteFromOsm({ elements: [{ type: "relation", id: 1, tags: { name: "Big" }, members: [
      { type: "way", role: "outer", geometry: [pt(0, 0), pt(3000, 0), pt(3000, 3000), pt(0, 3000), pt(0, 0)] }] }] }, 1);
    expect(() => buildCells(big, "big")).toThrow(/480/);
    expect(buildCells(siteFromOsm(park, 42, [s, w, n, e]), "ok").segments.length).toBeLessThanOrEqual(MAX_SEGMENTS);
  });
});

describe("cli --site-from-osm", () => {
  it("writes the clipped site with its source, and refuses a missing relation or a bad window", () => {
    const dir = mkdtempSync(join(tmpdir(), "site-"));
    writeFileSync(join(dir, "park.json"), JSON.stringify(park));
    const out = join(dir, "site.geojson");
    expect(main(["--site-from-osm", join(dir, "park.json"), "--relation", "42", "--window", `${s},${w},${n},${e}`, "--out", out])).toBe(0);
    const site = JSON.parse(readFileSync(out, "utf8"));
    expect(site.geometry.type).toBe("Polygon");
    expect(site.properties.source).toBe("OpenStreetMap relation 42 (ODbL)");
    expect(main(["--site-from-osm", join(dir, "park.json"), "--relation", "7", "--out", out])).toBe(1);
    expect(main(["--site-from-osm", join(dir, "park.json"), "--relation", "42", "--window", "1,2,3", "--out", out])).toBe(2);
  });
});
