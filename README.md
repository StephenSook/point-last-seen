# Point Last Seen

A search-planning aid for search and rescue training drills, for a person with dementia who has walked away.

**Judges: open https://buildhybridai-2026-yg3m.web.app/judge.** It needs no account and no key. From there you can
start a practice search of your own (a copy of the development drill on a real park grid, open for 24 hours), see
which cloud model the command post is using, and check whether this laptop's own built-in model is ready. The page
also replays the development drill's published run (Piedmont Park, Atlanta: test family reports and plans,
2026-11-18 to 19).

## What it does

Searchers send field reports from places with no signal. Their own phone reads each report with an on-device model
and redraws the probability shading of their segments. When a connection returns, the command post merges every
report and drafts new assignments, and a person at command approves every assignment change. The family shares a
profile, notes, photos and camera clips from their own app, and decides which of them may be read in the cloud.

## What ships, and how to try it

| Platform | Who uses it | How a judge tries it |
|---|---|---|
| Web command post | Search command | https://buildhybridai-2026-yg3m.web.app (start at `/judge` for a practice search) |
| iPhone searcher app | Searchers in the field | TestFlight once Apple clears review (no public link yet); its recorded on-device and cloud runs are in [docs/evidence/ios](docs/evidence/ios) |
| Android family app | The missing person's family | The signed APK on the [latest judge release](https://github.com/StephenSook/point-last-seen/releases/latest), with its SHA-256 file (on 2026-11-21, `point-last-seen-family-0c9766ea.apk` in android-judge-2) |

Which model paths ran on which hardware, and which have not run yet: [docs/TEST-MATRIX.md](docs/TEST-MATRIX.md).

Also available on the command post (from its extras menu). Whether the drill used each one is filled in after the
drill's debrief; the limits are in [docs/LIMITS.md](docs/LIMITS.md#command-post-extras).

- ICS 204-shaped assignment sheet (layout follows FEMA ICS Form 204 v3.1; not an official form)
- GeoJSON export of segments and assignments (RFC 7946)
- Radio cards and a match code check
- The sheet and radio cards can print the names the person answers to and the approach notes (one box, off by
  default)
- Replay of the event log over time, from the current prior onward
- Terrain display layer (USGS 3DEP; display only; the prior has no elevation term), for the Kennesaw drill grid only

## How the models are called

- Cloud reads use Gemini through Firebase AI Logic, with App Check and a signed-in user on every call. Four calls
  use server prompt templates; `docs/SECURITY.md` lists every call.
- On-device reads on the web and on Android use Firebase AI Logic's hybrid inference (the browser's or the phone's
  own model, with the cloud as the fallback where a call allows it).
- On iPhone, on-device reads use Apple Foundation Models (`SystemLanguageModel`), the on-device option for iOS, and
  cloud reads use Gemini through Firebase AI Logic in the same session.
  The iPhone's cloud route needs iOS 27; on iOS 26 it reads on the device, then by rules.
  This follows Firebase iOS SDK 13.0.0, which removed the SDK's own `SystemLanguageModel` and `HybridModel` and says to
  use `ai.geminiLanguageModel(name:)` directly with Apple's Foundation Models framework (`FirebaseAI/CHANGELOG.md`,
  lines 69 to 74 at tag 13.2.0, the version this app pins); `ios/PLS/AI/ModelSessionFactory.swift` does exactly that.
- When no model reads a note or report, nothing is sent. The web receipt says "No model was asked: fixed wording
  from code." and "Sent: nothing.", the iPhone reads the report with fixed rules and marks it "Read by the phone's
  rules. No model.", and the web and Android forms ask for the fields by hand.
- Speech: the iPhone app speaks an assignment change in a cloud voice from Firebase AI Logic and falls back to the
  phone's own system voice. No app calls a speech recognizer, and the repository's rules gate refuses one on every
  platform. A searcher can dictate a report with the iPhone keyboard's microphone key, which gives the app typed text.

Status: built for #BuildHybridAI 2026. Training drill use only: every drill uses made-up data, and nobody in any drill
is missing.

## How we built it

- AI, all through Firebase AI Logic: on the web, the Firebase JS SDK's hybrid inference (the laptop's built-in model
  in Chrome for the note, photo and clip-frame reads; on-device first, then Gemini in the cloud, for plan wording); on
  iPhone, Apple's Foundation Models on the device and Gemini in the cloud; on Android, Firebase AI Logic's on-device
  and cloud models. Four server prompt templates, all locked, and `cloudGuard`, a blocking function that allows only
  the listed models and bounds each reply.
- Firebase: App Check (reCAPTCHA Enterprise on the web, App Attest on iPhone, Play Integrity on Android), enforced on
  AI Logic, Firestore and Storage; anonymous Auth with custom claims; Firestore and Cloud Storage behind security
  rules; Cloud Functions (joining, judge sandboxes, media deletion, drill retention, push notices); Remote Config;
  Cloud Messaging; Hosting; Crashlytics and Performance on iPhone and Android, and Analytics on Android.
- Apps: the web command post in React and Vite, offline with vite-plugin-pwa, with MapLibre GL maps on PMTiles
  basemaps from OpenStreetMap data; the iPhone app in SwiftUI with MapLibre Native, Live Activities (ActivityKit),
  App Intents and swift-crypto; the Android family app in Kotlin with Jetpack Compose (Material 3).
- One search engine in TypeScript (`shared/engine-ts`, with Turf.js and @noble/hashes), ported to Swift for the
  iPhone (`ios/PLSCore`). The Android app ports the shared rules it needs (evidence screen, ids, language, phone
  numbers). Shared JSON test vectors keep every port in step.
- Data: ISRID lost-person statistics for the starting map and the linear-feature layer, and real park grids
  (Piedmont Park, Kennesaw Mountain) built by `tools/grid-builder`.
- Checks: Vitest, Playwright with axe-core, pytest, the Firebase Emulator Suite, Swift Testing, JUnit and Compose UI
  tests, GitHub Actions, Socket dependency scanning and gitleaks.
- Built with Claude Code across parallel sessions; OpenAI Codex reviewed pull requests.

## Layout

- `shared/`: schemas, constants, test vectors, the TypeScript engine, server prompt templates and the site grids
- `tools/`: the vector generator, the grid builder, the drill seed tools and the public-run exporter
- `functions/`: Cloud Functions, with Firestore and Storage security rules at the root
- `ios/`: the searcher app and its Swift engine package
- `web/`: the command post
- `android/`: the family app
- `scripts/`: local and CI gates, and the live probes
- `docs/`: security, limits, the production checklist and the evidence behind each claim

## Run it yourself

The live site is the way to try it: `/judge` needs no account, no key and no setup. Running the apps yourself needs
your own Firebase project (below). Running the checks needs none.

### The checks, from a clean checkout

You need Node 22 or 24 (CI runs every check on 22, and the engine, the tools, the web app and the functions typecheck
on 24 too; on 22, `npm ci` warns that the Firebase web SDK asks for Node 24.12), Python 3.12 or later (CI's version is 3.12), Java 21 or later (Firebase emulators and Android; JDK 25 works), the Firebase CLI 15 and
gitleaks 8. For iOS: Xcode 27 and XcodeGen 2.45. For Android: the Android SDK.

```bash
npm ci
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
bash scripts/ci-local.sh          # every check CI runs; add --gates, --ts, --rules, --web, --ios or --android for one
```

`ci-local.sh` exits 0 when every check ran and passed, 1 when one failed, and 2 when a tool is missing: it says
which checks did not run and never reports that case as a pass.

### With your own Firebase project

Pass your project id to the Firebase CLI with `--project`. The publish scripts name this project
(`buildhybridai-2026-yg3m`) in their `PROJECT` line; change it to yours first.

1. Create a Firebase project on the Blaze plan (Cloud Functions and Firebase AI Logic need it).
2. In Authentication, turn on Anonymous sign-in.
3. Create a Cloud Firestore database (Native mode) and a Cloud Storage bucket.
4. In Firebase AI Logic, turn on the Gemini Developer API.
5. Register the apps: a web app, the Android app (`app.pointlastseen.family`) and the iOS app. Put the web app's
   config in `.env` at the repository root (copy `.env.example`), `google-services.json` in `android/app`, and
   `GoogleService-Info.plist` beside the iOS app.
6. In App Check, give the web app a reCAPTCHA Enterprise key, the Android app Play Integrity and the iOS app App
   Attest. Debug builds use App Check debug tokens: register one per device or browser.
7. Deploy the rules, indexes and functions: `firebase deploy --only firestore,storage,functions --project <id>`.
8. Publish the server prompt templates and Remote Config: `python3 -I scripts/template_publish.py --publish` and
   `python3 -I scripts/rc_publish.py --publish` (each is a dry run without `--publish`).
9. Seed a drill: `python3 -I tools/seed/seed_drill.py <id> <incidentId> "<name>" T1 T2` (its join codes go to the
   macOS Keychain, never to the screen), then its segments: `npm run build-grid -w tools/grid-builder` (see
   `shared/grid/README.md`) and `python3 -I tools/seed/seed_segments.py <id> <incidentId> <segments.json>
   --prior-version 1`. A reseed over an existing grid needs a higher `--prior-version`, and the practice seed
   (`shared/constants/judge-seed.json`) is not reseeded from 2026-11-30 to 2026-12-17, while judging is open, unless
   `--i-know-judging-is-open` is passed.
10. Run the apps:
    - Web: `npm run dev -w web`. The reCAPTCHA key accepts only the hosting origins, so a local browser needs an
      App Check debug token (`self.FIREBASE_APPCHECK_DEBUG_TOKEN`).
    - iPhone: `xcodegen generate --spec ios/project.yml`, then open the generated project in Xcode.
    - Android: `cd android && ./gradlew assembleDebug`.

Firebase config files, `.env` and App Check debug tokens are never committed.

## License

Apache-2.0. See `LICENSE` and `NOTICE`. The drill-site map data in `shared/grid/` is from OpenStreetMap and is
ODbL, not Apache-2.0; `NOTICE` and `shared/grid/README.md` say how it is licensed.
