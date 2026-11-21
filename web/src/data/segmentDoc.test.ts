import { describe, expect, it } from "vitest";
import { segmentFromDoc } from "./incident";

const geometryJson = JSON.stringify({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] });
const base = { geometryJson, centroid: { lat: 0.5, lon: 0.5 }, areaM2: 100, priorPoa: 0.1, neighbors: ["B"], upstream: [], downstream: [] };

describe("segmentFromDoc: a stored segment as the command post reads it", () => {
  it("keeps the prior version the segment was written at, so a rebuild can tell a stale grid", () => {
    expect(segmentFromDoc("A", { ...base, priorVersion: 4 })).toMatchObject({ segmentId: "A", priorVersion: 4, neighbors: ["B"] });
  });
  it("leaves the version unset when the document has none or a non-number", () => {
    expect(segmentFromDoc("A", base)?.priorVersion).toBeUndefined();
    expect(segmentFromDoc("A", { ...base, priorVersion: "4" })?.priorVersion).toBeUndefined();
  });
  it("gives nothing for a document whose geometry cannot be read", () => {
    expect(segmentFromDoc("A", { ...base, geometryJson: "{" })).toBeNull();
  });
});
