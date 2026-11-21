import { buildPrior, DEFAULT_PARAMS } from "@pls/engine";
import { describe, expect, it } from "vitest";
import type { SegmentDoc } from "../data/incident";
import { assertCurrentGrid, elevationDropNote, elevationDropReason, gridFromDocs, priorWrites, rebuildPrior, usableLayers } from "./rebuild";

// Each case builds a whole prior; on a loaded machine or a CI runner one can pass vitest's 5 s default.
const SLOW = { timeout: 30_000 };

// A synthetic 3 x 3 grid of 125 m cells around a made-up start point.
const IPP = { lat: 33.78, lon: -84.38 };
const D_LAT = 125 / 111_320;
const D_LON = 125 / (111_320 * Math.cos((IPP.lat * Math.PI) / 180));
const SEGS: SegmentDoc[] = Array.from({ length: 9 }, (_, i) => {
  const [r, c] = [Math.floor(i / 3) - 1, (i % 3) - 1];
  const [s, w] = [IPP.lat + (r - 0.5) * D_LAT, IPP.lon + (c - 0.5) * D_LON];
  return {
    segmentId: String.fromCharCode(65 + r + 1) + String.fromCharCode(65 + c + 1),
    geometry: { type: "Polygon", coordinates: [[[w, s], [w + D_LON, s], [w + D_LON, s + D_LAT], [w, s + D_LAT], [w, s]]] },
    centroid: { lat: s + D_LAT / 2, lon: w + D_LON / 2 },
    areaM2: 125 * 125,
    priorPoa: 0.05,
    neighbors: [],
    upstream: [],
    downstream: [],
    nearFrac: i % 2 === 0 ? 0.9 : 0.1,
    featureClasses: i % 2 === 0 ? ["trail"] : [],
  };
});

describe("rebuilding the prior from the stored segments", SLOW, () => {
  it("turns segment documents back into the engine's grid", () => {
    const g = gridFromDocs(SEGS, "synthetic", "Synthetic test grid");
    expect(g.segments).toHaveLength(9);
    expect(g.segments[0]).toMatchObject({ segmentId: "AA", nearFrac: 0.9, featureClasses: ["trail"], areaM2: 15625 });
    expect(g.attribution).toBe("Synthetic test grid");
  });

  it("gives exactly what buildPrior gives on that grid, ring baseline included", () => {
    const layers = { linear: true, wedge: false };
    const r = rebuildPrior(SEGS, { gridId: "synthetic", attribution: "a", ipp: IPP, terrain: "temperate_flat" }, layers, null);
    const direct = buildPrior(gridFromDocs(SEGS, "synthetic", "a"), IPP, "temperate_flat", layers, null, DEFAULT_PARAMS);
    expect(r.segments).toEqual(direct.segments);
    expect(r.row).toBe(direct.row);
    const ring = buildPrior(gridFromDocs(SEGS, "synthetic", "a"), IPP, "temperate_flat", { linear: false, wedge: false }, null, DEFAULT_PARAMS);
    expect(r.ring).toEqual(ring.segments);
    expect(r.segments.reduce((a, s) => a + s.priorPoa, 0) + r.row).toBeCloseTo(1, 9);
  });

  it("writes every segment, ROW and the incident, with the prior version raised by one", () => {
    const r = rebuildPrior(SEGS, { gridId: "synthetic", attribution: "a", ipp: IPP, terrain: "temperate_flat" }, { linear: false, wedge: false }, null);
    const w = priorWrites(r, { priorVersion: 4 }, { linear: false, wedge: false }, "temperate_flat");
    expect(w.segments).toHaveLength(9);
    expect(w.segments[0]).toEqual({ segmentId: "AA", data: { priorPoa: r.segments[0]!.priorPoa, ringPoa: r.ring[0]!.priorPoa, priorVersion: 5 } });
    expect(w.row).toEqual({ priorPoa: r.row, priorVersion: 5 });
    // These are ring probabilities, so the stored model says rings (a layer change made while
    // Walkers was on must not leave the controls saying Walkers over a ring table).
    expect(w.incident).toEqual({ priorLayers: { linear: false, wedge: false }, terrain: "temperate_flat", priorVersion: 5, priorModel: "rings" });
  });

  it("uses the incident's own engine parameters, not the defaults, for the prior and its ring baseline", () => {
    const params = { ...DEFAULT_PARAMS, rings: { ...DEFAULT_PARAMS.rings, temperate_flat: DEFAULT_PARAMS.rings.temperate_flat.map((r) => r / 4) as typeof DEFAULT_PARAMS.rings.temperate_flat } };
    const site = { gridId: "synthetic", attribution: "a", ipp: IPP, terrain: "temperate_flat" as const };
    const r = rebuildPrior(SEGS, site, { linear: false, wedge: false }, null, params);
    const direct = buildPrior(gridFromDocs(SEGS, "synthetic", "a"), IPP, "temperate_flat", { linear: false, wedge: false }, null, params);
    expect(r.segments).toEqual(direct.segments);
    expect(r.ring).toEqual(direct.segments);
    expect(r.segments).not.toEqual(rebuildPrior(SEGS, site, { linear: false, wedge: false }, null).segments);
  });

  it("refuses the wedge without a travel direction", () => {
    expect(() => rebuildPrior(SEGS, { gridId: "s", attribution: "a", ipp: IPP, terrain: "temperate_flat" }, { linear: false, wedge: true }, null)).toThrow(/direction of travel/);
  });
});

describe("rebuilding with the elevation layer (Koester, Lost Person Behavior, dementia p.164)", SLOW, () => {
  // BB holds the start point; the row north of it is 20 m up, the row south 20 m down, the middle row level.
  const elevationM = Object.fromEntries(SEGS.map((s) => [s.segmentId, s.segmentId[0] === "C" ? 120 : s.segmentId[0] === "A" ? 80 : 100]));
  const site = { gridId: "synthetic", attribution: "a", ipp: IPP, terrain: "temperate_flat" as const, elevationM };

  it("gives what buildPrior gives with the start segment's elevation, and leaves ROW alone", () => {
    const layers = { linear: false, wedge: false, elevation: true };
    const r = rebuildPrior(SEGS, site, layers, null);
    const direct = buildPrior(gridFromDocs(SEGS, "synthetic", "a"), IPP, "temperate_flat", layers, null, DEFAULT_PARAMS,
      { startM: 100, bySegment: elevationM });
    expect(r.segments).toEqual(direct.segments);
    const ring = rebuildPrior(SEGS, site, { linear: false, wedge: false }, null);
    expect(r.row).toBeCloseTo(ring.row, 12);
    const up = r.segments.filter((s) => s.segmentId[0] === "C").reduce((n, s) => n + s.priorPoa, 0);
    expect(up / (1 - r.row)).toBeCloseTo(0.19, 9);
  });

  it("refuses without the site's elevations or with the start outside every segment", () => {
    const layers = { linear: false, wedge: false, elevation: true };
    expect(() => rebuildPrior(SEGS, { ...site, elevationM: undefined }, layers, null)).toThrow(/elevation/);
    expect(() => rebuildPrior(SEGS, { ...site, ipp: { lat: 34.5, lon: -84.38 } }, layers, null)).toThrow(/start point/);
  });
});

describe("usableLayers: the elevation layer stays on only where it can measure the start", SLOW, () => {
  const elevationM = Object.fromEntries(SEGS.map((s) => [s.segmentId, 100]));
  const on = { linear: true, wedge: false, elevation: true };
  it("keeps it on with the site's elevations and the start inside a segment that has one", () => {
    expect(usableLayers(on, SEGS, IPP, elevationM)).toEqual(on);
  });
  it("turns only it off without the file, with the start outside, or with the start's segment missing", () => {
    expect(usableLayers(on, SEGS, IPP, undefined)).toEqual({ ...on, elevation: false });
    expect(usableLayers(on, SEGS, { lat: 34.5, lon: -84.38 }, elevationM)).toEqual({ ...on, elevation: false });
    const { BB: _bb, ...noStart } = elevationM;
    expect(usableLayers(on, SEGS, IPP, noStart)).toEqual({ ...on, elevation: false });
  });
  it("leaves layers without elevation untouched", () => {
    expect(usableLayers({ linear: false, wedge: true }, SEGS, IPP, undefined)).toEqual({ linear: false, wedge: true });
  });
});

describe("a rebuild needs the map's segments", SLOW, () => {
  it("refuses while the segments have not loaded, so no prior is saved over a missing grid", () => {
    const site = { gridId: "synthetic", attribution: "a", ipp: IPP, terrain: "temperate_flat" as const };
    expect(() => rebuildPrior([], site, { linear: false, wedge: false }, null)).toThrow("The map's segments have not loaded yet.");
  });

  it("refuses a partial set: a loaded segment names a neighbour, upstream or downstream segment that is missing", () => {
    const site = { gridId: "synthetic", attribution: "a", ipp: IPP, terrain: "temperate_flat" as const };
    const layers = { linear: false, wedge: false };
    const linked = SEGS.map((x, i) => ({ ...x, neighbors: [SEGS[(i + 1) % 9]!.segmentId, SEGS[(i + 8) % 9]!.segmentId] }));
    expect(() => rebuildPrior(linked, site, layers, null)).not.toThrow();
    const partial = "The map's segments have not all loaded yet.";
    expect(() => rebuildPrior(linked.slice(0, 8), site, layers, null)).toThrow(partial);
    expect(() => rebuildPrior(SEGS.map((x, i) => (i === 0 ? { ...x, upstream: ["ZZ"] } : x)), site, layers, null)).toThrow(partial);
    expect(() => rebuildPrior(SEGS.map((x, i) => (i === 0 ? { ...x, downstream: ["ZZ"] } : x)), site, layers, null)).toThrow(partial);
  });
});

describe("a rebuild needs the incident's current grid", SLOW, () => {
  const site = { gridId: "synthetic", attribution: "a", ipp: IPP, terrain: "temperate_flat" as const, priorVersion: 3 };
  const layers = { linear: false, wedge: false };
  it("rebuilds when every segment was written at the incident's prior version", () => {
    expect(() => rebuildPrior(SEGS.map((x) => ({ ...x, priorVersion: 3 })), site, layers, null)).not.toThrow();
  });
  it("rebuilds when a segment is newer than the incident (a copy taken mid-rebuild), so such an incident is never stuck", () => {
    expect(() => rebuildPrior(SEGS.map((x, i) => ({ ...x, priorVersion: i === 4 ? 4 : 3 })), site, layers, null)).not.toThrow();
  });
  it("refuses a segment from an older prior (a cached grid after a reseed) or with no version", () => {
    const stale = SEGS.map((x, i) => ({ ...x, priorVersion: i === 4 ? 2 : 3 }));
    expect(() => rebuildPrior(stale, site, layers, null)).toThrow("The map's segments have not all loaded yet.");
    const unversioned = SEGS.map((x, i) => (i === 4 ? x : { ...x, priorVersion: 3 }));
    expect(() => rebuildPrior(unversioned, site, layers, null)).toThrow("The map's segments have not all loaded yet.");
  });
});

describe("assertCurrentGrid: the check every rebuild and walker run makes first", SLOW, () => {
  it("passes a complete grid at the incident's version, and refuses an empty, partial or older one", () => {
    const at3 = SEGS.map((x) => ({ ...x, priorVersion: 3 }));
    expect(() => assertCurrentGrid(at3, 3)).not.toThrow();
    expect(() => assertCurrentGrid([], 3)).toThrow("The map's segments have not loaded yet.");
    const linked = at3.map((x, i) => ({ ...x, neighbors: [at3[(i + 1) % 9]!.segmentId] }));
    expect(() => assertCurrentGrid(linked.slice(0, 8), 3)).toThrow("The map's segments have not all loaded yet.");
    expect(() => assertCurrentGrid(at3, 4)).toThrow("The map's segments have not all loaded yet.");
  });
});

describe("elevationDropReason: why a rebuild turns the elevation layer off", SLOW, () => {
  const elevationM = Object.fromEntries(SEGS.map((s) => [s.segmentId, 100]));
  const on = { linear: false, wedge: false, elevation: true };
  it("gives none while the layer can stay on, or is off already", () => {
    expect(elevationDropReason(on, SEGS, IPP, elevationM)).toBeNull();
    expect(elevationDropReason({ linear: false, wedge: false }, SEGS, IPP, undefined)).toBeNull();
  });
  it("words the note command sees, and gives none without a reason", () => {
    expect(elevationDropNote("the new start is outside the mapped segments")).toBe("Rebuilt without downhill and level ground: the new start is outside the mapped segments.");
    expect(elevationDropNote(null)).toBeUndefined();
  });
  it("names the reason: no file, a start outside the grid, or a start segment the file does not hold", () => {
    expect(elevationDropReason(on, SEGS, IPP, undefined)).toBe("no elevation file loaded for this site");
    expect(elevationDropReason(on, SEGS, { lat: 34.5, lon: -84.38 }, elevationM)).toBe("the new start is outside the mapped segments");
    const { BB: _bb, ...noStart } = elevationM;
    expect(elevationDropReason(on, SEGS, IPP, noStart)).toBe("the new start's segment has no elevation");
  });
});

