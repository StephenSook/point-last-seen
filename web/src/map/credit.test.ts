import { describe, expect, it } from "vitest";
import { mapCredit, OSM_COPYRIGHT_URL, PROTOMAPS_ATTRIBUTION_URL } from "./credit";

describe("mapCredit", () => {
  it("shows no credit while nothing derived from OpenStreetMap is drawn", () => {
    expect(mapCredit({ segments: 0, basemap: false })).toBeNull();
  });

  it("credits the OpenStreetMap contributors when the OSM-derived grid is drawn", () => {
    expect(mapCredit({ segments: 12, basemap: false })).toEqual({ protomaps: false });
  });

  it("credits Protomaps too when the basemap is drawn", () => {
    expect(mapCredit({ segments: 0, basemap: true })).toEqual({ protomaps: true });
    expect(mapCredit({ segments: 67, basemap: true })).toEqual({ protomaps: true });
  });

  it("links the OpenStreetMap credit to its copyright page and Protomaps to its attribution guidelines", () => {
    expect(OSM_COPYRIGHT_URL).toBe("https://www.openstreetmap.org/copyright");
    expect(PROTOMAPS_ATTRIBUTION_URL).toBe("https://github.com/protomaps/basemaps#licensing-and-attribution-guidelines");
  });
});
