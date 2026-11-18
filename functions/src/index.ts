import { getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { handleJoin, type JoinRequest } from "./join.js";
import { deleteEndedSandboxMedia, recordStorageHealth } from "./media.js";

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
    const r = await deleteEndedSandboxMedia(db, bucket, Date.now());
    await recordStorageHealth(db, bucket, r.failed.length);
    console.log(JSON.stringify({ event: "deleteIncidentMedia", incidents: r.incidents, files: r.files, failed: r.failed.length }));
  },
);
