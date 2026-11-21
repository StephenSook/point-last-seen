import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { beforeGenerateContent } from "firebase-functions/v2/ai";
import { onCall } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onObjectDeleted } from "firebase-functions/v2/storage";
import { handleDeleteMyAccount } from "./account.js";
import { handleRotateJoinCode } from "./codes.js";
import { guardLogLine, guardRequest } from "./cloudGuard.js";
import { handleJoin, type JoinRequest } from "./join.js";
import { deleteEndedSandboxes, handleStartJudgeSession, JUDGE_SESSION_TIMEOUT_S } from "./judgeSession.js";
import { deleteClipForReading, deletePhotoConsentForObject, handleDeleteMedia, runMediaSweep } from "./media.js";
import { handleRemoveMember } from "./members.js";
import { handleFamilyQuestion, handlePlanCreated, handleSearchState } from "./notify.js";
import { deleteEndedDrills, recordDrillClosed } from "./retention.js";

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
  request => handleDeleteMedia(getFirestore(), getAuth(), getStorage().bucket(), request.auth ? { uid: request.auth.uid, token: request.auth.token } : null, request.data),
);

/**
 * removeMember (callable): command removes a searcher or family member of its own incident (members.ts): the removal
 * is recorded first, so the security rules refuse that account at once, then its claims are cleared and its refresh
 * tokens revoked. App Check enforced.
 */
export const removeMember = onCall<{ incidentId?: unknown; uid?: unknown }>(
  { enforceAppCheck: true, region: "us-central1", maxInstances: 5 },
  request => handleRemoveMember(getFirestore(), getAuth(), request.auth ? { uid: request.auth.uid, token: request.auth.token } : null, request.data),
);

/**
 * deleteMyAccount (callable): the caller deletes its own sign-in (account.ts), for example when it leaves a search;
 * idempotent. App Check enforced.
 */
export const deleteMyAccount = onCall(
  { enforceAppCheck: true, region: "us-central1", maxInstances: 5 },
  request => handleDeleteMyAccount(getAuth(), request.auth?.uid ?? null),
);

/** Command gives its incident's searchers or family a new join code; every old code of that role stops working (codes.ts). */
export const rotateJoinCode = onCall<{ incidentId?: unknown; role?: unknown }>(
  { enforceAppCheck: true, region: "us-central1", maxInstances: 5 },
  request => handleRotateJoinCode(getFirestore(), getAuth(), request.auth ? { uid: request.auth.uid, token: request.auth.token } : null, request.data),
);

/**
 * startJudgeSession (callable): a signed-in visitor gets their own practice incident with the command role
 * (see judgeSession.ts). App Check enforced; capped per visitor and per day.
 */
export const startJudgeSession = onCall(
  { enforceAppCheck: true, region: "us-central1", maxInstances: 5, timeoutSeconds: JUDGE_SESSION_TIMEOUT_S },
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
 * deleteEndedDrills (daily): deletes each drill 30 days after the search command closed it, with its events, plans,
 * clips, photos and packs, and the anonymous sign-ins whose only incident it was (retention.ts). The development, judge
 * seed and filmed drills are kept. Counts only in the log line, never an id or a person.
 */
export const deleteEndedDrillsJob = onSchedule(
  { schedule: "every day 07:41", timeZone: "UTC", region: "us-central1", maxInstances: 1, timeoutSeconds: 540 },
  async () => {
    const r = await deleteEndedDrills(getFirestore(), getStorage().bucket(), getAuth(), Date.now());
    console.log(JSON.stringify({ event: "deleteEndedDrills", deleted: r.deleted.length, kept: r.kept.length, failed: r.failed.length, stale: r.stale.length, files: r.files, users: r.users }));
  },
);

/**
 * recordDrillClosed (Firestore trigger on incident updates): when a drill becomes closed, writes closedAt, the close
 * write's own commit time, once and only if absent (a transaction). That makes a repeated delivery harmless, so retry
 * is on: a transient failure is tried again instead of leaving the drill with no closedAt.
 */
export const recordDrillClosedTrigger = onDocumentUpdated({ document: "incidents/{incidentId}", region: "us-central1", retry: true },
  async event => {
    const after = event.data?.after;
    if (!after) return;
    await recordDrillClosed(getFirestore(), event.params.incidentId, event.data?.before.data(), after.data(), after.updateTime);
  });

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

/**
 * deletePhotoConsentOnPhotoDelete (Storage trigger): when a photo object is deleted, by command, by the media delete
 * or by the 30-day lifecycle, its cloud-read consent goes too, so a re-upload of the same bytes needs a new consent.
 */
export const deletePhotoConsentOnPhotoDelete = onObjectDeleted({ region: "us-central1", retry: true },
  event => deletePhotoConsentForObject(getFirestore(), event.data.name).then(() => undefined));

/**
 * notifyFamilyQuestion (Firestore trigger on familyQuestions/{questionId} create): one push to the incident's family
 * topic, with ids only. Never in a judge sandbox; capped per incident per day.
 */
export const notifyFamilyQuestion = onDocumentCreated({ document: "incidents/{incidentId}/familyQuestions/{questionId}", region: "us-central1" },
  async event => {
    await handleFamilyQuestion(getFirestore(), getMessaging(), event.params.incidentId, event.params.questionId, event.id, Date.now());
  });

/**
 * notifyFamilySearchState (Firestore trigger on incident updates): one push to the family when searchState becomes
 * searching or paused. Every other incident change, including its status, sends nothing.
 */
export const notifyFamilySearchState = onDocumentUpdated({ document: "incidents/{incidentId}", region: "us-central1" },
  async event => {
    await handleSearchState(getFirestore(), getMessaging(), event.params.incidentId,
      event.data?.before.data(), event.data?.after.data(), event.id, Date.now());
  });
