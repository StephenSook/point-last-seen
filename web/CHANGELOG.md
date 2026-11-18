# Changelog: web command post (lane C)

Each entry names what changed, its source (plan task or finding) and how it was verified, in commit order.

Commits before this file (gate, config, events, merge lanes, offline check, version.json, Remote Config, POA style) are listed in `git log -- web`.

## 2026-11-17

### feat(web): validate join requests and call joinIncident
- What: `joinRequest` cleans the join code (trim, upper case, no spaces or hyphens), requires 8 characters and an incident id, and sends a team only for the searcher role. `joinIncident` calls the callable and refreshes the ID token so new claims reach the rules at once.
- Source: plan Task 15 (`web/src/data/join.ts`), callable contract from Task 11.
- Verified: `src/data/join.test.ts`, 4 tests, failed first (module missing), then passed.

### feat(web): start Firebase with App Check first and an unlimited offline cache
- What: `getPls()` reads the build config, starts App Check with the reCAPTCHA Enterprise provider before any other service, opens Firestore with a persistent multi-tab cache of unlimited size, and sets up Auth and Functions (us-central1). `ensureSignedIn` signs in anonymously when there is no user.
- Source: plan Task 15 step 3, spec sections 11 and 14.
- Verified: export names read from the firebase 13.4.0 type files (`initializeAppCheck`, `ReCaptchaEnterpriseProvider`, `persistentLocalCache`, `persistentMultipleTabManager`, `CACHE_SIZE_UNLIMITED`, `signInAnonymously`); typecheck clean. Glue only, covered by the e2e smoke. Local smoke found anonymous sign-up returns 400 `CONFIGURATION_NOT_FOUND` because Authentication is not set up in the project yet (Task 0).

### feat(web): subscribe to the incident, teams, segments and phone clock offsets
- What: `subscribeIncident` keeps live views of the incident doc, the teams, each team's device docs (for `clockOffsetMs`) and the segments (geometry parsed from `geometryJson`; the reserved `ROW` segment carried as `rowPrior`, never drawn).
- Source: plan Task 15, spec section 7 data model, `clockOffsetMs` in spec 11.3.
- Verified: typecheck clean. Firestore glue, exercised by the e2e smoke once an incident can be seeded.

### feat(web): add the command post neutrals and layout from the visual system
- What: `theme/base.css` sets the spec 22.1 neutrals (bg-0 to bg-3, fg-1 to fg-4, line), change-cyan and alert-red as custom properties, visible focus, tabular numbers, the map-first three-column layout and a one-column layout under 900 px. Errors use neutral ink, because alert-red is reserved for hazards with an icon and a word.
- Source: plan Task 15 (plain UI), spec sections 22 and 22.1. The fonts and the token tests arrive with Task 39.
- Verified: hex values copied from the spec 22.1 table; build clean.

### feat(web): draw segments on a MapLibre map with percent plates and the OSM line
- What: `MapView` draws segment fills by `poaClass8` with the eight-step ramp, segment borders in the line colour, the printed percent on a bg-0 plate at each centre (HTML markers, so no remote glyph host is needed), fits the map to the segments once, and always shows the text line "Map data from OpenStreetMap". No basemap layers yet: those need the drill-site PMTiles extract from Task 10.
- Source: plan Task 15 (`web/src/map/MapView.tsx`), spec 22.1 (number on a plate, never on a fill), spec section 3 (OpenStreetMap license line).
- Verified: named exports checked in the maplibre-gl 6.19.0 type file (no default export); typecheck and build clean.

### feat(web): show merge lanes with sent and arrived times
- What: `MergeLanes` renders one lane per team from `mergeModel`: "No reports yet." while silent, and per card "sent 14:03 / arrived 14:21 (18 min without signal)", "on its way" before arrival, and "(phone clock looks wrong)" when the gap is negative or above 24 hours.
- Source: plan Task 15, spec 11.2 merge lanes.
- Verified: the lane data comes from `mergeModel` (10 unit tests); typecheck and build clean.

### feat(web): list segments by POA with the outside-the-map row
- What: `PoaRank` lists segments by POA, highest first, with tabular percents, plus a row "Outside the mapped area" for the ROW mass. Until the engine lands it lists the stored prior.
- Source: plan Task 15 (POA rank with a ROW row), spec 10.1 (ROW always carried and shown).
- Verified: typecheck and build clean.

### feat(web): add the teams rail with label-only team markers
- What: `TeamsRail` lists teams by name. Teams have no colours: the active team is fg-1 and the others fg-4, and each row carries `data-testid="team-card-<teamId>"` for the e2e tests.
- Source: plan Task 15 (teams rail), spec 22.1 ("Teams have no colours").
- Verified: typecheck and build clean.

### feat(web): wire the command post: join as command, then map, teams, POA and lanes
- What: `CommandPost` starts Firebase (or shows which build values are missing), signs in, and opens the post when the ID token already holds `inc` and role command for `?incident=`; otherwise it shows the join form. The post subscribes to the incident and its events, shows the drill line "Training drill. Nobody is missing." in the header, the map, the teams rail, the POA list and the merge lanes. Errors shown to the user are fixed plain sentences; raw error text never reaches the page. The convergence code reads "----" until the engine (Task 8) lands.
- Source: plan Task 15 step 3; rival self-audit addendum ("no raw error text reaches the DOM").
- Verified: typecheck and build clean; local smoke renders the join form with the drill line.

### feat(web): add the app entry, HTML shell and a Vite build that checks its config
- What: `index.html` (dark colour scheme, an SVG icon), `src/main.tsx` (mounts the command post), and `vite.config.ts`: the env is read from the repo root, a production build fails at once when any Firebase value or the App Check site key is missing, and the version.json plugin records `GITHUB_SHA` or `git rev-parse HEAD` plus a dirty flag. Adds `preview` and `e2e` scripts.
- Source: plan Task 15; spec section 14 ("the build fails when it is missing"); rival self-audit addendum (version.json).
- Verified: `npm run build -w web` exit 0 with the untracked env; `dist/version.json` holds the 40-character commit. The first local smoke found a 404 for `/favicon.ico` (the page had no icon) and a 400 from anonymous sign-up (`CONFIGURATION_NOT_FOUND`, Auth not yet set up); the icon fixed the first, lane A's Task 0 fixed the second, and the shell smoke then passed with zero console errors.

### test(web): add the Playwright smoke with the live-commit check
- What: `e2e/playwright.config.ts` (real Chrome, 1440 px; a local preview of `dist` unless `BASE_URL` is set), `e2e/fixtures.ts` (`withDebugToken` sets the App Check debug global from `PLS_APPCHECK_DEBUG_TOKEN`; every console error, page error and HTTP 400 or higher response is collected with its URL), and `e2e/smoke.spec.ts`: the shell shows the drill line and the join form with zero console errors; "the live site serves this commit" (version.json equals `EXPECT_COMMIT` or HEAD, and not dirty when deployed); a joined post draws the map canvas and the license line after one successful App Check exchange. That third test needs a seeded drill incident: it fails under CI when the fixture is missing and is skipped only on a local run.
- Source: plan Task 15 step 5; rival self-audit addendum (live-commit smoke).
- Verified: local run against `vite preview` with the PLS web app and the Keychain debug token: 2 passed, 1 skipped (no seeded incident; rules and joinIncident arrive with Task 11).

### docs(evidence): record spike S4 step 2 on-device photo read scores
- What: `docs/evidence/spikes/S4.json` and an S4.md section: 20 real photos at 1536 px read one per call through the gate and the SDK's ONLY_ON_DEVICE mode, scored against a prompt, schema and synonym map fixed and hashed before the run. Gemma 4 flag profile: place type 13 of 20, sign text 15 of 20, p50 1,710 ms, 0 requests (all pass lines met). Stock profile: 11 of 20, 13 of 20, p50 1,994 ms, 0 requests, and 2 replies cut off at the output limit.
- Source: plan Task 5 step 2 (gate for Task 20, cut rank X11).
- Verified: pre-registration SHA-256 checked before scoring; CDP Network recording over the whole run; every reply that ran reported on_device. Photos, their sign text and the labels file stay outside the repo; the JSON carries categories, counts and scores only.

### fix(web): keep a 16 px side gutter around the join panel on phones
- What: the join panel is `min(420px, 100% - 32px)` wide, so at 390 px it no longer touches the screen edges.
- Source: deployed still at 390 px (Task 15 step 5 "take a still and look at it"); spec layout rule (16 px side gutter at phone width).
- Verified: local preview still at 390 x 844 shows a 16 px gutter on both sides; build clean.

### chore(merge): bring main into lane-web (engine, schemas, CI jobs)
- What: merges origin/main (the TypeScript engine, shared schemas and constants, schema parity, the engine and vector CI jobs, the functions workspace) into lane-web. The root `package-lock.json` conflict was resolved by taking main's file and re-running `npm install` on the merged tree, so the lockfile holds the web, engine and functions workspaces.
- Source: plan lanes rule (lanes stay current with main); a merge instead of a rebase because pushed history is not rewritten without the orchestrator's yes.
- Verified: `scripts/ci-local.sh` on the merged tree exit 0 (rules gate 94 files, schema parity 10 schemas, engine 137 tests, vectors 124), web typecheck exit 0, web tests 68 of 68.
- Not yet in CI (2026-11-18): the web unit tests and the Playwright smoke. The joined-post e2e needs Task 11 (rules, joinIncident) and a seeded drill incident; it is added to CI in the change set that lands those, and under CI a missing join code or incident fails it, never skips it.

### chore(web): depend on the @pls/engine workspace and allow JSON imports
- What: `web/package.json` depends on `@pls/engine` 0.1.0 (the workspace, linked by npm), and `web/tsconfig.json` sets `resolveJsonModule`, because the engine imports its constants from `shared/constants/engine-params.json`.
- Source: plan Task 15 (`viewState` uses the engine), Task 8 interfaces.
- Verified: `node_modules/@pls/engine` links to `shared/engine-ts`; web typecheck exit 0.

### feat(web): recompute the map and the convergence code from the event set
- What: `viewState(prior, docs, priorInputEventIds, params, priorVersion)` runs the engine's `toEngineEvents`, `posterior` and `rankSegments`, drops ROW from the ranked list (it stays in the POA map), and hashes the distinct event ids with the prior version into `eventSetHash` and its four-character `convergenceCode`.
- Source: plan Task 15 (`viewState`), spec sections 11.2 (convergence code) and rule R2 (probability is never stored).
- Verified: `src/command/viewState.test.ts`, 6 tests on real EventDocs from `shared/test-vectors/search.json`: the same code for any arrival order, a code that changes with the prior version, exactly the engine's filtered events applied, ROW kept out of the rank, prior inputs ignored, duplicates counted once. Failed first (module missing), then passed.

### feat(web): draw the engine's posterior and show the real convergence code
- What: the command post now feeds `viewState` with the incident's prior (segments plus ROW), its `priorInputEventIds`, its `engineParams` (the shared constants when the incident carries none) and its `priorVersion`. The map, the POA list and the "Outside the mapped area" row show the posterior, and the header shows the four-character convergence code. Nothing is computed until the incident has a prior version and a built prior.
- Source: plan Task 15 (map plus POA from `viewState`, convergence code in the header), spec rule R6 (engine parameters travel with the incident).
- Verified: typecheck and build clean; local shell smoke passed. The joined view is checked by the joined-post e2e once Task 11 and a drill seed exist.

### feat(web): word plans on the SDK's hybrid mode with a checked fallback
- What: `replanWording.ts`: `wordingParams` (PREFER_IN_CLOUD; cloud model with `systemInstruction` and `responseJsonSchema`; on-device create options from `onDeviceCreateOptions("text", SYSTEM)`, so English text in and out sit under `onDeviceParams.createOptions` with the system prompt repeated in `initialPrompts`, and the same schema as `responseConstraint`); `planPrompt` (the engine's table in the user text); `templateWording`; `checkWording` (team ids must equal the draft's, text non-empty and at most 200 characters); `wordPlan`, which never rejects and records the route: in_cloud gives cloud (`sdk_prefer_in_cloud`), on_device gives on_device (`link_down_fallback`), a missing source gives path "unknown" with `sdkReported` false, and a throw, a bad reply or a 15 s timeout gives the template on path "rules" (`template_fallback`). Notices are fixed sentences for App Check refusal (401, 403), busy (429), unavailable (503), timeout and any other failure; raw error text never reaches them.
- Source: plan Task 16c; rival self-audit addendum (F1 placement, unknown inferenceSource, plain 429 and 503, no raw error text, a measured reply timeout).
- Verified: `src/ai/replanWording.test.ts`, 16 tests, failed first (module missing), then passed. A live AI Logic call with this response schema returned 200 in 1,431 ms with both team ids (App Check debug exchange 200), which is the measurement behind the 15 s timeout together with the 0.8 to 1.8 s cloud replies in S4 step 4.

### feat(web): build AI Logic models in one client file
- What: `client.ts` creates one `getAI` instance on the Gemini Developer API with the limited-use App Check token switch, and `wordingGenerator` builds the plan-wording model with `wordingParams` and the 15 s request timeout. `generatorFor` maps a reply to its text and the SDK's `inferenceSource`. This is the only web file allowed to call the model builder (rules gate).
- Source: plan Task 16c (`client.ts`), rival self-audit addendum (model builders only in their client files).
- Verified: `src/ai/client.test.ts`, 3 tests, failed first (module missing), then passed; rules gate ok.

### fix(web): never record Playwright traces, which would store the App Check debug secret
- What: the e2e config sets `trace`, `video` and `screenshot` to off. A retained trace records request and response bodies, and the App Check debug-token exchange carries the debug secret in its request and the issued token in its response, so a failed run could have left the secret on disk or in a CI artifact. The fixtures already report failing responses as status, method and URL only.
- Source: Codex privacy review of lane-web at c69c485, finding 3 (relayed by the orchestrator).
- Verified: `src/e2eConfig.test.ts` failed first ("expected 'retain-on-failure' to be 'off'") and passes now; it also pins the list reporter, which writes no attachments. No trace file from earlier runs remains on disk (`find` for trace.zip found none).

### fix(web): clear the incident from the screen and stop listening after an access denial
- What: the post keeps its data in a reducer (`postAccess.ts`). A `permission-denied` or `unauthenticated` error from any listener clears the incident, teams, segments, map data and events, stops both listeners for good, and shows "This browser no longer has access to the incident" with "Join again". Any other listener failure keeps the last data and shows "No connection. Showing the last data received." The events listener now has an error handler (it had none).
- Source: Codex privacy review of lane-web at c69c485, finding 4 (relayed by the orchestrator); spec section 7 (only incident members read its data).
- Verified: `src/command/postAccess.test.ts`, 6 tests, failed first (module missing), then passed: a denial clears everything, late data after a denial is ignored, a connection failure keeps the data and says so. Typecheck, build and the local shell smoke passed.

### feat(web): build and write approved plans from the draft and its wording
- What: `plans.ts`: `planDocFor` joins the draft's segments with the wording's task line and reason per team (in draft order) into exactly the plan schema's eight fields, with `approvedByUid` the signed-in command uid and `approvedAt` a server timestamp, and refuses wording that lacks a draft team; `nextPlanVersion` and `planDocId` ("0001"); `localDraft` runs the engine's `assignTeams` so the post can draft with the link down; `approvePlan` writes `plans/{version}` and is called only from Approve.
- Source: plan Task 16c (`approvePlan`), spec 11.4 (plans have one writer; a local draft with the link down), lane A's rules contract (plans create-only, `approvedByUid` is the command uid).
- Verified: `src/data/plans.test.ts`, 6 tests, failed first (module missing), then passed; typecheck clean.

### feat(web): keep plan wording off the cloud while kill_cloud is on
- What: `wordPlan` takes `killCloud` (Remote Config `kill_cloud`). When it is on, the model is never called; the plan uses the template on path "rules" with the notice "Cloud paused by command. The plan below uses fixed wording." A template plan can still be approved.
- Source: spec section 14 (`kill_cloud`), plan Task 23 test "with kill_cloud on, the banner shows and a template plan can still be approved".
- Verified: new test in `src/ai/replanWording.test.ts` failed first (the model was called), then passed with zero model calls; 17 of 17.

### fix(web): clear approved plans with the rest of the incident on an access denial
- What: the post's access reducer now holds the approved plans too, so a permission or auth denial clears them with the incident and events, and plan data arriving after a denial is ignored.
- Source: follow-on to Codex privacy finding 4 (plans are incident data shown on the teams rail).
- Verified: new test in `src/command/postAccess.test.ts` failed first (no `plans` in the state), then passed; 7 of 7.

### feat(web): subscribe to approved plans and the server draft, and mark newly planned teams
- What: `subscribePlans` (approved plans, oldest first), `subscribeDraft` (the server's `planDrafts/{eventSetHash}` or null), and `planChange`, which marks the teams of a plan approved while the page is open as "New" and marks nothing on page load.
- Source: plan Task 16c (team card "New" after Approve, Task 23 e2e), spec 11.4 (the post shows the draft whose hash matches its own event set).
- Verified: `src/data/plans.test.ts`, 3 new tests for `planChange` failed first (not a function), then passed; 9 of 9.

### feat(web): show the suggested plan with its route glyph and approve it by hand
- What: `RouteGlyph` names where a model output came from with an icon and a word ("Cloud", "This laptop", "Fixed wording", "Route not reported"), with `data-path` for tests. `WhatChanged` shows the draft's source, a "Suggest plan" button, then a "Suggested" card with the glyph, any plain notice, each team's task and reason, and "Approve". Both buttons are disabled while their call runs; errors sit beside them in fixed sentences; nothing is written before Approve. Styles for the card, the glyph and the team-rail plan lines; "New" uses neutral ink, because change-cyan means only "moved by the last report".
- Source: plan Task 16c (`WhatChanged.tsx`, glyph with `data-path`), spec 22 (every model output is "Suggested"; write buttons disabled during a write; errors beside their control) and 22.1 (cyan only for "moved").
- Verified: typecheck and build clean. Behaviour is covered by `replanWording` and `plans` unit tests; the deployed replan e2e runs when lane A's draft function and rules land.

### feat(web): wire re-plan into the command post
- What: the post starts Remote Config (real-time), listens to approved plans and to the server draft for its own event set (falling back to `localDraft` when there is none), words the draft with `wordPlan` through `wordingGenerator` (model and `kill_cloud` from Remote Config, 15 s timeout), and on Approve writes the next plan version with the signed-in command uid. The team rail shows each team's current segments and task, and "New" for 10 seconds when a plan is approved while the page is open. A banner says when the cloud is paused.
- Source: plan Task 16c steps 3 and 5, spec 11.4.
- Verified: typecheck and build clean; 112 unit tests pass; local shell smoke passed. The deployed replan e2e (`data-path="cloud"`, Approve writes `plans/0001`, the team card changes) waits for lane A's `draftPlanOnEvent`, rules and a drill seed.

### chore(merge): bring main into lane-web (rules, joinIncident, ring prior, seeding tool)
- What: merges origin/main (security rules and storage rules, `joinIncident`, the ISRID ring prior, the drill seeding tool, the limits and production checklist) into lane-web; the root lockfile conflict was resolved by taking main's file and re-running `npm install` on the merged tree.
- Source: orchestrator order "merge the newest main (no rebase), then Task 36".
- Verified: `scripts/ci-local.sh` exit 0 on the merged tree (rules gate 129 files, engine 144 tests, vectors 124, rules and joinIncident 53 tests in the emulators); web typecheck, 112 unit tests and the Vite build pass.

### feat(web): find the segment under a map click and give the engine neighbour bearings
- What: `geo.ts`: `segmentContaining` (even-odd ray casting over Polygon and MultiPolygon, holes respected), `bearingDeg` (great-circle initial bearing, 0 to 360), and `effectSegments`, which turns the grid's segment docs (neighbour ids only) into the engine's effect context with a bearing from each centre to each neighbour, and drops ids not in the grid.
- Source: plan Task 36 (a sighting's place comes from a map click; a sighting outside the grid changes nothing), engine `deriveClueEffect` (needs the containing segment and neighbour bearings).
- Verified: `src/map/geo.test.ts`, 6 tests, failed first (module missing), then passed.

### feat(sightings): build public sighting and confirmation events that move the map only after confirmation
- What: `sightings.ts`: `removePhoneNumbers` (10-digit numbers with an optional +1, brackets, spaces, dots or hyphens, including "+1 (404) 5550142", and 7-digit local numbers; times like 14:03 and segment ids stay); `buildSightingEvent` (all 25 event keys, command role, `deviceId` and `authorUid` the signed-in uid, `eventId` from the engine over incident, uid and seq, `observedAtMs` required, place from the map click, the note stored only after phone numbers are removed and at most 2000 characters, reporter "family" or "public_caller", effect from the engine's `deriveClueEffect`: strong evidence for the clicked segment, "outside_area" off the grid, "needs_command" with no place); `buildConfirmation` (targets the sighting, effect none); `useAsStartPoint` (adds the sighting to `priorInputEventIds`, moves the start pin, raises the prior version).
- Source: plan Task 36, spec 12.2, lane A's rules contract (25 keys, deviceId = uid, role = claim), the Android phone-number shape from the Codex privacy review (finding 2 was Android's; the same shape is covered here).
- Verified: `src/data/sightings.test.ts`, 14 tests, failed first (module missing), then passed: unconfirmed, confirmed and rejected sightings through the engine's `toEngineEvents`; no caller name or number in any stored field; a sighting promoted to the start point stops counting. One test's own regex was case-sensitive against "Place"; the test was corrected, not the message.

### feat(sightings): read a caller's note on this laptop only, behind the private-data gate
- What: `sightingText.ts`. `readSightingText` removes phone numbers, sends possible crime evidence to no model (and asks no gate), asks the gate with `SIGHTING_TEXT_OPTS` (the same object the on-device model is created with) and makes no SDK call when the answer is no or the check throws, keeps a reply only when the SDK reports `on_device` (a cloud or missing source is discarded), and keeps only values inside the closed lists of `report-reading.schema.json` with a quote found in the note (the engine's `validateReading`). `readSightingTextInCloud` throws without a consent record for that note, refuses evidence and a paused cloud without a call, makes exactly one cloud call, and keeps only an `in_cloud` result. `sightingTextParams` is strictly ONLY_ON_DEVICE with the schema as the response constraint.
- Source: plan Task 36 (X10 on-device text read), spec section 15 (the gate, steps 1 to 5), rival self-audit F1 (same options to availability and create), Codex privacy finding 6 (test both boundaries of the private-read client; the deployed one-request control comes with the privacy e2e).
- Verified: `src/ai/sightingText.test.ts`, 12 tests, failed first (module missing), then passed; rules gate ok (no token counting in this file).

### feat(sightings): build the on-device and consented cloud models for the caller's note
- What: `sightingCloudParams` (ONLY_IN_CLOUD, the same closed schema as `responseJsonSchema`, no on-device parameters) and two builders in `client.ts`: `sightingTextGenerator` (ONLY_ON_DEVICE with `SIGHTING_TEXT_OPTS`) and `sightingCloudGenerator`. The model builder stays in `client.ts` only (rules gate).
- Source: plan Task 36, spec section 15 step 3 ("Read in the cloud" is a separate ONLY_IN_CLOUD call after a consent tap).
- Verified: new test in `src/ai/sightingText.test.ts` failed first (not a function), then passed; 13 of 13; rules gate ok.

### feat(web): number this browser's events from the clock so an id never repeats
- What: `makeSeq` returns whole-number sequence values that start from the clock in milliseconds and only move forward (one past the last value within a millisecond or after the clock steps back). Event ids hash (incident, uid, seq), so a reload or a new browser profile cannot repeat an id.
- Source: lane A's rules contract ("start the command post's seq from the current epoch ms").
- Verified: `src/data/seq.test.ts`, 3 tests, failed first (module missing), then passed.
