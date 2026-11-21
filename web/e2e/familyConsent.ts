// A family member's consent for the drill's photos, made the way the family app makes it, so the live photo
// specs exercise the consented cloud read. Node-side, over the public REST APIs: an anonymous sign-up, the
// registered App Check debug token exchanged for a token, joinIncident as family with the drill's family code,
// then the photoConsents/{sha256} record for the photo under test (named by the photo's own hash, at the
// server's time).
// The debug token and the code come from the environment (PLS_APPCHECK_DEBUG_TOKEN, PLS_SMOKE_FAMILY_CODE) and
// are never logged. The web config is the public one in the repo's gitignored .env.local.

import { readFileSync } from "node:fs";
import { refuseJudgeSeed } from "./fixtures";

type WebConfig = { apiKey: string; projectId: string; appId: string; bucket: string };

function webConfig(): WebConfig {
  const text = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  const get = (k: string) => {
    const m = new RegExp(`^${k}=(.*)$`, "m").exec(text);
    const v = m?.[1]?.trim().replace(/^"|"$/g, "");
    if (!v) throw new Error(`${k} is missing from .env.local`);
    return v;
  };
  return { apiKey: get("VITE_FIREBASE_API_KEY"), projectId: get("VITE_FIREBASE_PROJECT_ID"), appId: get("VITE_FIREBASE_APP_ID"), bucket: get("VITE_FIREBASE_STORAGE_BUCKET") };
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required for the family consent fixture`);
  return v;
}

/** The browser key is restricted to the hosting origins, so every call names the deployed site as its referrer. */
function referer(): string {
  const base = process.env["BASE_URL"];
  if (!base) throw new Error("The family consent fixture runs against the deployed site: set BASE_URL");
  return new URL("/", base).toString();
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", referer: referer(), ...headers }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // Only the status and the API's own error status are reported, never a request body.
  if (!res.ok) throw new Error(`${new URL(url).pathname}: HTTP ${res.status} ${JSON.stringify((json["error"] as { status?: unknown } | undefined)?.status ?? "")}`);
  return json;
}

type FamilySession = { idToken: string; uid: string; appCheck: string };

async function familySession(cfg: WebConfig, incidentId: string): Promise<FamilySession> {
  const key = encodeURIComponent(cfg.apiKey);
  const signUp = await post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, { returnSecureToken: true });
  const projectNumber = cfg.appId.split(":")[1];
  const exchange = await post(`https://firebaseappcheck.googleapis.com/v1/projects/${projectNumber}/apps/${cfg.appId}:exchangeDebugToken?key=${key}`, { debugToken: required("PLS_APPCHECK_DEBUG_TOKEN") });
  const appCheck = String(exchange["token"]);
  await post(
    `https://us-central1-${cfg.projectId}.cloudfunctions.net/joinIncident`,
    { data: { incidentId, joinCode: required("PLS_SMOKE_FAMILY_CODE"), role: "family" } },
    { authorization: `Bearer ${String(signUp["idToken"])}`, "x-firebase-appcheck": appCheck },
  );
  // The join set the family claims; a refreshed ID token carries them.
  const refreshed = await post(`https://securetoken.googleapis.com/v1/token?key=${key}`, { grant_type: "refresh_token", refresh_token: String(signUp["refreshToken"]) });
  return { idToken: String(refreshed["id_token"]), uid: String(signUp["localId"]), appCheck };
}

/** The family's cloud consent for one photo of the incident, named by its own hash, as the family app gives it. */
export async function familyConsentToPhoto(incidentId: string, sha: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error("familyConsentToPhoto needs the photo's SHA-256");
  refuseJudgeSeed(incidentId);
  const cfg = webConfig();
  const s = await familySession(cfg, incidentId);
  const base = `projects/${cfg.projectId}/databases/(default)/documents`;
  {
    const res = await fetch(`https://firestore.googleapis.com/v1/${base}:commit`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${s.idToken}`, "x-firebase-appcheck": s.appCheck, referer: referer() },
      body: JSON.stringify({
        writes: [{
          update: {
            name: `${base}/incidents/${incidentId}/photoConsents/${sha}`,
            fields: {
              storagePath: { stringValue: `photos/${incidentId}/${sha}.jpg` },
              cloudProcessing: { mapValue: { fields: { byUid: { stringValue: s.uid }, atMs: { integerValue: String(Date.now()) } } } },
              createdByUid: { stringValue: s.uid },
            },
          },
          updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
          currentDocument: { exists: false },
        }],
      }),
    });
    // A consent already given for this photo (an earlier run) is kept as it is.
    if (!res.ok && res.status !== 409) throw new Error(`photoConsents write: HTTP ${res.status}`);
  }
}

/** A fresh family member of the incident, joined the way the family app joins (for removal checks). */
export type FamilyMember = { uid: string; idToken: string; appCheck: string };

export async function freshFamilyMember(incidentId: string): Promise<FamilyMember> {
  refuseJudgeSeed(incidentId);
  const s = await familySession(webConfig(), incidentId);
  return { uid: s.uid, idToken: s.idToken, appCheck: s.appCheck };
}

/** The HTTP status of the member reading the incident doc now (200 while a member, 403 once removed). */
export async function incidentReadStatus(m: FamilyMember, incidentId: string): Promise<number> {
  const cfg = webConfig();
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/incidents/${incidentId}`, {
    headers: { authorization: `Bearer ${m.idToken}`, "x-firebase-appcheck": m.appCheck, referer: referer() },
  });
  return res.status;
}

/** The HTTP status of the same account joining the incident again as family (refused once removed). */
export async function rejoinStatus(m: FamilyMember, incidentId: string): Promise<number> {
  const cfg = webConfig();
  const res = await fetch(`https://us-central1-${cfg.projectId}.cloudfunctions.net/joinIncident`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${m.idToken}`, "x-firebase-appcheck": m.appCheck, referer: referer() },
    body: JSON.stringify({ data: { incidentId, joinCode: required("PLS_SMOKE_FAMILY_CODE"), role: "family" } }),
  });
  return res.status;
}
