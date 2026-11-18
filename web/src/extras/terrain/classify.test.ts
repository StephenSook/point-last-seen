import { describe, expect, it } from "vitest";
import { ISRID_ELEVATION, LEVEL_BAND_M, STREAM_LEVEL_M, classifyTerrain, parseElevation, segmentAt, streamDownhillCheck, type ElevationFile } from "./classify";

// FIXTURE: made-up elevations, not a real site.
function file(cells: Record<string, number>, gridId = "fixture-grid"): ElevationFile {
  return {
    gridId,
    gridSha256: "0".repeat(64),
    source: "USGS 3DEP via the Elevation Point Query Service",
    license: "US public domain",
    credit: "U.S. Geological Survey",
    fetchedAt: "2026-11-18",
    samplesPerCell: 5,
    units: "metres",
    cells: Object.fromEntries(Object.entries(cells).map(([id, m]) => [id, { meanM: m, minM: m - 1, maxM: m + 1, n: 5 }])),
  };
}

describe("classifyTerrain", () => {
  it("a segment more than 3 m below the start segment is lower; more than 3 m above is higher; inside the band is level", () => {
    expect(LEVEL_BAND_M).toBe(3);
    const c = classifyTerrain(file({ S: 100, A: 96.9, B: 97, C: 103, D: 103.1 }), "S");
    expect(c).toEqual({ S: "level", A: "lower", B: "level", C: "level", D: "higher" });
  });

  it("with no start segment every class is no_data", () => {
    expect(classifyTerrain(file({ S: 100, A: 90 }), null)).toEqual({ S: "no_data", A: "no_data" });
    expect(classifyTerrain(file({ S: 100, A: 90 }), "missing")).toEqual({ S: "no_data", A: "no_data" });
  });

  it("a segment missing from the file is no_data", () => {
    expect(classifyTerrain(file({ S: 100, A: 90 }), "S", LEVEL_BAND_M, ["S", "A", "ZZ"])).toEqual({ S: "level", A: "lower", ZZ: "no_data" });
  });
});

describe("parseElevation", () => {
  it("reads a file for this grid", () => {
    const r = parseElevation(file({ S: 100 }), "fixture-grid");
    expect(r.ok && r.file.cells["S"]!.meanM).toBe(100);
  });

  it("a file for another grid is refused", () => {
    expect(parseElevation(file({ S: 100 }, "other-grid"), "fixture-grid")).toEqual({ ok: false, reason: "The elevation file is for another grid." });
  });

  it("a file without its source, licence or credit, or with a broken cell, is refused", () => {
    const { credit: _c, ...noCredit } = file({ S: 100 });
    expect(parseElevation(noCredit, "fixture-grid").ok).toBe(false);
    expect(parseElevation({ ...file({ S: 100 }), units: "feet" }, "fixture-grid").ok).toBe(false);
    expect(parseElevation({ ...file({}), cells: { S: { meanM: "100" } } }, "fixture-grid").ok).toBe(false);
  });
});

describe("streamDownhillCheck", () => {
  it("streamDownhillCheck counts downhill, level and uphill links", () => {
    expect(STREAM_LEVEL_M).toBe(1);
    const f = file({ A: 100, B: 95, C: 95.5, D: 99, E: 80 });
    const segments = [
      { segmentId: "A", downstream: ["B"] },   // downhill
      { segmentId: "B", downstream: ["C"] },   // level (within 1 m)
      { segmentId: "C", downstream: ["D"] },   // uphill
      { segmentId: "D", downstream: ["ZZ"] },  // no data: not counted
      { segmentId: "E", downstream: [] },
    ];
    expect(streamDownhillCheck(f, segments)).toEqual({ links: 3, downhill: 1, level: 1, uphill: 1 });
  });
});

describe("segmentAt", () => {
  it("finds the segment that holds a point, or null", () => {
    const sq = (id: string, w: number) => ({ segmentId: id, geometry: { type: "Polygon" as const, coordinates: [[[w, 33.78], [w + 0.001, 33.78], [w + 0.001, 33.781], [w, 33.781], [w, 33.78]]] }, centroid: { lat: 33.7805, lon: w + 0.0005 } });
    const segs = [sq("AA", -84.37), sq("AB", -84.369)];
    expect(segmentAt(segs, { lat: 33.7805, lon: -84.3685 })).toBe("AB");
    expect(segmentAt(segs, { lat: 33.79, lon: -84.3685 })).toBeNull();
  });
});

describe("ISRID_ELEVATION", () => {
  it("the three ISRID shares add to 100", () => {
    expect(ISRID_ELEVATION.downhillPct + ISRID_ELEVATION.uphillPct + ISRID_ELEVATION.samePct).toBe(100);
    expect(ISRID_ELEVATION).toMatchObject({ downhillPct: 42, uphillPct: 19, samePct: 39 });
  });
});
