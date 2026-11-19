// The published drill run, as the judge replay reads it. The exporter writes this shape, so the reader and the
// writer agree on one typed contract instead of each guessing the other. The file is served publicly at
// /evidence/published-run.json: it carries no uid, no join code, no report text, no profile field, no clip
// path and no consent record. The reader refuses a run that carries report text.

import type { Assignment, EngineParams, EventDoc } from "../laneC";

export const PUBLISHED_RUN_VERSION = 1;

/** A run author's pseudonym: "author-" and a number, stable within one run. Never the real uid. */
export const AUTHOR_PSEUDONYM = /^author-[0-9]+$/;
/**
 * A run device's pseudonym: "device-" and a number, the same in the events and the device table. The security rules
 * make a device id its author's auth uid, so a raw device id is a user id.
 */
export const DEVICE_PSEUDONYM = /^device-[0-9]+$/;
/** The shape of a Firebase Auth user id (28 letters and digits). No string anywhere in a public run may have it. */
export const FIREBASE_UID_SHAPE = /^[A-Za-z0-9]{28}$/;

// The fields each part may carry. The reader refuses any other field, so nothing private can ride along unnoticed.
export const RUN_FIELDS = {
  run: ["runId", "label", "exportedAt", "incident", "segments", "teams", "devices", "events", "plans", "measurements"],
  incident: ["name", "mode", "drillLabel", "priorVersion", "priorInputEventIds", "engineParams", "priorBuiltAtMs", "gridId", "gridAttribution"],
  segment: ["segmentId", "priorPoa", "geometryJson", "centroid", "areaM2", "neighbors", "upstream", "downstream", "nearFrac", "featureClasses"],
  row: ["segmentId", "priorPoa"],
  team: ["teamId", "name"],
  device: ["deviceId", "teamId", "clockOffsetMs"],
  event: [
    "eventId", "schemaVersion", "incidentId", "teamId", "deviceId", "seq", "authorUid", "role", "type", "reporter", "clientTimeMs",
    "observedAtMs", "position", "positionSource", "rawText", "inputMethod", "isTrainingInject", "reading", "effect", "route",
    "targetEventId", "decision", "planVersion", "priorVersion", "serverTimeMs",
  ],
  plan: ["version", "approvedAtMs", "priorVersion", "basedOnEventSetHash", "assignments"],
  cameraReading: ["clipStartMs", "clockConfirmed", "sighting"],
  cameraSighting: ["personVisible", "firstSeen", "lastSeen", "keyFrame"],
  keyFrame: ["time"],
} as const;

/** A camera sighting's reading in a public run: only the clock and the times the replay draws. */
export type RunCameraReading = {
  clipStartMs: number;
  clockConfirmed: boolean;
  sighting: { personVisible: boolean; firstSeen: string; lastSeen: string; keyFrame: { time: string } };
};

/** published-run.json, version 1. */
export type PublishedRunV1 = {
  runId: string;
  /** The drill line shown with the run. */
  label: string;
  /** ISO 8601, UTC. */
  exportedAt: string;
  incident: {
    name: string;
    mode: "drill" | "judge";
    drillLabel?: string;
    priorVersion: number;
    priorInputEventIds: string[];
    /** As stored on the incident. Absent: the shared engine constants, which the live command post also uses. */
    engineParams?: EngineParams;
    /**
     * When the current prior came into use. Absent or null: the replay shows a map only from the first server time
     * stamped with the current prior version, so writing this makes the replay cover more of the run.
     */
    priorBuiltAtMs?: number | null;
    gridId?: string;
    gridAttribution?: string;
  };
  /** Every segment doc as stored, plus the reserved ROW doc that holds the prior mass outside the map. */
  segments: (RunSegment | { segmentId: "ROW"; priorPoa: number })[];
  teams: { teamId: string; name: string }[];
  /**
   * One row per device doc, keyed by its DEVICE_PSEUDONYM. clockOffsetMs: server time minus the device clock, measured
   * at pack time; null when never measured.
   */
  devices: { deviceId: string; teamId: string; clockOffsetMs: number | null }[];
  events: RunEvent[];
  plans: RunPlan[];
  /** The numbers block. The replay does not read it. */
  measurements: unknown;
};

export type RunSegment = {
  segmentId: string;
  nearFrac?: number;
  featureClasses?: string[];
  priorPoa: number;
  /** The stored GeoJSON Polygon or MultiPolygon, as a string, as Firestore holds it. */
  geometryJson: string;
  centroid: { lat: number; lon: number };
  areaM2: number;
  neighbors: string[];
  upstream: string[];
  downstream: string[];
};

/**
 * One stored event with its server time as a number (milliseconds). `authorUid` is a stable pseudonym per
 * author for this run (AUTHOR_PSEUDONYM), never the real uid: the engine compares authors only to decide who may
 * retract what.
 * `rawText` is always null. `reading` is kept only for a camera sighting, cut to RunCameraReading; a report's
 * reading quotes the report's words, so it is null. A place to check (`type: "destination"`) has `position: null`:
 * it can be a home from the family's profile. A camera sighting has `position: null` too: the camera is usually at
 * the family's home.
 */
export type RunEvent = Omit<EventDoc, "serverTime" | "rawText" | "reading"> & {
  serverTimeMs: number;
  rawText: null;
  reading: RunCameraReading | null;
};

/** One approved plan. approvedAtMs: the server's approval time in milliseconds. */
export type RunPlan = {
  version: number;
  approvedAtMs: number;
  priorVersion: number;
  basedOnEventSetHash: string;
  assignments: Assignment[];
};
