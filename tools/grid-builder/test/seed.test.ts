import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCells } from "../src/cells";
import { main } from "../src/cli";
import { priorDocs } from "../src/seed";
import { at, squareSite } from "./fixtures";

const grid = buildCells(squareSite(375), "s");
const [ippLon, ippLat] = at(60, 310);
const ipp = { lat: ippLat, lon: ippLon };

describe("segment docs for Firestore (incidents/{id}/segments)", () => {
  it("one doc per segment plus ROW last, and the prior sums to 1", () => {
    const docs = priorDocs(grid, ipp, "temperate_flat", { linear: false, wedge: false }, null);
    expect(docs.map(d => d.segmentId)).toEqual([...grid.segments.map(s => s.segmentId), "ROW"]);
    expect(docs.reduce((n, d) => n + d.priorPoa, 0)).toBeCloseTo(1, 12);
    expect(docs.at(-1)).toEqual({ segmentId: "ROW", priorPoa: docs.at(-1)!.priorPoa });
  });
  it("carries what the apps read: geometry as a GeoJSON string, centroid, area, links and features", () => {
    const d = priorDocs(grid, ipp, "temperate_flat", { linear: false, wedge: false }, null)[0]!;
    const s = grid.segments[0]!;
    expect(Object.keys(d).sort()).toEqual(["areaM2", "centroid", "downstream", "featureClasses", "geometryJson", "nearFrac",
      "neighbors", "priorPoa", "segmentId", "upstream"]);
    expect(JSON.parse((d as { geometryJson: string }).geometryJson)).toEqual(s.geometry);
    expect(d).toMatchObject({ segmentId: s.segmentId, areaM2: s.areaM2, centroid: s.centroid, neighbors: s.neighbors });
  });
  it("cells wholly inside the 300 m first ring share its mass evenly; the far corner cell gets less", () => {
    // The IPP is at (60, 310) m: AA (holding it) and AE (farthest corner 265 m away) are wholly inside ring 1;
    // AI's far corner is 442 m away, in ring 2, where mass per square metre is far lower.
    // Rows sit at slightly different latitudes, so their cells differ slightly in area: compare mass per m2.
    const docs = priorDocs(grid, ipp, "temperate_flat", { linear: false, wedge: false }, null);
    const density = new Map(docs.flatMap(d => ("areaM2" in d ? [[d.segmentId, d.priorPoa / d.areaM2] as const] : [])));
    expect(density.get("AE")! / density.get("AA")!).toBeCloseTo(1, 9);
    expect(density.get("AI")!).toBeLessThan(density.get("AA")! / 2);
  });
});

describe("cli --prior", () => {
  it("writes the docs and exits 0; a malformed --ipp exits 2", () => {
    const dir = mkdtempSync(join(tmpdir(), "prior-"));
    writeFileSync(join(dir, "g.json"), JSON.stringify(grid));
    const out = join(dir, "segments.json");
    expect(main(["--prior", join(dir, "g.json"), "--ipp", `${ipp.lat},${ipp.lon}`, "--terrain", "temperate_flat", "--linear", "--out", out])).toBe(0);
    const j = JSON.parse(readFileSync(out, "utf8"));
    expect(j.layers).toEqual({ linear: true, wedge: false });
    expect(j.terrain).toBe("temperate_flat");
    expect(j.docs.at(-1).segmentId).toBe("ROW");
    expect(main(["--prior", join(dir, "g.json"), "--ipp", "north", "--terrain", "temperate_flat", "--out", out])).toBe(2);
    expect(main(["--prior", join(dir, "g.json"), "--ipp", "1,2", "--terrain", "desert", "--out", out])).toBe(2);
  });
});
