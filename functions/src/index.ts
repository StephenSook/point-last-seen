import { getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { handleJoin, type JoinRequest } from "./join.js";
import { deleteEndedSandboxMedia } from "./media.js";

if (getApps().length === 0) initializeApp();

/** joinIncident (callable): checks the join code and sets custom claims { inc, role, team }. App Check enforced. */
export const joinIncident = onCall<JoinRequest>(
  { enforceAppCheck: true, region: "us-central1", maxInstances: 5 },
  request => handleJoin(request.auth?.uid ?? null, request.data),
);

/** deleteIncidentMedia (scheduled every 15 minutes): deletes an ended judge sandbox's clips, photos and packs. */
export const deleteIncidentMedia = onSchedule(
  { schedule: "every 15 minutes", region: "us-central1", maxInstances: 1, timeoutSeconds: 300 },
  async () => {
    const r = await deleteEndedSandboxMedia(getFirestore(), getStorage().bucket(), Date.now());
    console.log(JSON.stringify({ event: "deleteIncidentMedia", incidents: r.incidents, files: r.files }));
  },
);
