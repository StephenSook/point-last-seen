import { describe, expect, it } from "vitest";
import type { EventDoc, RouteRecord } from "@pls/engine";
import { buildCameraSighting, cameraStartPatch, travelBearingFromInputs, type ClipFacts } from "./cameraSighting";
import { buildConfirmation, type CommandWriter } from "./sightings";

const SHA = "c".repeat(64);
const START = 1_763_820_000_000;
const reading = {
  personVisible: true, firstSeen: "00:01", lastSeen: "00:05", entryEdge: "right" as const, exitEdge: "left" as const,
  topColor: "blue", bottomColor: "black", topType: "rain jacket", footwear: "boots", headwear: "",
  carriedItems: ["umbrella"], keyFrame: { time: "00:04", box2d: [400, 300, 600, 700] },
  lighting: "day" as const, legibility: "clear" as const, evidence: "x",
};
const route: RouteRecord = { platform: "web", path: "cloud", stage: "sdk", model: "gemini-3.5-flash-lite", reason: "sdk_only_in_cloud", latencyMs: 900, sdkReported: true, blocked: null, decidedAtMs: START };
const clip: ClipFacts = { sha256: SHA, reading, route, clipStartMs: START, clockConfirmed: true, cameraFacingDeg: 90, camera: { lat: 33.78, lon: -84.37 } };
const writer = (seq: number): CommandWriter => ({ incidentId: "drill-dev-1", uid: "u1", seq, clientTimeMs: START + 60_000, priorVersion: 7, segments: [] });

describe("buildCameraSighting", () => {
  it("records the clip reading at the camera's place, last seen at clip start plus lastSeen", () => {
    const e = buildCameraSighting(clip, writer(4));
    expect(e).toMatchObject({
      type: "camera_sighting", reporter: "camera", role: "command", seq: 4, priorVersion: 7,
      observedAtMs: START + 5_000,
      position: { lat: 33.78, lon: -84.37, accuracyM: null }, positionSource: "camera_pin",
      inputMethod: "clip", rawText: null, route,
      effect: { kind: "none", why: "incorporated_in_prior" }, targetEventId: null, decision: null,
      reading: { sighting: { ...reading, keyFrame: { time: "00:04", box2d: [400, 300, 600, 700] } }, clipSha256: SHA, clipStartMs: START, clockConfirmed: true, cameraFacingDeg: 90 },
    });
    expect(Object.keys(e)).toHaveLength(25);
  });

  it("has no position when the camera was not placed", () => {
    expect(buildCameraSighting({ ...clip, camera: null }, writer(4))).toMatchObject({ position: null, positionSource: "none" });
  });

  it("is confirmed by a second event that targets it", () => {
    const e = buildCameraSighting(clip, writer(4));
    const c = buildConfirmation(e, "confirmed", writer(5));
    expect(c.targetEventId).toBe(e.eventId);
    expect(c.eventId).not.toBe(e.eventId);
  });
});

describe("travelBearingFromInputs", () => {
  const cam = (seq: number, facing: number | null, exit: "left" | "right" | "top"): EventDoc =>
    buildCameraSighting({ ...clip, cameraFacingDeg: facing, reading: { ...reading, exitEdge: exit } }, writer(seq));
  it("comes from a camera sighting that is a prior input: facing plus the exit edge", () => {
    const e = cam(1, 90, "left");
    expect(travelBearingFromInputs([e], [e.eventId])).toBe(0);
  });
  it("is null when the camera sighting is not a prior input, has no facing, or left by the top edge", () => {
    const a = cam(1, 90, "left");
    const b = cam(2, null, "left");
    const c = cam(3, 90, "top");
    expect(travelBearingFromInputs([a], [])).toBeNull();
    expect(travelBearingFromInputs([b], [b.eventId])).toBeNull();
    expect(travelBearingFromInputs([c], [c.eventId])).toBeNull();
  });
  it("takes the latest camera input when there are several", () => {
    const a = cam(1, 90, "left");
    const b = cam(2, 90, "right");
    expect(travelBearingFromInputs([b, a], [a.eventId, b.eventId])).toBe(180);
  });
  // A confirmed sighting with a place is a prior input too: its "Going" direction is the travel bearing.
  const seen = (id: string, direction: string): EventDoc =>
    ({ ...cam(9, 90, "left"), eventId: id, type: "sighting", reading: { kind: "sighting", direction } } as unknown as EventDoc);
  it("comes from a sighting that is the newest prior input, by its compass direction", () => {
    const a = cam(1, 90, "right");
    expect(travelBearingFromInputs([a, seen("s1", "n")], [a.eventId, "s1"])).toBe(0);
    expect(travelBearingFromInputs([a, seen("s1", "sw")], [a.eventId, "s1"])).toBe(225);
  });
  it("is null when the newest input is a sighting with no compass direction, even after a camera with one", () => {
    const a = cam(1, 90, "right");
    expect(travelBearingFromInputs([a, seen("s1", "unknown")], [a.eventId, "s1"])).toBeNull();
    expect(travelBearingFromInputs([a, seen("s1", "downstream")], [a.eventId, "s1"])).toBeNull();
  });
});

describe("cameraStartPatch", () => {
  it("adds the sighting to the prior inputs, moves the start to the camera and raises the prior version", () => {
    const e = buildCameraSighting(clip, writer(4));
    expect(cameraStartPatch(e, { priorVersion: 7, priorInputEventIds: ["x"] })).toEqual({ priorInputEventIds: ["x", e.eventId], ipp: { lat: 33.78, lon: -84.37 }, priorVersion: 8 });
  });
  it("keeps the start where it is when the camera was not placed, and never lists an input twice", () => {
    const e = buildCameraSighting({ ...clip, camera: null }, writer(4));
    expect(cameraStartPatch(e, { priorVersion: 7, priorInputEventIds: [e.eventId] })).toEqual({ priorInputEventIds: [e.eventId], priorVersion: 8 });
  });
});
