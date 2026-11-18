import { buildPrior, DEFAULT_PARAMS } from "@pls/engine";
import { describe, expect, it } from "vitest";
import type { SegmentDoc } from "../data/incident";
import { gridFromDocs, priorWrites, rebuildPrior } from "./rebuild";

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

describe("rebuilding the prior from the stored segments", () => {
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
