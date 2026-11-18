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
| 1c | Android provider | Play Integrity in the release build (`android/app/src/release/java/app/pointlastseen/family/AppCheckSetup.kt`); the debug provider exists only in debug builds. PENDING: on 2026-11-18 the release build's App Check exchange was refused ("Unable to call Play Integrity API's DecodeIntegrityToken method") until the app is linked in Play Console, so its cloud calls are refused by App Check; the debug build passes | Code; device proof to follow |
| 2 | Replay protection (limited-use tokens) | ENFORCED on AI Logic, 2026-11-18 19:09 UTC. Every client asks for limited-use tokens (row 2 note) | The local full control: a token used twice gets 200, then 401 |
| 3 | API key application restrictions | Browser key: our two hosting origins plus local dev and test ports (2026-11-18 19:33 UTC). Android key: package `app.pointlastseen.family` with the release and debug signing certificates (19:36 UTC). iOS key: bundle ID `app.pointlastseen.field`, the only target that calls Firebase (19:39 UTC) | The keyless call without a Referer answers 403 `API_KEY_HTTP_REFERRER_BLOCKED` |
| 4 | API key API allowlist | All three keys keep Firebase's own 27-API list, which includes `firebasevertexai.googleapis.com`. DECIDED-NO on narrowing it: the SDKs call several of those APIs (installations, Remote Config, App Check, Auth), the keys are not secrets, and App Check plus the security rules guard every call | Google Cloud console, Credentials |
| 5 | Authenticated-users mode | ON, 2026-11-18 19:30 UTC: a call with an App Check token but no Firebase Auth ID token is refused with 401. Every client signs in (anonymously) before any call that can reach the cloud | A call with App Check and no sign-in is refused |
| 6 | Server prompt templates | Not used yet. The camera clip read is the first candidate (planned). Every cloud call is listed below | The table below |
| 6a | Template variables and guardrails | No templates yet. Today every cloud reply must match a closed schema, phone numbers are removed before any prompt, and a person confirms each suggestion before it is used | Code (each surface's prompt builder) |
| 7 | Template-only mode | DECIDED-NO. The apps use hybrid inference: one model object tries the on-device model and falls back to the cloud with the prompt it holds. In the web SDK (firebase/ai 3.1.0), `getGenerativeModel(ai, ModelParams \| HybridParams)` takes hybrid parameters and `getTemplateGenerativeModel(ai, requestOptions?)` does not, so a template call is cloud-only. Template-only mode would refuse every hybrid fallback. The iOS report read cannot be a template either: it runs through the Foundation Models adapter (`geminiLanguageModel`), which builds its own streaming request with tools (`streamGenerateContent`, in the Firebase iOS SDK's GeminiLanguageModel package) | `node_modules/@firebase/ai/dist/ai-public.d.ts` |
| 8 | AI Monitoring | ON: telemetry `ALL`, sampling 1.0 (read back 2026-11-18). Prompts and answers are kept out of the project's logs by a log exclusion | Firebase console, AI Logic, Monitoring |
| 9 | Per-user rate limit | 20 generate requests per user per minute in every region, set and read back 2026-11-18 (default 100). Reason, an ESTIMATE from the call table below: every web cloud call follows one click, an iOS report makes about 2 calls and an Android note or clip 1, so no seat makes more than about 10 a minute; 20 is twice that. A signed-in call still answers after the change | Google Cloud console, Quotas |
| 10 | Project quotas reviewed | Read 2026-11-18, no change needed for a judge surge. AI Logic: generate 20 per user per minute (row 9); Live API 100 (unused). App Check: token exchange 200 per user per minute, 20,000 per minute and 4,000,000 per day per project; replay checks 30,000 per minute. Firestore: 50,000 free reads and 20,000 free writes a day, then billed. Cloud Run: 100 instances per project; our functions are capped at 5 or 1. Cost: each limited-use token is a fresh attestation, so every web cloud call takes one reCAPTCHA Enterprise assessment; the free allowance is 10,000 a month, then $8 flat up to 100,000 (pricing page read 2026-11-18). The project belongs to no organization, so whether it shares that allowance with another project is NOT VERIFIED | Google Cloud console, Quotas |
| 11 | Budget alerts and spend cap | Read back 2026-11-18 on the billing account: a $25 Firebase spend cap on 23 services (alerts at 50, 80 and 100%) and a $25 budget on all of this project's services (alerts at 50, 90 and 100%) | Billing console |
| 12 | Before and after generateContent triggers | ON for before-generate only: function `cloudGuard` (us-central1), deployed 2026-11-18 22:57 UTC from ebd96a9, no minimum instances. Every `generateContent` call through AI Logic, templated or not, must name a model on `shared/constants/models.json`; any other model is refused (the trigger answers permission-denied and the AI Logic proxy returns HTTP 500 to the app). It keeps only the generation settings our apps use and bounds output at 2,048 tokens (4,096 on the speech model). One exception, measured live: the proxy took a rewritten 11.3 MB request (HTTP 200) and failed on a rewritten 15.8 MB one (HTTP 500), so a request with more than 9,000,000 base64 characters of inline media is never rewritten; it passes only if its own settings already comply, with a token limit within the cap or none (template calls arrive with none; each template sets its own, and whether the proxy applies it after the trigger is not verified), and is refused otherwise. Not covered, by Google's design: "Requests to generateContentStream will not trigger these functions." and "Requests to the Gemini Live API will not trigger these functions." (https://firebase.google.com/docs/ai-logic/pre-and-post-request-scripts, Limitations and behaviors). Our iOS report read streams (`streamGenerateContent`), so the allow-list does not apply to it; it stays bounded by App Check, 20 calls a minute per user (row 9) and the $25 cap (row 11). Added latency: median 86 ms over 10 warm calls (925 ms against 839 ms before the trigger). No after-generate trigger. | `firebase functions:list` shows cloudGuard. A call naming `gemini-3.8-flash` is refused. Cloud Logging for the `cloudguard` service has one line per call (path, setting names, media size in MB; never content). Tests: `functions/test/cloudGuard.test.ts` |
| 13 | Model Armor | DECIDED-NO. Every client uses the Gemini Developer API backend (web `GoogleAIBackend`, iOS `.googleAI()`, Android `GenerativeBackend.googleAI()`); Model Armor applies only to the Vertex AI backend | Code |
| 14 | App Check on Firestore, Storage and functions | Firestore and Storage: not enforced yet (read back 2026-11-18). PLAN: enforce once the iPhone and Android release builds pass App Check, no later than 2026-11-25. Functions: all three client-callable functions, `joinIncident`, `deleteIncidentMediaNow` and `startJudgeSession`, have `enforceAppCheck: true`; `deleteIncidentMedia` and `deleteEndedSandboxesJob` (scheduled) and `deleteClipOnConsentEnd` (a Firestore trigger) cannot be called by clients | `functions/src/index.ts` |

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
