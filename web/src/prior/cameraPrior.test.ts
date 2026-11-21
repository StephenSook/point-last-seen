import { buildPrior, DEFAULT_PARAMS } from "@pls/engine";
import { describe, expect, it } from "vitest";
import { buildCameraSighting, type ClipFacts } from "../data/cameraSighting";
import type { SegmentDoc } from "../data/incident";
import { cameraConfirmWrites, cameraPriorWrites, familyCameraConfirmWrites } from "./cameraPrior";
import { gridFromDocs } from "./rebuild";

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
    areaM2: 125 * 125, priorPoa: 0.05, neighbors: [], upstream: [], downstream: [],
  };
});
const CAMERA = { lat: IPP.lat + D_LAT, lon: IPP.lon };
const reading = {
  personVisible: true, firstSeen: "00:01", lastSeen: "00:05", entryEdge: "right" as const, exitEdge: "left" as const,
  topColor: "blue", bottomColor: "black", topType: "", footwear: "", headwear: "", carriedItems: [],
  keyFrame: { time: "00:04", box2d: [400, 300, 600, 700] }, lighting: "day" as const, legibility: "clear" as const, evidence: "x",
};
const clip: ClipFacts = { sha256: "d".repeat(64), reading, route: null, clipStartMs: 1, clockConfirmed: true, cameraFacingDeg: 90, camera: CAMERA };
const writer = { incidentId: "i", uid: "u1", seq: 3, clientTimeMs: 2, priorVersion: 7, segments: [] };
const incident = { gridId: "synthetic", gridAttribution: "a", ipp: IPP, terrain: "temperate_flat" as const, priorLayers: { linear: false, wedge: false }, priorVersion: 7, priorInputEventIds: ["x"] };

describe("cameraPriorWrites", SLOW, () => {
  it("rebuilds the ring prior from the camera with the wedge on, adds the sighting to the inputs and raises the version", () => {
    const cam = buildCameraSighting(clip, writer);
    const w = cameraPriorWrites(SEGS, incident, cam, 0);
    const direct = buildPrior(gridFromDocs(SEGS, "synthetic", "a"), CAMERA, "temperate_flat", { linear: false, wedge: true }, 0, DEFAULT_PARAMS);
    expect(w.segments.map((s) => s.data.priorPoa)).toEqual(direct.segments.map((s) => s.priorPoa));
    expect(w.incident).toEqual({ priorLayers: { linear: false, wedge: true }, terrain: "temperate_flat", priorVersion: 8, priorModel: "rings", ipp: CAMERA, priorInputEventIds: ["x", cam.eventId] });
  });

  it("keeps the start and the wedge setting when the camera has no place and there is no bearing", () => {
    const cam = buildCameraSighting({ ...clip, camera: null, cameraFacingDeg: null }, writer);
    const w = cameraPriorWrites(SEGS, incident, cam, null);
    expect(w.incident).toMatchObject({ ipp: IPP, priorLayers: { linear: false, wedge: false }, priorVersion: 8 });
  });
});

describe("cameraPriorWrites with no bearing", SLOW, () => {
  it("turns the stored wedge off when the newest camera sighting gives no direction", () => {
    const cam = buildCameraSighting({ ...clip, cameraFacingDeg: null }, writer);
    const w = cameraPriorWrites(SEGS, { ...incident, priorLayers: { linear: false, wedge: true } }, cam, null);
    expect(w.incident.priorLayers).toEqual({ linear: false, wedge: false });
  });
});

describe("cameraConfirmWrites", SLOW, () => {
  it("builds the camera sighting, its confirmation and the prior before anything is written", () => {
    const out = cameraConfirmWrites(clip, [writer, { ...writer, seq: 4 }], SEGS, incident, 0);
    expect(out.events.map((e) => e.type)).toEqual(["camera_sighting", "confirmation"]);
    expect(out.events[1]!.targetEventId).toBe(out.events[0]!.eventId);
    expect(out.prior.incident.priorInputEventIds).toEqual(["x", out.events[0]!.eventId]);
  });
  it("throws, with nothing to write, when the prior cannot be built", () => {
    expect(() => cameraConfirmWrites({ ...clip, cameraFacingDeg: 10 }, [writer, { ...writer, seq: 4 }], SEGS, incident, null)).toThrow(/8 compass points/);
  });
});

describe("familyCameraConfirmWrites", SLOW, () => {
  // The family app's camera sighting: its own clip read, no camera pin, the prior not rebuilt (only command can).
  const famCam = { ...buildCameraSighting({ ...clip, camera: null }, { ...writer, uid: "fam" }), role: "family" as const };

  it("confirms the family's clip as command and rebuilds the prior from the camera place command picked", () => {
    const out = familyCameraConfirmWrites(famCam, CAMERA, writer, SEGS, incident);
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({ type: "confirmation", role: "command", targetEventId: famCam.eventId, decision: "confirmed" });
    expect(out.prior.incident.priorInputEventIds).toEqual(["x", famCam.eventId]);
    expect(out.prior.incident.ipp).toEqual(CAMERA);
    expect(out.prior.incident.priorVersion).toBe(8);
  });

  it("uses the clip's own camera place when the family gave one", () => {
    const pinned = { ...famCam, position: { lat: CAMERA.lat, lon: CAMERA.lon, accuracyM: null } };
    expect(familyCameraConfirmWrites(pinned, null, writer, SEGS, incident).prior.incident.ipp).toEqual(CAMERA);
  });

  it("needs a camera place before anything is built", () => {
    expect(() => familyCameraConfirmWrites(famCam, null, writer, SEGS, incident)).toThrow("Place the camera on the map first.");
  });
});

describe("a camera rebuild keeps the elevation layer, measured from the camera's place", SLOW, () => {
  // The camera is in CB, in the north row (120 m): the new start, so its row is level and the rows south are lower.
  const cam = buildCameraSighting(clip, writer);
  const elevationM = Object.fromEntries(SEGS.map((s) => [s.segmentId, s.segmentId[0] === "C" ? 120 : s.segmentId[0] === "A" ? 80 : 100]));
  const withElevation = { ...incident, priorLayers: { linear: false, wedge: false, elevation: true } };

  it("rebuilds with the elevations from the site's file, from the new start", () => {
    const w = cameraPriorWrites(SEGS, { ...withElevation, elevationM }, cam, null);
    expect(w.incident.priorLayers).toMatchObject({ elevation: true });
    const direct = buildPrior(gridFromDocs(SEGS, "synthetic", "a"), CAMERA, "temperate_flat", { linear: false, wedge: false, elevation: true },
      null, DEFAULT_PARAMS, { startM: 120, bySegment: elevationM });
    expect(w.segments.map((s) => s.data.priorPoa)).toEqual(direct.segments.map((s) => s.priorPoa));
  });

  it("never blocks a confirmation: with no elevations, or a new start outside every segment, it rebuilds with the layer off", () => {
    const noFile = cameraPriorWrites(SEGS, withElevation, cam, null);
    expect(noFile.incident.priorLayers).toMatchObject({ elevation: false });
    const outside = buildCameraSighting({ ...clip, camera: { lat: IPP.lat + 0.5, lon: IPP.lon } }, writer);
    const w = cameraPriorWrites(SEGS, { ...withElevation, elevationM }, outside, null);
    expect(w.incident.priorLayers).toMatchObject({ elevation: false });
    const ring = buildPrior(gridFromDocs(SEGS, "synthetic", "a"), { lat: IPP.lat + 0.5, lon: IPP.lon }, "temperate_flat", { linear: false, wedge: false }, null, DEFAULT_PARAMS);
    expect(w.segments.map((s) => s.data.priorPoa)).toEqual(ring.segments.map((s) => s.priorPoa));
  });
});

describe("a confirm before the map's segments load", SLOW, () => {
  it("is refused before anything is built, with the layer off or on", () => {
    const cam = buildCameraSighting(clip, writer);
    expect(() => cameraPriorWrites([], incident, cam, null)).toThrow("The map's segments have not loaded yet.");
    expect(() => cameraPriorWrites([], { ...incident, priorLayers: { linear: false, wedge: false, elevation: true } }, cam, null))
      .toThrow("The map's segments have not loaded yet.");
  });
});

