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
  type RouteRecord,
} from "@pls/engine";
import { effectSegments, segmentContaining, type GridSegmentDoc, type LatLon } from "../map/geo";

// Phone numbers are removed by the shared rule (see ./phoneNumbers): the same cases on every platform.
export { removePhoneNumbers } from "./phoneNumbers";
import { removePhoneNumbers } from "./phoneNumbers";

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
  /** The model read that filled the fields, with its route (null when the read reported none). Absent: typed by hand. */
  readFilled?: { route: RouteRecord | null };
};

/**
 * The route of a report a person entered with no model: the same record the iPhone writes for a picked report.
 * `decidedAtMs` is the time it was written.
 */
export function handEntryRoute(decidedAtMs: number): RouteRecord {
  return { platform: "web", path: "rules", stage: "picklist", model: "none", reason: "on_device_default", latencyMs: 0, sdkReported: false, blocked: null, decidedAtMs };
}

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
    // Where the reading came from, so a drill run's replay can say which reports a model read.
    route: input.readFilled ? input.readFilled.route : handEntryRoute(w.clientTimeMs),
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

/**
 * Command places a family sighting on the map. The family app sends a sighting with no position and no effect
 * (it needs command); events are create-only, so command writes its own sighting at the picked point: the
 * family's time, words and reading, reported by the family, linked to the original by targetEventId, and with
 * the effect the engine derives for that point. Confirming it then moves the map like any command sighting.
 */
export function placeFamilySighting(family: EventDoc, position: LatLon, w: CommandWriter): EventDoc {
  const r = (family.reading ?? {}) as Partial<ReportReading>;
  const built = buildSightingEvent(
    {
      observedAtMs: family.observedAtMs ?? w.clientTimeMs,
      position,
      direction: (r.direction ?? "unknown") as Direction,
      topColor: (r.topColor ?? "unknown") as ClothingColor,
      bottomColor: (r.bottomColor ?? "unknown") as ClothingColor,
      footwear: r.footwear ?? "",
      carried: r.carried ?? "",
      reportedBy: "family",
      freeText: family.rawText ?? "",
    },
    w,
  );
  return { ...built, targetEventId: family.eventId };
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

/**
 * Command takes a report back: a new event that points at it. The report is never edited or deleted; every device's
 * engine stops counting it (a retraction from command counts for any author's report). A retraction of a training
 * inject is part of the inject.
 */
export function buildRetraction(target: EventDoc, w: CommandWriter): EventDoc {
  return {
    ...commandEventBase(w),
    isTrainingInject: target.isTrainingInject,
    type: "retraction",
    reporter: "system",
    observedAtMs: null,
    position: null,
    positionSource: "none",
    rawText: null,
    inputMethod: "system",
    reading: null,
    effect: { kind: "none", why: "informational" },
    targetEventId: target.eventId,
    decision: null,
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
