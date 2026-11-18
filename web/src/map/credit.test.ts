import { describe, expect, it } from "vitest";
import { mapCredit } from "./credit";

describe("mapCredit", () => {
  it("shows no OpenStreetMap credit while nothing derived from OpenStreetMap is drawn", () => {
    expect(mapCredit({ segments: 0, basemap: false })).toBeNull();
  });

  it("credits OpenStreetMap when segments from the OSM-derived grid are drawn", () => {
    expect(mapCredit({ segments: 12, basemap: false })).toBe("Map data from OpenStreetMap");
  });

  it("credits OpenStreetMap when the basemap is drawn", () => {
    expect(mapCredit({ segments: 0, basemap: true })).toBe("Map data from OpenStreetMap");
  });

  it("shows the grid's own attribution when the grid declares one", () => {
    const gridAttribution = "Map data from OpenStreetMap contributors (ODbL)";
    expect(mapCredit({ segments: 67, basemap: false, gridAttribution })).toBe(gridAttribution);
    expect(mapCredit({ segments: 0, basemap: false, gridAttribution })).toBeNull();
  });
});
