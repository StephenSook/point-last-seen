// The published drill run, as the judge replay reads it. The exporter writes this shape, so the reader and the
// writer agree on one typed contract instead of each guessing the other. The file is served publicly at
// /evidence/published-run.json: it carries no uid, no join code, no report text, no profile field, no clip
// path and no consent record. The reader refuses a run that carries report text.

import type { Assignment, CameraSightingReading, EngineParams, EventDoc } from "../laneC";

export const PUBLISHED_RUN_VERSION = 1;

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
    /** When the current prior came into use. Absent or null: the replay uses its conservative rule. */
    priorBuiltAtMs?: number | null;
    gridId?: string;
    gridAttribution?: string;
  };
  /** Every segment doc as stored, plus the reserved ROW doc that holds the prior mass outside the map. */
  segments: (RunSegment | { segmentId: "ROW"; priorPoa: number })[];
  teams: { teamId: string; name: string }[];
  /** One row per device doc. clockOffsetMs: server time minus the device clock, measured at pack time; null when never measured. */
  devices: { deviceId: string; teamId: string; clockOffsetMs: number | null }[];
  events: RunEvent[];
  plans: RunPlan[];
  /** The numbers block. The replay does not read it. */
  measurements: unknown;
};

export type RunSegment = {
  segmentId: string;
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
 * author for this run, never the real uid: the engine compares authors only to decide who may retract what.
 * `rawText` is always null. `reading` is kept only for a camera sighting (its times and clock); a report's
 * reading quotes the report's words, so it is null.
 */
export type RunEvent = Omit<EventDoc, "serverTime" | "rawText" | "reading"> & {
  serverTimeMs: number;
  rawText: null;
  reading: CameraSightingReading | null;
};

/** One approved plan. approvedAtMs: the server's approval time in milliseconds. */
export type RunPlan = {
  version: number;
  approvedAtMs: number;
  priorVersion: number;
  basedOnEventSetHash: string;
  assignments: Assignment[];
};
