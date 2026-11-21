import { describe, expect, it } from "vitest";
import { areaKm, reachLine } from "./reach";

const cell = (w: number, s: number, e: number, n: number) => ({ geometry: { type: "Polygon" as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });

describe("the line under the ranking: how far the rings reach and how big the drill area is", () => {
  it("measures the drill area from its segments' outer bounds, east-west by north-south", () => {
    // The practice grid's bounds: 1.03 km by 1.60 km at 33.79 N.
    const segs = [cell(-84.3788985, 33.7818636, -84.373, 33.789), cell(-84.373, 33.789, -84.3677601, 33.7962307)];
    const [ew, ns] = areaKm(segs)!;
    expect(ew).toBeCloseTo(1.03, 2);
    expect(ns).toBeCloseTo(1.6, 2);
    expect(areaKm([])).toBeNull();
    // A segment that is several polygons counts every polygon's outer ring.
    const multi = { geometry: { type: "MultiPolygon" as const, coordinates: [cell(-84.3788985, 33.7818636, -84.373, 33.789).geometry.coordinates, cell(-84.373, 33.789, -84.3677601, 33.7962307).geometry.coordinates] } };
    expect(areaKm([multi])![1]).toBeCloseTo(1.6, 2);
  });

  it("says the outer ring's reach and the area's size, both computed", () => {
    const segs = [cell(-84.3788985, 33.7818636, -84.3677601, 33.7962307)];
    expect(reachLine([0.3, 1.0, 2.4, 12.8], segs)).toBe("The search rings reach 12.8 km; this drill area covers about 1.0 by 1.6 km.");
    expect(reachLine([0.3, 0.8, 1.9, 8.3], segs)).toBe("The search rings reach 8.3 km; this drill area covers about 1.0 by 1.6 km.");
  });

  it("says nothing without rings or segments", () => {
    expect(reachLine([], [cell(0, 0, 0.01, 0.01)])).toBeNull();
    expect(reachLine([0.3, 1.0, 2.4, 12.8], [])).toBeNull();
  });
});
