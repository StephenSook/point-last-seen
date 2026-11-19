import { expect, it } from "vitest";
import type { SegmentDoc, ViewState } from "../hostApp";
import { buildPrintModel } from "../print/printModel";
import { drillView, planFixture } from "../testdata/fixtures";
import { exportFileName, rewind, ringIsCounterClockwise, round6, segmentsToGeoJson, type ExportInput } from "./geojsonExport";

const exterior = [[-84.812345678, 34.1], [-84.8, 34.1], [-84.8, 34.2], [-84.812345678, 34.2]];
const hole = [[-84.808, 34.12], [-84.808, 34.14], [-84.805, 34.14], [-84.805, 34.12]];
const aa: SegmentDoc = {
  segmentId: "AA", geometry: { type: "Polygon", coordinates: [exterior, hole] }, centroid: { lat: 34.15, lon: -84.806 },
  areaM2: 200, priorPoa: 0.3, neighbors: [], upstream: [], downstream: [],
};
const bb: SegmentDoc = {
  ...aa, segmentId: "BB", priorPoa: 0.5, geometry: { type: "MultiPolygon", coordinates: [[exterior, hole]] },
};
const vs: ViewState = {
  code: "K7Q4", hash: "a".repeat(64),
  result: {
    poa: { AA: 0.6, BB: 0.1, ROW: 0.3 }, remainingMass: { AA: 0.2, BB: 0.1, ROW: 0.2 },
    cumulativePod: { AA: 0.4, BB: 0, ROW: 0 }, appliedEventIds: [], ignoredEventIds: [],
  },
  rank: [
    { segmentId: "BB", rank: 2, poa: 0.1, priorPoa: 0.5, deltaPoa: -0.4 },
    { segmentId: "AA", rank: 1, poa: 0.6, priorPoa: 0.3, deltaPoa: 0.3 },
  ],
};
const exportedAtMs = Date.parse("2026-11-22T19:03:45Z");
const model = buildPrintModel({ view: drillView, plans: [planFixture(5)], code: "K7Q4", eventCount: 14, nowMs: exportedAtMs });
const input: ExportInput = { model, segments: [aa, bb, { ...aa, segmentId: "ROW" }], vs, rowPoa: 0.3, exportedAtMs };

function exported(i = input) {
  return segmentsToGeoJson(i) as Omit<ReturnType<typeof segmentsToGeoJson>, "features"> & {
    features: { geometry: SegmentDoc["geometry"]; properties: Record<string, unknown> }[];
  };
}

it("the root is a FeatureCollection and has no crs member (RFC 7946 section 4)", () => {
  const json = exported();
  expect(json.type).toBe("FeatureCollection");
  expect(json).not.toHaveProperty("crs");
});

it("one feature per segment; ROW is not a feature; its mass is pls.outsideMappedAreaPoa (RFC 7946 sections 3.3 and 6.1)", () => {
  const json = exported();
  expect(json.features.map(({ properties }) => properties.segmentId)).toEqual(["AA", "BB"]);
  expect(json.pls.outsideMappedAreaPoa).toBe(0.3);
});

it("positions are longitude then latitude, inside -180 to 180 and -90 to 90 (RFC 7946 sections 3.1.1 and 4)", () => {
  const ring = exported().features[0]?.geometry.coordinates[0] as number[][];
  expect(ring[0]).toEqual([-84.812346, 34.1]);
  for (const [longitude, latitude] of ring) {
    expect(Math.abs(longitude!)).toBeLessThanOrEqual(180);
    expect(Math.abs(latitude!)).toBeLessThanOrEqual(90);
  }
});

it("exterior rings are counterclockwise and holes clockwise, for input wound either way (RFC 7946 section 3.1.6)", () => {
  expect(ringIsCounterClockwise(exterior)).toBe(true);
  expect(ringIsCounterClockwise(hole)).toBe(false);
  for (const inputRings of [[exterior, hole], [[...exterior].reverse(), [...hole].reverse()]]) {
    const [outer, inner] = rewind(inputRings);
    expect(ringIsCounterClockwise(outer!)).toBe(true);
    expect(ringIsCounterClockwise(inner!)).toBe(false);
  }
});

it("the first and last position of each ring are equal (RFC 7946 section 3.1.6)", () => {
  const [outer, inner] = rewind([exterior, [...hole, hole[0]!]]);
  for (const ring of [outer!, inner!]) {
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring.at(-1));
  }
});

it("coordinates carry at most 6 decimal places (RFC 7946 section 11.2)", () => {
  expect(round6(-84.812345678)).toBe(-84.812346);
  expect(JSON.stringify(exported().features.map(({ geometry }) => geometry))).not.toMatch(/\.\d{7,}/);
});

it("a MultiPolygon segment exports as a MultiPolygon (RFC 7946 section 3.1.7)", () => {
  const geometry = exported().features[1]?.geometry;
  expect(geometry?.type).toBe("MultiPolygon");
  expect(geometry?.coordinates).toEqual([rewind([exterior, hole])]);
});

it("an unassigned segment has teamId null and taskText null (RFC 7946 section 3.2)", () => {
  expect(exported().features[1]?.properties).toMatchObject({ teamId: null, teamName: null, taskText: null });
});

it("the text holds no uid, no event text, no profile field (RFC 7946 sections 3.2 and 6.1)", () => {
  const privateFields = {
    uid: "private-marker", joinCode: "private-marker", rawText: "private-marker",
    profile: { command: "private-marker" }, clipPath: "private-marker", consent: "private-marker",
  };
  const json = exported({
    ...input, model: { ...model, ...privateFields }, vs: { ...vs, ...privateFields },
    segments: [{ ...aa, ...privateFields, geometry: { ...aa.geometry, ...privateFields } }],
  });
  expect(JSON.stringify(json)).not.toMatch(/uid|joinCode|rawText|profile|clipPath|consent|private-marker/i);
  expect(json.features[0]?.properties).toEqual({
    segmentId: "AA", areaM2: 200, priorPoa: 0.3, poa: 0.6, cumulativePod: 0.4, rank: 1,
    teamId: "alfa", teamName: "Alfa", taskText: "Search AA on plan 5.", planVersion: 5,
  });
  expect(json.pls).toEqual({
    incidentName: "Oak Park", mode: "drill", drillLabel: "Training drill. Nobody is missing.", planVersion: 5,
    eventSetHash: "a".repeat(64), matchCode: "K7Q4", outsideMappedAreaPoa: 0.3,
    exportedAt: "2026-11-22T19:03:45.000Z", attribution: "Map data from OpenStreetMap",
    note: "POA is a planning aid. It does not say where a person is.",
  });
});

it("the file name is ASCII, lower case and ends with .geojson (RFC 7946 appendix C)", () => {
  expect(exportFileName("OAK Park", 5, exportedAtMs)).toBe("pls-oak-park-plan-v5-20261122T1903Z.geojson");
  expect(exportFileName("  Caf\u00e9 / Park  ", null, exportedAtMs)).toBe("pls-cafe-park-20261122T1903Z.geojson");
});

it("the POA values in the file sum with the outside mass to 1 within 1e-9 (RFC 7946 sections 3.2 and 6.1)", () => {
  const { features, pls } = exported();
  const total = features.reduce((sum, feature) => sum + Number(feature.properties.poa), Number(pls.outsideMappedAreaPoa));
  expect(Math.abs(total - 1)).toBeLessThan(1e-9);
});
