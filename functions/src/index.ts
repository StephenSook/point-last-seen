import { getApps, initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";
import { handleJoin, type JoinRequest } from "./join.js";

if (getApps().length === 0) initializeApp();

/** joinIncident (callable): checks the join code and sets custom claims { inc, role, team }. App Check enforced. */
export const joinIncident = onCall<JoinRequest>(
  { enforceAppCheck: true, region: "us-central1", maxInstances: 5 },
  request => handleJoin(request.auth?.uid ?? null, request.data),
);
