// A camera sighting at the command post (spec section 12.1). Confirming a clip reading writes
// a camera_sighting event (effect none, "incorporated_in_prior") and its confirmation, adds the
// sighting to the prior's inputs, moves the start to the camera when it was placed, and raises
// the prior version. The travel bearing is not stored on the incident: it is worked out again
// from the camera sightings among the prior's inputs (facing plus exit edge), so a rebuild for
// any reason keeps the same wedge.

import { bearingFromExit, lastSeenMs, type CameraSighting, type CameraSightingInput, type CameraSightingReading, type EventDoc, type RouteRecord } from "@pls/engine";
import type { LatLon } from "../map/geo";
import { readingBearingDeg } from "./direction";
import { commandEventBase, type CommandWriter } from "./sightings";

export type ClipFacts = {
  sha256: string;
  /** The cleaned reading (readClip has run checkSighting on it). */
  reading: CameraSightingInput;
  route: RouteRecord | null;
  clipStartMs: number;
  clockConfirmed: boolean;
  cameraFacingDeg: number | null;
  camera: LatLon | null;
};

const FACINGS = [0, 45, 90, 135, 180, 225, 270, 315] as const;
type Facing = CameraSightingReading["cameraFacingDeg"];

function facing(deg: number | null): Facing {
  if (deg === null) return null;
  if (!(FACINGS as readonly number[]).includes(deg)) throw new Error("The camera's facing is one of the 8 compass points.");
  return deg as Facing;
}

export function buildCameraSighting(c: ClipFacts, w: CommandWriter): EventDoc {
  const [y0, x0, y1, x1] = c.reading.keyFrame.box2d;
  if (c.reading.keyFrame.box2d.length !== 4) throw new Error("The key frame needs a box of four numbers.");
  // checkSighting has put the colors on the closed list and checked the box.
  const sighting = { ...c.reading, keyFrame: { time: c.reading.keyFrame.time, box2d: [y0!, x0!, y1!, x1!] } } as CameraSighting;
  const reading: CameraSightingReading = { sighting, clipSha256: c.sha256, clipStartMs: c.clipStartMs, clockConfirmed: c.clockConfirmed, cameraFacingDeg: facing(c.cameraFacingDeg) };
  return {
    ...commandEventBase(w),
    route: c.route,
    type: "camera_sighting",
    reporter: "camera",
    observedAtMs: lastSeenMs(c.clipStartMs, c.reading.lastSeen),
    position: c.camera ? { lat: c.camera.lat, lon: c.camera.lon, accuracyM: null } : null,
    positionSource: c.camera ? "camera_pin" : "none",
    rawText: null,
    inputMethod: "clip",
    reading,
    effect: { kind: "none", why: "incorporated_in_prior" },
    targetEventId: null,
    decision: null,
  };
}

export function cameraReading(e: { type?: unknown; reading?: unknown }): CameraSightingReading | null {
  return e.type === "camera_sighting" && e.reading && typeof e.reading === "object" && "sighting" in e.reading ? (e.reading as CameraSightingReading) : null;
}

/**
 * The bearing from the newest sighting among the prior's inputs, or null: a camera sighting's facing plus its exit
 * edge, or a confirmed sighting's compass direction. The newest one decides, so a later sighting with no direction
 * turns the wedge off, as the rebuild from it did.
 */
export function travelBearingFromInputs(events: readonly { eventId: string; type?: unknown; reading?: unknown }[], priorInputEventIds: readonly string[]): number | null {
  const byId = new Map(events.map((e) => [e.eventId, e]));
  for (const id of [...priorInputEventIds].reverse()) {
    const e = byId.get(id);
    if (!e) continue;
    const r = cameraReading(e);
    if (r) return bearingFromExit(r.cameraFacingDeg, r.sighting.exitEdge);
    if (e.type === "sighting") return readingBearingDeg(e);
  }
  return null;
}

/** The incident fields a confirmed camera sighting changes. */
export function cameraStartPatch(
  e: EventDoc,
  incident: { priorVersion: number; priorInputEventIds?: string[] },
): { priorInputEventIds: string[]; ipp?: LatLon; priorVersion: number } {
  const ids = new Set(incident.priorInputEventIds ?? []);
  ids.add(e.eventId);
  return {
    priorInputEventIds: [...ids],
    ...(e.position ? { ipp: { lat: e.position.lat, lon: e.position.lon } } : {}),
    priorVersion: incident.priorVersion + 1,
  };
}
