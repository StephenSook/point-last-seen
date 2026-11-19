import { describe, expect, it } from "vitest";
import { formatPct, type MapSegment } from "../laneC";
import { framePlates } from "./framePlates";

const seg = (segmentId: string, lat: number, lon: number): MapSegment => ({
  segmentId,
  geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + 0.001, lat], [lon + 0.001, lat + 0.001], [lon, lat]]] },
  centroid: { lat, lon },
});

describe("framePlates", () => {
  it("pairs each segment's percent with its place, sorted by segment id, with a missing percent as zero", () => {
    const plates = framePlates([seg("AB", 33.78, -84.369), seg("AA", 33.78, -84.37)], { AA: 0.4 });
    expect(plates).toEqual([
      { segmentId: "AA", label: formatPct(0.4), lat: 33.78, lon: -84.37 },
      { segmentId: "AB", label: formatPct(0), lat: 33.78, lon: -84.369 },
    ]);
  });
});
