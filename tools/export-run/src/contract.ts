// The public run's contract, as the judge replay reads it: a copy of web/src/extras/replay/runContract.ts
// (lane-extras 0ac8725) until that file is on main, when this module imports it instead. The reader refuses a
// run with any other field, so the exporter writes exactly these and nothing private can ride along.

export const PUBLISHED_RUN_VERSION = 1;
/** A run author's pseudonym, stable within one run. Never the real uid. */
export const AUTHOR_PSEUDONYM = /^author-[0-9]+$/;
/** A run device's pseudonym, the same in the events and the device table (a raw device id is a user id). */
export const DEVICE_PSEUDONYM = /^device-[0-9]+$/;
/** A Firebase Auth uid: 28 letters and digits. */
export const FIREBASE_UID_SHAPE = /^[A-Za-z0-9]{28}$/;

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
