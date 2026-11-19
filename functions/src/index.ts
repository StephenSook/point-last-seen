import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { beforeGenerateContent } from "firebase-functions/v2/ai";
import { onCall } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { guardLogLine, guardRequest } from "./cloudGuard.js";
import { handleJoin, type JoinRequest } from "./join.js";
import { deleteEndedSandboxes, handleStartJudgeSession } from "./judgeSession.js";
import { deleteClipForReading, handleDeleteMedia, runMediaSweep } from "./media.js";
import { handlePlanCreated } from "./notify.js";

if (getApps().length === 0) initializeApp();

/** joinIncident (callable): checks the join code and sets custom claims { inc, role, team }. App Check enforced. */
export const joinIncident = onCall<JoinRequest>(
  { enforceAppCheck: true, region: "us-central1", maxInstances: 5 },
  request => handleJoin(request.auth?.uid ?? null, request.data),
);

/**
 * deleteIncidentMedia (scheduled every 5 minutes, so a sandbox's media goes within 15 minutes of its end even
 * when a run is late): deletes an ended judge sandbox's clips, photos and packs,
 * then records the bucket's lifecycle state in ops/storage for the credential-free daily probe.
 */
export const deleteIncidentMedia = onSchedule(
  { schedule: "every 5 minutes", region: "us-central1", maxInstances: 1, timeoutSeconds: 240 },
  async () => {
    const db = getFirestore(), bucket = getStorage().bucket();
    const r = await runMediaSweep(db, bucket, Date.now());
    console.log(JSON.stringify({ event: "deleteIncidentMedia", incidents: r.incidents, files: r.files, failed: r.failed.length }));
  },
);

/**
 * deleteClipOnConsentEnd: when a clip reading (the consent record) is deleted, by its TTL, by command or
 * otherwise, its clip goes with it. Retry is on, so a transient Storage error is retried; a missing clip is
 * not an error. No model call.
 */
export const deleteClipOnConsentEnd = onDocumentDeleted(
  { document: "incidents/{incidentId}/clipReadings/{sha256}", region: "us-central1", retry: true, maxInstances: 5 },
  async event => {
    const { incidentId, sha256 } = event.params;
    const deleted = await deleteClipForReading(getStorage().bucket(), incidentId, sha256);
    console.log(JSON.stringify({ event: "deleteClipOnConsentEnd", incidentId, deleted }));
  },
);

/**
 * deleteIncidentMediaNow (callable): command removes its incident's clips, photos and their readings at once.
 * App Check enforced. (The scheduled deleteIncidentMedia above sweeps ended judge sandboxes.)
 */
export const deleteIncidentMediaNow = onCall<{ incidentId?: unknown }>(
  { enforceAppCheck: true, region: "us-central1", maxInstances: 5 },
  request => handleDeleteMedia(getFirestore(), getStorage().bucket(), request.auth ? { uid: request.auth.uid, token: request.auth.token } : null, request.data),
);

/**
 * startJudgeSession (callable): a signed-in visitor gets their own practice incident with the command role
 * (see judgeSession.ts). App Check enforced; capped per visitor and per day.
 */
export const startJudgeSession = onCall(
  { enforceAppCheck: true, region: "us-central1", maxInstances: 5, timeoutSeconds: 120 },
  request => handleStartJudgeSession(getFirestore(), getAuth(), request.auth?.uid ?? null, Date.now()),
);

/** deleteEndedSandboxes (hourly): removes each judge sandbox, with everything under it, a day after it ends. */
export const deleteEndedSandboxesJob = onSchedule(
  { schedule: "every 60 minutes", region: "us-central1", maxInstances: 1, timeoutSeconds: 240 },
  async () => {
    const ids = await deleteEndedSandboxes(getFirestore(), Date.now());
    console.log(JSON.stringify({ event: "deleteEndedSandboxes", deleted: ids.length }));
  },
);

/**
 * cloudGuard (AI Logic beforeGenerateContent): every generateContent call through AI Logic, templated or not,
 * may name only a listed model, and a text reply is bounded. generateContentStream and the Live API do not
 * trigger it, by Google's design (docs/SECURITY.md row 12). No database or outside call; no minimum instances.
 */
// A clip read carries up to 14 MB of video as base64 in the request; with the raw body, the parsed string and a
// rewritten reply that is about 100 MB in flight, so 1 GiB holds 6 at once (concurrency above 1 needs a full CPU).
export const cloudGuard = beforeGenerateContent({ region: "us-central1", maxInstances: 10, memory: "1GiB", cpu: 1, concurrency: 6 }, event =>
  {
    const out = guardRequest(event.data.model, event.data.request as never, event.data.template);
    console.log(JSON.stringify(guardLogLine({ model: event.data.model, template: event.data.template, request: event.data.request as never }, out)));
    return out;
  });

/**
 * notifyPlanApproved (Firestore trigger on plans/{version} create): one push per team whose assignment changed, on
 * the team's topic, with no person, place or task text. Collapse key = incident; lives 2 hours.
 */
export const notifyPlanApproved = onDocumentCreated({ document: "incidents/{incidentId}/plans/{version}", region: "us-central1" },
  event => handlePlanCreated(getFirestore(), getMessaging(), event.params.incidentId, event.params.version, Date.now()).then(() => undefined));
