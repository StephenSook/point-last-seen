# Security

How Point Last Seen protects its Firebase AI Logic calls and its data, row by row against Firebase's AI Logic
security checklist (https://firebase.google.com/docs/ai-logic/security-checklist, updated 2026-11-16). Each row
gives the state we read back from the live project `buildhybridai-2026-yg3m`, the date, and how you can check
it. Read-backs were made on 2026-11-18 (UTC) through the Firebase and Google Cloud APIs unless a row says
otherwise.

## Check it yourself

You need no account and none of our keys. The web app's public Firebase config holds the browser API key.

```sh
KEY=$(curl -s https://buildhybridai-2026-yg3m.web.app/__/firebase/init.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["apiKey"])')
curl -s -X POST "https://firebasevertexai.googleapis.com/v1beta/projects/buildhybridai-2026-yg3m/models/gemini-3.5-flash-lite:generateContent" \
  -H "Content-Type: application/json" -H "x-goog-api-key: $KEY" -H "Referer: https://buildhybridai-2026-yg3m.web.app/" \
  -d '{"contents":[{"role":"user","parts":[{"text":"ok"}]}]}'
```

1. With the site's Referer, the model refuses the call: HTTP 401, `UNAUTHENTICATED`,
   `"Firebase App Check token is invalid."` A call needs an App Check token from one of our apps.
2. Without the `Referer` line, the key itself refuses: HTTP 403, `PERMISSION_DENIED`, reason
   `API_KEY_HTTP_REFERRER_BLOCKED`. The browser key works only from our sites.
3. The daily probe (`.github/workflows/probe.yml`, 13:23 UTC) runs the first check with
   `scripts/appcheck_control.py --no-token-only` and fails loudly if the answer changes. Its runs are on the
   repository's Actions page.

Both answers were read on 2026-11-18. Our local full control (`scripts/appcheck_control.py`, with a debug
token from the macOS Keychain) also shows that a fresh limited-use token gets a real answer and the same token
used again is refused: `docs/evidence/appcheck-control/2026-11-18T19-16-53+00-00.json`.

## The checklist, row by row

| # | Item | State (read back) | How to check |
|---|---|---|---|
| 1 | App Check enforced for AI Logic | ENFORCED on `firebaseml.googleapis.com` since 2026-11-17 18:32 UTC; read back 2026-11-18 | The keyless call above answers 401 "Firebase App Check token is invalid." |
| 1a | Web provider | reCAPTCHA Enterprise (`web/src/firebase.ts`, `ReCaptchaEnterpriseProvider`) | Code |
| 1b | Apple provider | App Attest (`ios/PLS/App/PLSApp.swift`, `AppAttestProvider`). PENDING: proof on a physical iPhone | Code; device proof to follow |
| 1c | Android provider | Play Integrity in the release build (`android/app/src/release/java/app/pointlastseen/family/AppCheckSetup.kt`); the debug provider exists only in debug builds. PENDING: proof for a sideloaded release APK | Code; device proof to follow |
| 2 | Replay protection (limited-use tokens) | ENFORCED on AI Logic, 2026-11-18 19:09 UTC. Every client asks for limited-use tokens (row 2 note) | The local full control: a token used twice gets 200, then 401 |
| 3 | API key application restrictions | Browser key: our two hosting origins plus local dev and test ports (2026-11-18 19:33 UTC). Android key: package `app.pointlastseen.family` with the release and debug signing certificates (19:36 UTC). iOS key: PENDING (bundle IDs) | The keyless call without a Referer answers 403 `API_KEY_HTTP_REFERRER_BLOCKED` |
| 4 | API key API allowlist | All three keys keep Firebase's own 27-API list, which includes `firebasevertexai.googleapis.com`. DECIDED-NO on narrowing it: the SDKs call several of those APIs (installations, Remote Config, App Check, Auth), the keys are not secrets, and App Check plus the security rules guard every call | Google Cloud console, Credentials |
| 5 | Authenticated-users mode | ON, 2026-11-18 19:30 UTC: a call with an App Check token but no Firebase Auth ID token is refused with 401. Every client signs in (anonymously) before any call that can reach the cloud | A call with App Check and no sign-in is refused |
| 6 | Server prompt templates | Not used yet. The camera clip read is the first candidate (planned). Every cloud call is listed below | The table below |
| 6a | Template variables and guardrails | No templates yet. Today every cloud reply must match a closed schema, phone numbers are removed before any prompt, and a person confirms each suggestion before it is used | Code (each surface's prompt builder) |
| 7 | Template-only mode | DECIDED-NO. The apps use hybrid inference: one model object tries the on-device model and falls back to the cloud with the prompt it holds. In the web SDK (firebase/ai 3.1.0), `getGenerativeModel(ai, ModelParams \| HybridParams)` takes hybrid parameters and `getTemplateGenerativeModel(ai, requestOptions?)` does not, so a template call is cloud-only. Template-only mode would refuse every hybrid fallback | `node_modules/@firebase/ai/dist/ai-public.d.ts` |
| 8 | AI Monitoring | ON: telemetry `ALL`, sampling 1.0 (read back 2026-11-18). Prompts and answers are kept out of the project's logs by a log exclusion | Firebase console, AI Logic, Monitoring |
| 9 | Per-user rate limit | Still the default, 100 generate requests per user per minute in each of 39 region buckets (read back 2026-11-18). PENDING: lower it to 20 (no seat makes more than about 10 calls a minute; ESTIMATE from the call table below) | Google Cloud console, Quotas |
| 10 | Project quotas reviewed | Read 2026-11-18: generate and Live API requests per user per minute 100 per region; template reads 100 and writes 10 per minute per region; config reads 100 and writes 10 per minute | Google Cloud console, Quotas |
| 11 | Budget alerts and spend cap | The account owner set a $25 budget for Gemini spend. NOT VERIFIED here: budgets live on the billing account, outside this project's API access. PENDING: a read-back by the account owner | Billing console |
| 12 | Before and after generateContent triggers | PENDING decision: a before-call budget guard is planned | This file, when decided |
| 13 | Model Armor | DECIDED-NO. Every client uses the Gemini Developer API backend (web `GoogleAIBackend`, iOS `.googleAI()`, Android `GenerativeBackend.googleAI()`); Model Armor applies only to the Vertex AI backend | Code |
| 14 | App Check on Firestore, Storage and functions | Firestore and Storage: not enforced yet (read back 2026-11-18). PLAN: enforce once the iPhone and Android release builds pass App Check, no later than 2026-11-25. Functions: the only client-callable function, `joinIncident`, has `enforceAppCheck: true`; `deleteIncidentMedia` (scheduled) and `deleteClipOnConsentEnd` (a Firestore trigger) cannot be called by clients | `functions/src/index.ts` |

Row 2 note: the Remote Config key `use_limited_use_tokens` (published value `true`) turns limited-use tokens on
for the web (`aiClient(app, rc.useLimitedUseTokens)`, `web/src/ai/client.ts`), iOS
(`FirebaseAI.firebaseAI(backend: .googleAI(), useLimitedUseAppCheckTokens:)`, `ios/PLS/AI/AIClient.swift`) and
Android (`useLimitedUseAppCheckTokens = rc().useLimitedUseTokens`, `android/.../ai/AiClient.kt`). With replay
protection enforced, setting it to `false` would make every cloud call fail.

## Every cloud model call

Each call goes through Firebase AI Logic with an App Check token and a Firebase Auth ID token. None is
templated today (row 6).

| Surface | What it reads | Mode | Starts when |
|---|---|---|---|
| Web command post | Suggested wording for a changed plan | Prefer cloud, on-device fallback | Command clicks Suggest |
| Web command post | A typed or pasted sighting note | Cloud only, after the on-device read | Command asks for the cloud read |
| Web command post | One photo from the tray | Cloud only, after the on-device read | Command asks for the cloud read, with the sender's consent recorded |
| iOS searcher app | A spoken or typed field report | On-device first; cloud by the read router (`ios/PLS/AI/ModelSessionFactory.swift`) | The searcher sends a report |
| Android family app | A family note | Hybrid, from Remote Config `kill_cloud` and the caller's route | The family sends a note |
| Android family app | A camera clip | Cloud only, after the consent record is written | The family shares a clip |

## Data and media

The security rules, media retention and other limits are in `docs/LIMITS.md`. The daily probe also reads the
public `ops/storage` record (`scripts/media_probe.py`) to check that drill media still expires.
