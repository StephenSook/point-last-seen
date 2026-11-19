# Point Last Seen

A search-planning aid for search and rescue training drills, for a person with dementia who has walked away.

**Judges: open https://buildhybridai-2026-yg3m.web.app/judge.** It needs no account and no key. From there you can
start a practice search of your own (a copy of the development drill on a real park grid, open for 24 hours) and
check which on-device and cloud models the command post is using. The replay of the published drill run appears there
after the drill.

## What it does

Searchers send field reports from places with no signal. Their own phone reads each report with an on-device model
and redraws the probability shading of their segments. When a connection returns, the command post merges every
report and drafts new assignments, and a person at command approves every assignment change. The family shares a
profile, notes, photos and camera clips from their own app, and decides which of them may be read in the cloud.

## What ships, and how to try it

| Platform | Who uses it | How a judge tries it |
|---|---|---|
| Web command post | Search command | https://buildhybridai-2026-yg3m.web.app (start at `/judge` for a practice search) |
| iPhone searcher app | Searchers in the field | TestFlight, once the public build exists |
| Android family app | The missing person's family | Signed APK as a GitHub release asset |

## How the models are called

- Cloud reads use Gemini through Firebase AI Logic, with App Check and a signed-in user on every call. Three calls
  use server prompt templates; `docs/SECURITY.md` lists every call.
- On-device reads on the web and on Android use Firebase AI Logic's hybrid inference (the browser's or the phone's
  own model, with the cloud as the fallback where a call allows it).
- On iPhone, on-device reads use Apple Foundation Models (`SystemLanguageModel`), the on-device option for iOS, and
  cloud reads use Gemini through Firebase AI Logic in the same session.

Status: in development for #BuildHybridAI 2026. Training drill use only: nobody in any drill is missing.

## Layout

- `shared/`: schemas, constants, test vectors, the TypeScript engine, server prompt templates and the site grids
- `tools/`: the vector generator, the grid builder, the drill seed tools and the public-run exporter
- `functions/`: Cloud Functions, with Firestore and Storage security rules at the root
- `ios/`: the searcher app and its Swift engine package
- `web/`: the command post
- `android/`: the family app
- `scripts/`: local and CI gates, and the live probes
- `docs/`: security, limits, the production checklist and the evidence behind each claim

## Setup from a clean checkout

You need Node 22, Python 3.12, Java 21 (for the Firebase emulators and Android), the Firebase CLI, Xcode with
XcodeGen for iOS, and the Android SDK for Android.

```bash
npm ci
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
bash scripts/ci-local.sh          # every check CI runs, including the rules tests in the emulators
```

- Web: copy `.env.example` to `.env` at the repository root and fill in a Firebase web app's config, then
  `npm run dev -w web`. The App Check site key accepts only the two hosting origins, so a local session needs an
  App Check debug token (`self.FIREBASE_APPCHECK_DEBUG_TOKEN`) registered on the web app.
- iPhone: `xcodegen generate --spec ios/project.yml`, add your app's `GoogleService-Info.plist`, then open the
  generated project in Xcode. The Swift engine's tests run with `swift test --package-path ios/PLSCore`.
- Android: add your app's `google-services.json` to `android/app` to build with Firebase, then
  `cd android && ./gradlew assembleDebug`. Unit tests run with `./gradlew testDebugUnitTest`.
- Firebase config files, `.env` and App Check debug tokens are never committed.

## License

Apache-2.0. See `LICENSE` and `NOTICE`. The drill-site map data in `shared/grid/` is from OpenStreetMap and is
ODbL, not Apache-2.0; `NOTICE` and `shared/grid/README.md` say how it is licensed.
