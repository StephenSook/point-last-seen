// Public sightings, entered at the command post. A sighting is an event like
// any other: created once, never changed. It moves the map only after a
// person confirms it, and a sighting promoted to the start point stops
// counting as a likelihood. A caller's name and number are never stored.

import {
  deriveClueEffect,
  eventId,
  type ClothingColor,
  type Direction,
  type EventDoc,
  type ReportReading,
} from "@pls/engine";
import { effectSegments, segmentContaining, type GridSegmentDoc, type LatLon } from "../map/geo";

const NUMBER_REMOVED = "[number removed]";
// 10 digits (optional +1, optional brackets around the area code, spaces, dots or hyphens between groups),
// or a 7-digit local number with a separator. Times like 14:03 use a colon and are left alone.
const PHONE = /(?:\+?1[\s.-]*)?(?:\(\s*\d{3}\s*\)|\b\d{3})[\s.-]*\d{3}[\s.-]*\d{4}\b|\b\d{3}[.-]\d{4}\b/g;

export function removePhoneNumbers(text: string): string {
  return text.replace(PHONE, NUMBER_REMOVED);
}

export type SightingInput = {
  observedAtMs: number;
  position: LatLon | null;
  direction: Direction;
  topColor: ClothingColor;
  bottomColor: ClothingColor;
  footwear: string;
  carried: string;
  reportedBy: "stranger" | "neighbour" | "staff" | "family";
  freeText: string;
};

/** Who is writing and what the incident looks like right now. `seq` must never repeat for this uid. */
export type CommandWriter = {
  incidentId: string;
  uid: string;
  seq: number;
  clientTimeMs: number;
  priorVersion: number;
  segments: readonly GridSegmentDoc[];
};

/** The fields every command-written event shares; serverTime is replaced at write. */
export function commandEventBase(w: CommandWriter): Pick<EventDoc, "eventId" | "schemaVersion" | "incidentId" | "teamId" | "deviceId" | "seq" | "authorUid" | "role" | "clientTimeMs" | "serverTime" | "isTrainingInject" | "route" | "planVersion" | "priorVersion"> {
  return {
    eventId: eventId(w.incidentId, w.uid, w.seq),
    schemaVersion: 1,
    incidentId: w.incidentId,
    teamId: null,
    deviceId: w.uid,
    seq: w.seq,
    authorUid: w.uid,
    role: "command",
    clientTimeMs: w.clientTimeMs,
    serverTime: null, // replaced by serverTimestamp() at write
    isTrainingInject: false,
    route: null,
    planVersion: null,
    priorVersion: w.priorVersion,
  };
}

export function buildSightingEvent(input: SightingInput, w: CommandWriter): EventDoc {
  if (!Number.isFinite(input.observedAtMs)) throw new Error("A sighting needs the time it was seen.");
  const note = removePhoneNumbers(input.freeText).trim();
  if (note.length > 2000) throw new Error("Keep the note under 2000 characters.");
  const reading: ReportReading = {
    kind: "sighting",
    segmentIds: [],
    method: "unknown",
    coverage: null,
    minutes: null,
    searchers: null,
    searchType: "unknown",
    detectionRangeM: null,
    item: "",
    feature: "none",
    direction: input.direction,
    topColor: input.topColor,
    bottomColor: input.bottomColor,
    footwear: input.footwear.slice(0, 40),
    carried: input.carried.slice(0, 40),
    matchesProfile: "unknown",
    evidenceQuote: "",
  };
  const position = input.position ? { lat: input.position.lat, lon: input.position.lon, accuracyM: null } : null;
  const effect = deriveClueEffect(reading, {
    segments: effectSegments(w.segments),
    assignedSegmentIds: [],
    visualDetectionRangeM: null,
    rdBasis: "default",
    position,
    positionSegmentId: position ? segmentContaining(position, w.segments) : null,
  });
  return {
    ...commandEventBase(w),
    type: "sighting",
    reporter: input.reportedBy === "family" ? "family" : "public_caller",
    observedAtMs: input.observedAtMs,
    position,
    positionSource: position ? "map_click" : "none",
    rawText: note === "" ? null : note,
    inputMethod: note === "" ? "picklist" : "typed",
    reading,
    effect,
    targetEventId: null,
    decision: null,
  };
}

export function buildConfirmation(target: EventDoc, decision: "confirmed" | "rejected", w: CommandWriter): EventDoc {
  return {
    ...commandEventBase(w),
    type: "confirmation",
    reporter: "system",
    observedAtMs: null,
    position: null,
    positionSource: "none",
    rawText: null,
    inputMethod: "system",
    reading: null,
    effect: { kind: "none", why: "informational" },
    targetEventId: target.eventId,
    decision,
  };
}

/** Promote a confirmed sighting to the start point: it then shapes the prior and stops counting as a likelihood. */
export function useAsStartPoint(
  sighting: EventDoc,
  incident: { priorVersion: number; priorInputEventIds?: string[] },
): { priorInputEventIds: string[]; ipp: LatLon; ippSource: "sighting"; priorVersion: number } {
  if (!sighting.position) throw new Error("Place the sighting on the map first.");
  const ids = new Set(incident.priorInputEventIds ?? []);
  ids.add(sighting.eventId);
  return { priorInputEventIds: [...ids], ipp: { lat: sighting.position.lat, lon: sighting.position.lon }, ippSource: "sighting", priorVersion: incident.priorVersion + 1 };
}
