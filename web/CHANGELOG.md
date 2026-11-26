# Changelog: web command post

Each entry names what changed, its source (plan task or finding) and how it was verified, in commit order.

The extras lane (print sheets, radio cards, export, 3D views) keeps its own log in `web/CHANGELOG-EXTRAS.md`.

Commits before this file (gate, config, events, merge lanes, offline check, version.json, Remote Config, POA style) are listed in `git log -- web`.

## 2026-11-17

### feat(command): show and save segment debriefs on the command post
- What: the command post subscribes to the incident's debriefs and shows the Debriefs section under the plan: every cleared segment from the event stream (its latest clear) and every segment with a debrief. Command saves through `saveDebrief` (create tied to the clear, or edit). A failure to load says "Debriefs could not be loaded." in its place without stopping the post. A new guard, `src/data/debriefScope.test.ts`, fails if any source file other than the debrief module, its section, the post and the harness names debriefs, so no map, probability or plan code can read one.
- Source: field-expert input (search and rescue practitioner: debrief after a search).
- Verified: the guard passes and fails on a file planted in `prior/` (removed); it walks more than 100 files; 119 data unit tests and the 5 debrief harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(command): add the debrief section for cleared segments
- What: `command/DebriefSection.tsx`, "Debriefs": each cleared segment (and any segment that has a debrief) shows its debrief, the time it took, "Worked: ...", "Didn't work: ..." and who wrote it (the clearing team when its own device did, else Command), or "No debrief yet." with "Add debrief". Command adds or edits one: "Time it took (minutes)", "What worked (optional)", "What didn't work (optional)", Save debrief. A bad time or an over-long note is refused with the reason before anything is saved; a refused save says "The debrief was not saved. Try again." and keeps the form. A new debrief is tied to the segment's latest clear. A dev-only harness page (`web/harness/debrief.html`) runs it with fakes. Not on the command post yet.
- Source: field-expert input (search and rescue practitioner: debrief after a search).
- Verified: `e2e/harness/debrief.spec.ts` (5 tests: the list with and without a debrief; add, tied to the clear; a bad time refused with no save; edit from what is stored; a refused save) failed first (component missing), then passed; typecheck clean. scripts/ci-local.sh exit 0.

### feat(data): read, check and write segment debriefs
- What: `data/debriefs.ts` for `incidents/{id}/debriefs/{segmentId}`: `parseDebriefForm` (whole minutes 0 to 1440; "what worked" and "what didn't work" optional, trimmed, up to 500 characters each), `debriefFromDoc`, `newDebriefDoc` (writer, server time, the cleared event when known), `debriefEdit` (time and notes only; a cleared note is removed), `clearedSegments` (each cleared segment once, its latest clear), `debriefAuthor` (the clearing team when its own device wrote it, else Command), `subscribeDebriefs` and `saveDebrief`. Nothing here feeds the map, the probabilities or the plans.
- Source: field-expert input (search and rescue practitioner: debrief after a search) and the shared debrief rules.
- Verified: `src/data/debriefs.test.ts` (8 tests) failed first (module missing), then passed; typecheck clean. scripts/ci-local.sh exit 0.
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
- Source: plan Task 15 step 3; review ("no raw error text reaches the DOM").
- Verified: typecheck and build clean; local smoke renders the join form with the drill line.

### feat(web): add the app entry, HTML shell and a Vite build that checks its config
- What: `index.html` (dark colour scheme, an SVG icon), `src/main.tsx` (mounts the command post), and `vite.config.ts`: the env is read from the repo root, a production build fails at once when any Firebase value or the App Check site key is missing, and the version.json plugin records `GITHUB_SHA` or `git rev-parse HEAD` plus a dirty flag. Adds `preview` and `e2e` scripts.
- Source: plan Task 15; spec section 14 ("the build fails when it is missing"); review (version.json).
- Verified: `npm run build -w web` exit 0 with the untracked env; `dist/version.json` holds the 40-character commit. The first local smoke found a 404 for `/favicon.ico` (the page had no icon) and a 400 from anonymous sign-up (`CONFIGURATION_NOT_FOUND`, Auth not yet set up); the icon fixed the first, the backend setup fixed the second, and the shell smoke then passed with zero console errors.

### test(web): add the Playwright smoke with the live-commit check
- What: `e2e/playwright.config.ts` (real Chrome, 1440 px; a local preview of `dist` unless `BASE_URL` is set), `e2e/fixtures.ts` (`withDebugToken` sets the App Check debug global from `PLS_APPCHECK_DEBUG_TOKEN`; every console error, page error and HTTP 400 or higher response is collected with its URL), and `e2e/smoke.spec.ts`: the shell shows the drill line and the join form with zero console errors; "the live site serves this commit" (version.json equals `EXPECT_COMMIT` or HEAD, and not dirty when deployed); a joined post draws the map canvas and the license line after one successful App Check exchange. That third test needs a seeded drill incident: it fails under CI when the fixture is missing and is skipped only on a local run.
- Source: plan Task 15 step 5; review (live-commit smoke).
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
- Source: plan lanes rule (lanes stay current with main); a merge instead of a rebase because pushed history is not rewritten.
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
- Source: plan Task 16c; review (F1 placement, unknown inferenceSource, plain 429 and 503, no raw error text, a measured reply timeout).
- Verified: `src/ai/replanWording.test.ts`, 16 tests, failed first (module missing), then passed. A live AI Logic call with this response schema returned 200 in 1,431 ms with both team ids (App Check debug exchange 200), which is the measurement behind the 15 s timeout together with the 0.8 to 1.8 s cloud replies in S4 step 4.

### feat(web): build AI Logic models in one client file
- What: `client.ts` creates one `getAI` instance on the Gemini Developer API with the limited-use App Check token switch, and `wordingGenerator` builds the plan-wording model with `wordingParams` and the 15 s request timeout. `generatorFor` maps a reply to its text and the SDK's `inferenceSource`. This is the only web file allowed to call the model builder (rules gate).
- Source: plan Task 16c (`client.ts`), review (model builders only in their client files).
- Verified: `src/ai/client.test.ts`, 3 tests, failed first (module missing), then passed; rules gate ok.

### fix(web): never record Playwright traces, which would store the App Check debug secret
- What: the e2e config sets `trace`, `video` and `screenshot` to off. A retained trace records request and response bodies, and the App Check debug-token exchange carries the debug secret in its request and the issued token in its response, so a failed run could have left the secret on disk or in a CI artifact. The fixtures already report failing responses as status, method and URL only.
- Source: Codex privacy review of lane-web at c69c485, finding 3.
- Verified: `src/e2eConfig.test.ts` failed first ("expected 'retain-on-failure' to be 'off'") and passes now; it also pins the list reporter, which writes no attachments. No trace file from earlier runs remains on disk (`find` for trace.zip found none).

### fix(web): clear the incident from the screen and stop listening after an access denial
- What: the post keeps its data in a reducer (`postAccess.ts`). A `permission-denied` or `unauthenticated` error from any listener clears the incident, teams, segments, map data and events, stops both listeners for good, and shows "This browser no longer has access to the incident" with "Join again". Any other listener failure keeps the last data and shows "No connection. Showing the last data received." The events listener now has an error handler (it had none).
- Source: Codex privacy review of lane-web at c69c485, finding 4; spec section 7 (only incident members read its data).
- Verified: `src/command/postAccess.test.ts`, 6 tests, failed first (module missing), then passed: a denial clears everything, late data after a denial is ignored, a connection failure keeps the data and says so. Typecheck, build and the local shell smoke passed.

### feat(web): build and write approved plans from the draft and its wording
- What: `plans.ts`: `planDocFor` joins the draft's segments with the wording's task line and reason per team (in draft order) into exactly the plan schema's eight fields, with `approvedByUid` the signed-in command uid and `approvedAt` a server timestamp, and refuses wording that lacks a draft team; `nextPlanVersion` and `planDocId` ("0001"); `localDraft` runs the engine's `assignTeams` so the post can draft with the link down; `approvePlan` writes `plans/{version}` and is called only from Approve.
- Source: plan Task 16c (`approvePlan`), spec 11.4 (plans have one writer; a local draft with the link down), the security rules contract (plans create-only, `approvedByUid` is the command uid).
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
- Verified: typecheck and build clean. Behaviour is covered by `replanWording` and `plans` unit tests; the deployed replan e2e runs when the server's draft function and rules land.

### feat(web): wire re-plan into the command post
- What: the post starts Remote Config (real-time), listens to approved plans and to the server draft for its own event set (falling back to `localDraft` when there is none), words the draft with `wordPlan` through `wordingGenerator` (model and `kill_cloud` from Remote Config, 15 s timeout), and on Approve writes the next plan version with the signed-in command uid. The team rail shows each team's current segments and task, and "New" for 10 seconds when a plan is approved while the page is open. A banner says when the cloud is paused.
- Source: plan Task 16c steps 3 and 5, spec 11.4.
- Verified: typecheck and build clean; 112 unit tests pass; local shell smoke passed. The deployed replan e2e (`data-path="cloud"`, Approve writes `plans/0001`, the team card changes) waits for a server draft function (`draftPlanOnEvent`), rules and a drill seed.

### chore(merge): bring main into lane-web (rules, joinIncident, ring prior, seeding tool)
- What: merges origin/main (security rules and storage rules, `joinIncident`, the ISRID ring prior, the drill seeding tool, the limits and production checklist) into lane-web; the root lockfile conflict was resolved by taking main's file and re-running `npm install` on the merged tree.
- Source: build order "merge the newest main (no rebase), then Task 36".
- Verified: `scripts/ci-local.sh` exit 0 on the merged tree (rules gate 129 files, engine 144 tests, vectors 124, rules and joinIncident 53 tests in the emulators); web typecheck, 112 unit tests and the Vite build pass.

### feat(web): find the segment under a map click and give the engine neighbour bearings
- What: `geo.ts`: `segmentContaining` (even-odd ray casting over Polygon and MultiPolygon, holes respected), `bearingDeg` (great-circle initial bearing, 0 to 360), and `effectSegments`, which turns the grid's segment docs (neighbour ids only) into the engine's effect context with a bearing from each centre to each neighbour, and drops ids not in the grid.
- Source: plan Task 36 (a sighting's place comes from a map click; a sighting outside the grid changes nothing), engine `deriveClueEffect` (needs the containing segment and neighbour bearings).
- Verified: `src/map/geo.test.ts`, 6 tests, failed first (module missing), then passed.

### feat(sightings): build public sighting and confirmation events that move the map only after confirmation
- What: `sightings.ts`: `removePhoneNumbers` (10-digit numbers with an optional +1, brackets, spaces, dots or hyphens, including "+1 (404) 5550142", and 7-digit local numbers; times like 14:03 and segment ids stay); `buildSightingEvent` (all 25 event keys, command role, `deviceId` and `authorUid` the signed-in uid, `eventId` from the engine over incident, uid and seq, `observedAtMs` required, place from the map click, the note stored only after phone numbers are removed and at most 2000 characters, reporter "family" or "public_caller", effect from the engine's `deriveClueEffect`: strong evidence for the clicked segment, "outside_area" off the grid, "needs_command" with no place); `buildConfirmation` (targets the sighting, effect none); `useAsStartPoint` (adds the sighting to `priorInputEventIds`, moves the start pin, raises the prior version).
- Source: plan Task 36, spec 12.2, the security rules contract (25 keys, deviceId = uid, role = claim), the Android phone-number shape from the Codex privacy review (finding 2 was Android's; the same shape is covered here).
- Verified: `src/data/sightings.test.ts`, 14 tests, failed first (module missing), then passed: unconfirmed, confirmed and rejected sightings through the engine's `toEngineEvents`; no caller name or number in any stored field; a sighting promoted to the start point stops counting. One test's own regex was case-sensitive against "Place"; the test was corrected, not the message.

### feat(sightings): read a caller's note on this laptop only, behind the private-data gate
- What: `sightingText.ts`. `readSightingText` removes phone numbers, sends possible crime evidence to no model (and asks no gate), asks the gate with `SIGHTING_TEXT_OPTS` (the same object the on-device model is created with) and makes no SDK call when the answer is no or the check throws, keeps a reply only when the SDK reports `on_device` (a cloud or missing source is discarded), and keeps only values inside the closed lists of `report-reading.schema.json` with a quote found in the note (the engine's `validateReading`). `readSightingTextInCloud` throws without a consent record for that note, refuses evidence and a paused cloud without a call, makes exactly one cloud call, and keeps only an `in_cloud` result. `sightingTextParams` is strictly ONLY_ON_DEVICE with the schema as the response constraint.
- Source: plan Task 36 (X10 on-device text read), spec section 15 (the gate, steps 1 to 5), review (same options to availability and create), Codex privacy finding 6 (test both boundaries of the private-read client; the deployed one-request control comes with the privacy e2e).
- Verified: `src/ai/sightingText.test.ts`, 12 tests, failed first (module missing), then passed; rules gate ok (no token counting in this file).

### feat(sightings): build the on-device and consented cloud models for the caller's note
- What: `sightingCloudParams` (ONLY_IN_CLOUD, the same closed schema as `responseJsonSchema`, no on-device parameters) and two builders in `client.ts`: `sightingTextGenerator` (ONLY_ON_DEVICE with `SIGHTING_TEXT_OPTS`) and `sightingCloudGenerator`. The model builder stays in `client.ts` only (rules gate).
- Source: plan Task 36, spec section 15 step 3 ("Read in the cloud" is a separate ONLY_IN_CLOUD call after a consent tap).
- Verified: new test in `src/ai/sightingText.test.ts` failed first (not a function), then passed; 13 of 13; rules gate ok.

### feat(web): number this browser's events from the clock so an id never repeats
- What: `makeSeq` returns whole-number sequence values that start from the clock in milliseconds and only move forward (one past the last value within a millisecond or after the clock steps back). Event ids hash (incident, uid, seq), so a reload or a new browser profile cannot repeat an id.
- Source: the security rules contract ("start the command post's seq from the current epoch ms").
- Verified: `src/data/seq.test.ts`, 3 tests, failed first (module missing), then passed.

### feat(sightings): show each sighting's decision, missing place and out-of-area state
- What: `sightingCards` lists each sighting once (newest seen first) with its status: awaiting, confirmed or rejected. Decisions follow the engine's order (a command decision outranks a family one; the latest within a role wins; a searcher's confirmation is ignored). Retracted sightings drop out. A card says when the sighting has no place yet and when it fell outside the search area.
- Source: plan Task 36 (confirm and reject at command; the out-of-area banner), the Android family app's sightings that arrive with no place.
- Verified: `src/command/sightingCards.test.ts`, 5 tests, failed first (module missing), then passed.

### feat(web): let a map click place a point and show it as a pin
- What: `MapView` takes `onMapClick` (a click reports its lat and lon; the cursor becomes a crosshair while picking) and `pin` (drawn as a marker labelled "Sighting place").
- Source: plan Task 36 ("where: a map click, stored as position with positionSource map_click").
- Verified: typecheck and build clean. The pin style lands with the sighting form styles in the next commit.

### feat(sightings): add the sighting form with on-device note reading and a consented cloud read
- What: `SightingForm`: time seen, place from a map click (it names the segment or says "outside the search area"), direction, top and bottom colour, footwear, carrying, who reported, and a note with the hint "Do not type the caller's name." "Read the note" fills the pick-lists on this laptop; without a local model it says "This laptop has no local model. Nothing was sent." and offers "Read in the cloud", which needs "I consent for this note" first. Evidence notes are never read. Every field stays editable. The callback name and number live only in the form and are cleared on save. Styles for the form, the sightings list, the ghost button and the map pin.
- Source: plan Task 36 step 3, spec 12.2 and section 15 step 3.
- Verified: typecheck and build clean; the reading logic it calls is covered by `sightingText.test.ts`; the deployed check waits for joinIncident.

### feat(sightings): list sightings beside the plan for a person to confirm or reject
- What: `SightingsPanel` shows each sighting with the time seen, who reported it, its segment (or "No place yet."), the clothing it describes and the stored note, then "Confirm" and "Reject" (both disabled while a decision is saving; Confirm also while the sighting has no place). Decided cards show "Confirmed" or "Rejected". A sighting outside the grid shows "Sighting outside the search area. Consider moving the start point." Errors sit on the card in a fixed sentence.
- Source: plan Task 36 step 3, spec 12.2 ("The card shows the sighting next to the profile's clothing and the last-seen card").
- Verified: typecheck and build clean; the card states come from `sightingCards` (5 tests).

### feat(sightings): wire sightings into the command post
- What: the post reads each segment's neighbours and streams, numbers its events with `makeSeq`, and writes sightings and confirmations create-only with the read-back writer (never awaited; the listener shows them at once). "Add sighting" opens the form and turns map clicks into the place pin. The note is read through the gate with the on-device builder created only after the gate says yes; the cloud read passes a consent record with the signed-in uid and honours `kill_cloud`. The sightings panel decides by writing a confirmation event. Reports the server rejected are listed with one "Retry", which reads first.
- Source: plan Task 36 step 3, spec 11.1 (outbox with read-back), spec 12.2.
- Verified: typecheck and build clean; 153 unit tests pass. The deployed check (add and confirm a sighting, the rank list changes) waits for joinIncident to be deployed.

### chore(merge): bring main into lane-web (eventId framing, one-role join codes, per-worktree emulator ports)
- What: merges origin/main: the length-prefixed eventId framing and the rules that recompute each event id, one join code per role, effect validation in rules and engines, and emulator runs on per-worktree ports. The web computes event ids only through the engine's `eventId`, so nothing in web/ changed.
- Source: build order (merge main when the engine framing lands, then re-run the tests).
- Verified: `scripts/ci-local.sh` exit 0 on the merged tree (engine 155, vectors 134, rules and joinIncident 63 in the emulators on this worktree's ports); web typecheck exit 0 and 153 unit tests pass, including the sighting tests that compare ids with the engine's `eventId`.

### fix(web): stop parsing clip_model until the clip read exists
- What: `rc.ts` no longer parses `clip_model` (wired-or-cut: no web code read it). The clip read is Task 18; it brings the key back together with a test that the value picks the clip model.
- Source: review (5 of 8 parsed Remote Config values had no reader).
- Verified: `src/config/rc.test.ts` changed first to expect no `clip_model` (2 tests failed), then passed after the removal; `grep -c clip web/src/config/rc.ts` is 0.

### fix(web): stop parsing token_budget_fraction, which only the iOS router uses
- What: `rc.ts` no longer parses `token_budget_fraction` (wired-or-cut: the web has no router that budgets tokens; the iOS router reads it). The key stays in the Remote Config template for iOS.
- Source: review.
- Verified: `src/config/rc.test.ts` changed first to expect no `token_budget_fraction` (2 tests failed), then passed after the removal.

### fix(web): stop parsing replan_use_tools; web plan wording calls no tools
- What: `rc.ts` no longer parses `replan_use_tools` (wired-or-cut: `wordPlan` sends the engine's table in the prompt and declares no tools). If cloud function calling (cut rank X3 extras) is ever built, it brings the key back with a test.
- Source: review.
- Verified: `src/config/rc.test.ts` changed first to expect no `replan_use_tools` (2 tests failed), then passed after the removal.

### fix(web): stop parsing the judge-door keys, which the server reads
- What: `rc.ts` no longer parses `judge_seed_run_id` and `judge_sessions_per_day` (wired-or-cut: the `startJudgeSession` function reads them; no web code did). The unused number helper and an emptied range test went with them, so no test asserts nothing.
- Source: review.
- Verified: `src/config/rc.test.ts` changed first to expect neither key (2 tests failed), then passed after the removal; 10 of 10.

### test(web): require every parsed Remote Config value to have a reader in web code
- What: the web sets in-app defaults only for the three keys it reads (`cloud_model_web`, `kill_cloud`, `use_limited_use_tokens`); the other platforms' keys stay in the shared template. A new test scans every non-test source file under web/src (more than 10 files, so an empty scan cannot pass) and fails when a parsed value has no `rc.<field>` reader.
- Source: review ("every template key is parsed and used", applied to the web's own parser).
- Verified: the defaults test failed first (7 keys, wanted 3) and passes now; the reader guard was proved against a planted value `neverReadControl`, which failed it with "rc.neverReadControl", then the plant was removed (0 matches left).

### chore(merge): bring main into lane-web (the web CI job, per-worktree emulator temp folders, rules fixes)
- What: merges origin/main, which adds `.github/workflows/web.yml` (typecheck, unit tests and a placeholder-config build on every push that touches web/) and runs the web checks in `scripts/ci-local.sh`, plus emulator isolation per worktree and rules fixes.
- Source: build order (the web unit tests, typecheck and build belong in CI today).
- Verified: `scripts/ci-local.sh` exit 0 on the merged tree, now including the web step (20 test files, 157 tests, build ok), rules 71 in the emulators.

### feat(photos): read a family photo on this laptop only, behind the private-data gate
- What: `photoCues.ts`. `readPhotoOnDevice` asks the gate with `PHOTO_OPTS` (English text and image in, English text out: the same object the photo model is created with) and makes no SDK call when the answer is no, the check throws, or the browser's model reads text only; it keeps a reply only when the SDK reports `on_device` (a cloud or missing source is refused); a slow reply is given up after a timeout without a second call or any cancel of a running model download. `cleanCues` checks the closed lists of `photo-cues.schema.json`, caps landmarks at three, and keeps a place name only when the sign text shows it. `readPhotoInCloud` throws without a consent record for that photo, refuses while `kill_cloud` is on, makes one cloud call and keeps only an `in_cloud` result.
- Source: plan Task 20 (cut rank X11; S4 step 2 gave GO on the Gemma profile), review (no inferenceSource is refused; a reply timeout separate from the download), Codex privacy finding 6 (both boundaries tested at the unit level; the deployed one-request control follows with privacy.spec).
- Verified: `src/ai/photoCues.test.ts`, 14 tests, failed first (module missing), then passed; rules gate ok (no token counting in this file).

### feat(web): name Chrome's model state in the gate for the laptop-ready screen
- What: `availabilityOf(options)` in `gate.ts` returns Chrome's answer ("available", "downloadable", "downloading", "unavailable") or "missing" (no LanguageModel, a throw, a rejection, or no answer in 5 s); an unknown answer counts as "unavailable". `onDeviceAvailable` is now `availabilityOf(...) === "available"`, so the timeout and error handling live in one place. `gate.ts` stays the only file that asks Chrome (rules gate).
- Source: plan Task 20 ("Get this laptop ready" shows one of the three D2 states), spec 16 D2.
- Verified: two new tests in `src/ai/gate.test.ts` failed first (not a function), then passed; all 17 gate tests and the 173-test web suite pass after the refactor.

### feat(photos): tell which model state the laptop is in and download the model on a click
- What: `deviceModel.ts`. `deviceState` asks the gate for text and for image input and returns "image" (state c), "text" (state b: notes read here, photos stay unread), "downloadable" (Chrome can fetch a model first) or "no-model" (state a). `downloadDeviceModel` forwards whole percents from 0 to 100 and turns any failure into "This browser cannot download a local model." with no raw error text.
- Source: plan Task 20 (`downloadDeviceModel(onPct)`, "Get this laptop ready" shows one of the three D2 states), spec 16 D2, S4 step 3 (a stock Chrome 157 profile is "downloadable" before the download and "image" after it).
- Verified: `src/ai/deviceModel.test.ts`, 6 tests, failed first (module missing), then passed.

### fix(privacy): point any cloud fallback of a private on-device read at a host that cannot resolve
- What: `client.ts` builds the private ONLY_ON_DEVICE models (the caller's note and the family photo) with `PRIVATE_REQUEST_OPTIONS`, whose `baseUrl` is `https://on-device-only.invalid` (RFC 2606). If the SDK ever falls back to the cloud for such a call (firebase-js-sdk #10635), the request cannot leave the machine. The gate stays the first check; this is the second. Also adds the photo builders (`photoGenerator` on-device, `photoCloudGenerator` after consent) with typed parts (`type: "text"`, `type: "inlineData"`), as @firebase/ai 3.1.0's `Part` requires.
- Source: review, Task 20 ("if the installed @firebase/ai type files expose a base URL, build the private ONLY_ON_DEVICE instances with an unreachable address"). Grep result: `RequestOptions.baseUrl` exists (ai-public.d.ts line 2431), and the model's request options reach the cloud request URL (dist lines 1489 and 3345 to 3349).
- Verified: the `PRIVATE_REQUEST_OPTIONS` test failed first (not exported), then passed; a mapping test covers `photoGeneratorFor` (written with the builder, not before it). Live, on the spike page with LanguageModel deleted and NO gate: the fallback request went to on-device-only.invalid and failed with `net::ERR_NAME_NOT_RESOLVED`; zero requests reached firebasevertexai.googleapis.com.

### docs(evidence): record the unreachable base URL check in spike S4
- What: a section in `docs/evidence/spikes/S4.md`: with LanguageModel deleted and no gate, the SDK's fallback request for a model built with the unreachable base URL failed with `net::ERR_NAME_NOT_RESOLVED`, and nothing reached firebasevertexai.
- Source: review, Task 20 (record the base-URL result).
- Verified: CDP Network log of the run (raw file kept outside the repo); rules gate ok.

### feat(photos): hash, store and list family photos through the Storage SDK
- What: `photos.ts`: `sha256Hex`; `photoPath` (only a 64-character hash can name a photo, so no other text can become a path); `photoReadingDoc` (hash, path, cues, route, the family's yes, no or not-sure, and `expiresAt` 30 days on for the TTL policy); `bytesToBase64` in chunks; `loadPhotos` lists `photos/{incident}/` and reads each object with `getBytes` (2 MB cap), so Storage rules apply and no download URL exists; `uploadPhoto` skips an object that already exists, because photos are create-only and named by content; `savePhotoReading` writes `photoReadings/{sha256}` (command only).
- Source: plan Task 20, spec section 7 (`photoReadings`, the 30-day expiry); security rule (never `getDownloadURL`), the create-only photo paths in the storage rules (63a65bb).
- Verified: `src/data/photos.test.ts`, 6 tests, failed first (module missing), then passed; rules gate ok (no download URL in web code).

### feat(photos): re-encode added photos as JPEG with the long side at most 1536 px
- What: `photos/jpeg.ts`: `fitWithin` keeps the shape, never scales up and refuses an empty image; `toStandardJpeg` draws the photo on a canvas at that size and re-encodes it as JPEG, so no EXIF (place, time, device) survives.
- Source: plan Task 20 ("one photo per call, 1536 px JPEG"), spec 6.4 (photos standardized to JPEG, 1536 px, EXIF stripped).
- Verified: `src/photos/jpeg.test.ts`, 3 tests, failed first (module missing), then passed. The canvas step runs only in a browser.

### feat(photos): add Storage to the app and a click-started model download builder
- What: `getPls()` now also returns the Storage instance; `client.ts` gains `deviceModelInitializer`, which calls the SDK's `initializeDeviceModel` on a model built with the photo options and the private request options, so the download a person starts is for the same model the photo reads use.
- Source: plan Task 20 ("Get this laptop ready" calls `initializeDeviceModel` from the click).
- Verified: typecheck and build clean; the progress and failure handling are tested in `deviceModel.test.ts`.

### feat(photos): add the photo tray with laptop reads, a consented cloud read and the family's answer
- What: `PhotoTray`: "Get this laptop ready" and one line for the state (no model; can download; text only, "Photos stayed on this laptop."; can read photos), download progress in whole percents, "Add photos", and per photo: "Read on this laptop"; when there is no local model "This laptop has no local model. Nothing was sent." with "Read in the cloud", which needs "I consent for this photo"; the cues as "Suggested" with the route glyph (`data-testid="photo-cues"`); plain "Couldn't read" chips; and Yes, No or Not sure. Thumbnails come from the photo's bytes (a local object URL), never a Storage URL. Styles for the tray.
- Source: plan Task 20 step 3, spec section 15 step 3, Task 20's privacy.spec labels.
- Verified: typecheck and build clean; the reading logic is covered by `photoCues.test.ts` and `deviceModel.test.ts`. The deployed privacy e2e and the Gemma-profile still wait for joinIncident.

### feat(photos): wire the photo tray into the command post
- What: the post loads the incident's photos through the Storage SDK, re-encodes and uploads added photos (skipping any over 2 MB after re-encoding), checks the laptop's model state and starts the download from the click, reads a photo on this laptop through the gate with a 30 s reply timeout (measured on-device reads: p95 8.6 s, slowest 16.7 s in S4 step 2), reads it in the cloud only with a consent record carrying the signed-in uid (honouring `kill_cloud`), records each read's route (on_device with `sdk_only_on_device`, or cloud with `consented_cloud_read`), and saves the family's answer to `photoReadings/{sha256}` with the 30-day expiry.
- Source: plan Task 20 steps 3 and 4.
- Verified: typecheck and build clean; 190 unit tests pass.

### test(privacy): add the deployed no-leak e2e with its positive control
- What: `e2e/privacy.spec.ts`: with `LanguageModel` deleted before the page loads, "Read on this laptop" on a photo and "Read the note" on a sighting both show "This laptop has no local model. Nothing was sent." and zero POST requests reach firebasevertexai, generativelanguage or firebaseml; the positive control, a consented cloud read of one photo, must make exactly one such POST, which proves the listener sees requests. Fixtures: `joinCommand` (joins the seeded drill incident as command; a missing incident or code fails, never skips) and `syntheticSignJpeg` (a drawn sign, never a personal photo). Preflights are not counted.
- Source: plan Task 20 step 1 (privacy.spec), spec section 15 tests, Codex privacy finding 6 (exactly one observed request after explicit cloud consent).
- Verified: `npx playwright test --list` lists both tests and typecheck is clean. NOT RUN YET (2026-11-18): it needs joinIncident deployed; it is not in CI until then.

### chore(merge): bring main into lane-web (stricter availability gate, clip consent rules, joinIncident instance cap)
- What: merges origin/main: the rules gate now also catches optional-chained and bracketed availability calls, schema parity checks TypeScript enum values, the clip consent record is required before upload, camera sightings carry their clip reference, and joinIncident is capped at 5 instances.
- Source: keep lane-web current with main before the next task.
- Verified: `scripts/ci-local.sh` exit 0 on the merged tree: rules gate ok on 154 files (the web still asks Chrome only in gate.ts), schema parity ok, engine 155, vectors 134, rules 85 in the emulators, web 190 tests and the build.

### chore(merge): bring main into lane-web (Task 35a: profile splitting and approach notes)
- What: merges origin/main 2bc711c: the engine's `approachNoteIds`, `profileForSearchers`, `profileForCommand`, `profileForModel`, `profileWarnings`, `detectionProfile`, `placeToCheck`, and `shared/constants/approach-notes.json` (copy, order, footer, first-screen limit 7, source role per note).
- Source: the backend's Task 35a, which Task 35c builds on.
- Verified: `scripts/ci-local.sh` exit 0 on the merged tree; web typecheck and unit tests pass.

### feat(profile): split the subject profile into the shared and command documents at the command post
- What: `profile.ts`: `emptyProfile` (mayNotRespond on, every other flag off); `profileDocs` uses the engine's `profileForSearchers` (exactly the 20 keys the rules allow; dementia type only with the family's consent) and `profileForCommand` (history, places, water, vehicle); `profileFromDocs` reads both back into the form, with the family-only fields left empty; `approachLines` turns the shared document's note ids into the card's lines from `approach-notes.json` (family text and language filled into their templates, an id without copy skipped, seven lines first and the rest under More) plus the footer; `commandWarnings` shows only the photo-age warning, because the profile update date never leaves the family phone; `writeProfile` and `subscribeProfile` for `profile/shared` and `profile/command`.
- Source: plan Task 35c, spec 13.2 and 13.3, the backend's 35a and the rules allowlist (3feb2a7).
- Verified: `src/data/profile.test.ts`, 11 tests, failed first (module missing), then passed: no key in both documents, no family-only field in either, consent-gated dementia type, the first-screen limit, template filling.

### fix(profile): clear the profile documents with the rest of the incident on an access denial
- What: the post's access reducer holds the two profile documents; a permission or auth denial clears them with the incident, events and plans, and later profile data is ignored.
- Source: follow-on to Codex privacy finding 4 (the command profile holds private history).
- Verified: new test in `src/command/postAccess.test.ts` failed first, then passed; 8 of 8.

### feat(profile): add the approach card from fixed copy
- What: `ApproachCard` shows who teams are looking for (answers to, age, height in feet and inches, appearance, clothing last worn, mobility aids), a line when the photo is more than two months old, the first seven approach notes and the rest under "More", and the footer "General guidance from dementia care practitioners and search teams. Not medical advice." Code and fixed copy only; no model.
- Source: plan Task 35c, spec 13.3.
- Verified: typecheck and build clean; the lines come from `approachLines` (tested in `profile.test.ts`). Its styles land with the profile form commit.

### feat(profile): add the profile form with command-only history and places to check
- What: `ProfileForm`: answers to, nickname, age, gender, height in feet and inches, weight, appearance in the family's words, hair, eyes, primary language on its own row, clothing last worn, mobility aids, dementia type with the family's consent switch for showing it to teams, the 18 flags in plain words, the three 200-character family text fields, the photo date; then, kept at command, previous addresses and places they used to go (each can be set on the map and added as a place to check), water near home, and whether a vehicle may be involved. Medication details have no field: they stay on the family phone. Save is disabled while it runs; errors are fixed sentences. Styles for the form and the approach card.
- Source: plan Task 35c step 3, spec 13.2 (fields and where each goes).
- Verified: typecheck and build clean; 202 unit tests pass in scripts/ci-local.sh. Since e8bcea0 the GitHub jobs are not started (Actions budget); each entry records the local ci-local.sh result instead.

### feat(profile): wire the profile, places to check and the approach card into the command post
- What: the post listens to `profile/shared` and `profile/command` (cleared on an access denial), shows the approach card when a shared profile exists, opens the profile form ("Add profile" or "Edit profile"), saves both documents through the engine's splitters, and turns a place with a map point into a `destination` event with the engine's `placeToCheck` (one place, its label and position only; deviceId the command uid). Map picks are one at a time: a profile place or the sighting pin, with "Click the map to place it." while picking.
- Source: plan Task 35c step 3, spec 13.2 ("Add as a place to check" creates a destination event), the shared `placeToCheck` contract.
- Verified: typecheck, build and 202 unit tests; scripts/ci-local.sh exit 0. GitHub jobs are still blocked by the Actions budget. The deployed profile check (and the phone-side check of Task 35 step 5) waits for joinIncident.

### feat(judge): give the judge's door its D2 state lines and a published-run loader
- What: `judge/judge.ts`. `d2Copy` maps the laptop's model state to the judge page's lines: (a) "This browser has no built-in model. Nothing private was sent. Use the replay above, which runs in the cloud."; (b) the note is read here and "This browser's model cannot read images. Photos stayed on this laptop."; (c) the note and sample photos are read here, with "Read sample photos on this laptop"; and a line for a model Chrome can download first. `loadPublishedRun` reads `/evidence/published-run.json` and answers "none" on a 404 (the page then says "No published run yet."), "invalid" when any of the ten run parts is missing or the file is not JSON (never shown as numbers), "unavailable" when it cannot be fetched, or the run.
- Source: plan Task 23c, spec section 16 (D2 states, "No published run yet.").
- Verified: `src/judge/judge.test.ts`, 8 tests, failed first (module missing), then passed. GitHub jobs are blocked by the Actions budget; scripts/ci-local.sh exit 0 is the gate.
- Ruling recorded: state (b) and (c) do not yet say "Suggest plan works with Wi-Fi off" as the spec's draft line does; that claim is added when an offline run of the SDK's fallback has been measured.

### fix(judge): treat the hosting's HTML answer for a missing run file as no run
- What: Firebase Hosting rewrites every unknown path to the app, so a missing `/evidence/published-run.json` comes back as the app's HTML with status 200. `loadPublishedRun` now reads a `text/html` answer as "none", so the page says "No published run yet." instead of calling the file incomplete.
- Source: found by the new judge e2e against the preview server, which rewrites the same way.
- Verified: new unit test failed first ("treats the app's own HTML ... as no run"), then passed (9 of 9); the e2e then saw "No published run yet." inside the Numbers section.

### feat(judge): add the judge page at /judge with the laptop check and the run state
- What: `/judge` renders `JudgePage` (no login, no key, no Firebase start-up needed for it): the drill line; section 1 says "No published run yet." until the drill run is published; section 2 has "Get this laptop ready" and shows the D2 state lines, with the measured Chrome 157 note (downloadable before a 77 s download, text and image input after); section 5 shows "No published run yet.", a load failure, an incomplete file, or the run id. The D1 replay, the sample photos button, the numbers panel and the TestFlight and APK links are added when the sandbox function, the published run and the builds exist. Styles for the page.
- Source: plan Task 23c, spec section 16, S4 step 3.
- Verified: typecheck and build clean; `e2e/judge.spec.ts` (next commit) passed against the local preview.

### test(judge): prove D2 sends nothing without a built-in model and the page says no run yet
- What: `e2e/judge.spec.ts`: with `LanguageModel` deleted, "Get this laptop ready" shows state (a) with "This browser has no built-in model. Nothing private was sent." and zero requests reach any AI host, with no console errors; before a run is published, both the replay and the Numbers sections say "No published run yet." This test needs no join, so it runs today.
- Source: plan Task 23c tests ("with no built-in model D2 shows the no-model message and sends nothing").
- Verified: `npx playwright test judge` against the local preview: 2 passed.

### fix(judge): drop the door numbers that skipped from 2 to 5
- What: the judge page's section headings are now "Replay the training drill", "This laptop" and "Numbers". Doors 3 and 4 (TestFlight, APK) are not on the page yet, so the old numbering jumped from 2 to 5.
- Source: looking at the live still of /judge at 1440 px.
- Verified: build clean; `e2e/judge.spec.ts` updated to the new section names and passed against the local preview (2 passed).

### fix(web): ship MapLibre's worker with the build so the deployed map can load its data
- What: MapLibre 6 looks for `maplibre-gl-worker.mjs` next to its own module. After bundling that file was not in the build, the hosting rewrite answered with the app's HTML, and the browser logged "Worker failed to load" twice, so the map could never parse its segments. `MapView` now imports the worker with Vite's `?url` (emitted as `assets/maplibre-gl-worker-*.mjs`) and calls `setWorkerUrl`. The map container gets `data-map-state="idle"` when the map settles, and the joined smoke now waits for it before reading console errors (it used to check too early to see this).
- Source: found on the live site with joinIncident live, by a one-off probe that listed console errors after the post loaded.
- Verified: the joined smoke failed first against the local preview (the map never reached idle), then passed after the fix with zero console errors (3 passed); the worker asset is in `web/dist/assets`. scripts/ci-local.sh exit 0. Branch pushes run no CI now (merge-point flow).

### fix(photos): say when photos could not be loaded or added instead of showing an empty tray
- What: `loadPhotosOrError` returns the photos or the sentence "Photos could not be loaded. Reload to try again."; the tray shows it as an alert instead of "No photos yet." Adding photos now counts files that were not added (unreadable, or over 2 MB after re-encoding) and says "One photo was not added." or the count, instead of skipping them silently.
- Source: found on the live site: the bucket's missing CORS rule made every photo read fail, and the tray quietly showed an empty list (a silent failure). The CORS rule itself is in the root config and was handed to its owner.
- Verified: two new tests in `src/data/photos.test.ts` failed first (not a function), then passed (8 of 8); typecheck and build clean; scripts/ci-local.sh exit 0.

### fix(join): say App Check refused the browser instead of blaming the join code
- What: `joinErrorMessage` in `data/join.ts` (moved out of CommandPost) maps `unauthenticated`, the code a callable returns when App Check does not trust the browser, to "Join refused by App Check. Try a normal browser window.", the same wording the plan step uses for an App Check refusal. Wrong code, no connection and other failures keep their sentences.
- Source: plan Task 23c (appcheck check), spec section 14 ("Refusal message shown, never a silent failure"). The live site showed "Could not join. Check the incident id and the code." to a browser App Check refused.
- Verified: two new tests in `src/data/join.test.ts` failed first (not a function), then passed (6 of 6); typecheck and build clean. scripts/ci-local.sh exit 0.

### test(join): prove an unregistered App Check token sees the refusal message
- What: `e2e/appcheck.spec.ts` sets a random debug token registered nowhere, submits the join form with a made-up code, and expects "Join refused by App Check. Try a normal browser window." No real join code is used: App Check refuses before the code is read.
- Source: plan Task 23c ("an unregistered token shows the refusal message").
- Verified: against the live site (old build e26fc23) it failed, receiving "Could not join. Check the incident id and the code.", which also shows the deployed joinIncident refusing an untrusted browser; against the local preview with the fix it passed. scripts/ci-local.sh exit 0.

### fix(web): give the map the first row on phones so it is no longer 0 px tall
- What: under 900 px the grid gave its 50vh first row to the Teams rail, and the map (whose only child is absolutely placed) collapsed to 0 px. The map now takes the first row (`order: -1`, 55vh), the page scrolls instead of the inner rail, and the rails follow at full height.
- Source: UI review D1 (review P0 item 1).
- Verified: new `e2e/layout.spec.ts` at 390x844 failed first (map height 0), then passed (map over 300 px, both rails below it, no sideways scroll); the smoke suite still passes; still taken at 390 px shows the map at the top. scripts/ci-local.sh exit 0.

### fix(web): keep the match code on one line in the phone header
- What: at 390 px the header squeezed the convergence code until each character wrapped onto its own line. The code block no longer shrinks or wraps.
- Source: still of the joined post at 390x844 taken while fixing UI review D1.
- Verified: new layout test "the match code stays on one line in the header" failed first (56 px tall), then passed (under 40 px); the map layout test still passes. scripts/ci-local.sh exit 0.

### fix(map): credit OpenStreetMap only while OSM-derived data is drawn
- What: `map/credit.ts` `mapCredit` returns "Map data from OpenStreetMap" only when segments from the search grid (built from an OpenStreetMap extract by tools/grid-builder, which stamps every grid with the ODbL attribution) or a basemap are on screen. `MapView` shows the line from it; an empty map shows no credit. No basemap is drawn yet, so today the segments decide.
- Source: UI review D4 (review P0 item 2): the credit sat on an empty map with no OpenStreetMap layer.
- Verified: `src/map/credit.test.ts` (3 tests) failed first (module missing), then passed. The joined smoke now asserts the credit appears exactly when segments are drawn: it failed against the live site (credit over an empty map), then passed against the local preview. scripts/ci-local.sh exit 0.

### fix(judge): start the model download from the judge button, never point at a missing replay
- What: `getLaptopReady` in `ai/deviceModel.ts` reads the state, and when Chrome can download the model it starts the download from the click with whole percents, then reads the state again; a failed download is reported. The judge page's "Get this laptop ready" now uses it and shows "Downloading the model: N%" (Firebase starts only at that point, not on page load). `d2Copy` takes `{ replay, downloadFailed }`: with no built-in model the line ends at "Nothing private was sent." unless the replay is live (it is not built yet), and a failed download says "This browser could not download its built-in model. Nothing private was sent." instead of looping back to "Press Get this laptop ready".
- Source: UI review D9 (review P0 item 3).
- Verified: 3 new `getLaptopReady` tests and 2 new `d2Copy` tests failed first, then passed (19 of 19 in the two files). The judge e2e now asserts the exact no-model line and no "replay above" text: it failed against the live site, then passed against the local preview, still with zero AI-host requests. scripts/ci-local.sh exit 0.

### fix(web): give text fields a 3:1 edge with fg-4 borders
- What: join, sighting and profile fields drew their edge in the line colour (1.60:1 on bg-1, 1.45:1 on bg-2). They now use fg-4 (4.79:1 and 4.33:1), meeting WCAG 1.4.11's 3:1 for component boundaries.
- Source: UI review D6 (review P0 item 4).
- Verified: new `e2e/contrast.spec.ts` measures each field's computed border against the surface behind it; it failed first (1.6 on the join form, 1.45 in the sighting form), then passed. scripts/ci-local.sh exit 0.

### fix(photos): show keyboard focus on the Add photos button
- What: the file input under "Add photos" is invisible (opacity 0), so its focus ring was too. The label now draws the 2 px fg-1 outline while the input has keyboard focus (`:has(input:focus-visible)`), matching every other control.
- Source: UI review D7 (review P0 item 4).
- Verified: new `e2e/focus.spec.ts` tabs from "Get this laptop ready" onto the input and reads the label's outline; it failed first (outline none), then passed. scripts/ci-local.sh exit 0.

### feat(map): add the centre dot second signal and cased segment edges
- What: each segment centre gets a dot whose radius is 3 + 11 x sqrt(poa / maxPoa) px (spec 22.1 second signal), in fg-2 with a bg-0 ring so it is 3:1 or more against every probability step; the printed percent now hangs just below the dot. Segment edges are a 3 px bg-0 casing under a 1 px fg-4 line instead of one line-colour stroke (1.25:1 on the darkest step). `contrastRatio`, `MAP_INK` and `centreFeatures` live in `map/poaStyle.ts`.
- Source: UI review D5 (review P0 item 4), spec 22.1 "Second signal". Ruling: the spec gives the dot's radius but not its colour; fg-2 with a bg-0 ring is the only token pair that clears 3:1 on all eight steps.
- Verified: 4 new tests in `src/map/poaStyle.test.ts` failed first (not functions), then passed: the contrast helper reproduces the spec table (fg-4 on bg-0 5.23), radii 14, 8.5 and 3 for the sample, every dot 3:1 or more on every step, the edge inks. The map harness spec (next commit) reads the dot colour at each centre. scripts/ci-local.sh exit 0.

### test(map): add a dev-only map harness that checks the dot at each centre by pixel
- What: `web/harness/map.html` (served only by the Vite dev server; the production build's only entry is index.html) draws `MapView` over a synthetic 6 x 4 grid labelled "Synthetic test grid, not drill data." `e2e/harness.config.ts` runs `e2e/harness/*.spec.ts` against it; the main e2e config now ignores that folder. `e2e/harness/map.spec.ts` reads screen pixels (a 1 x 1 PNG decoded with node:zlib, no image library) and asserts the dot colour sits at each centre with its percent below it. Map visuals (and later the REPORT beat) can now be checked without seeded drill segments.
- Source: UI review D5 follow-up; drill-dev-1 has no segments yet, so the live site cannot show the map layers.
- Verified: the spec passed with the new MapView and failed with the previous one (`#E5B066`, the fill, at the centre); `grep` finds "Synthetic test grid" in no file of `web/dist`. scripts/ci-local.sh exit 0.

### feat(sighting): place a sighting from the keyboard with a Place list of segments
- What: the sighting form has a labelled "Place" select listing every segment (`segmentChoices` in `map/geo.ts`, sorted by id). Choosing one puts the sighting at that segment's centre, the same point a map click there gives, and the status line reads "Place: segment AB." A map click still works and the list follows it ("Outside the search area" when the click is off the grid). New dev-only harness `web/harness/sighting.html` renders the form over the synthetic grid without Firebase; the map harness now renders only on its own page so its grid can be shared.
- Source: UI review D8 (review P0 item 4): only a map click could place a sighting; section 22 asks for full keyboard use at the command post.
- Verified: new `segmentChoices` test failed first, then passed. New harness spec tabs from "Seen at" to Place, chooses AB, saves with Enter and checks the saved position is AB's centre: it passed with the new form and failed with the previous one (no Place control). Typecheck clean. scripts/ci-local.sh exit 0.

### fix(map): show the grid's own attribution line and make the joined smoke require segments
- What: the incident's `gridAttribution` (the license line tools/grid-builder stamps, "Map data from OpenStreetMap contributors (ODbL)") is read with the incident and shown as the map credit whenever its segments draw; the fixed "Map data from OpenStreetMap" stays only as the fallback. The joined smoke now requires the drill's segments and plates to draw before it checks the credit.
- Source: The backend seeded drill-dev-1 with a 67-segment grid and asked that the stamped attribution show wherever the map draws. The earlier smoke check could pass before segments loaded (an empty map with no credit is consistent), so it passed against the old build; it is no longer vacuous.
- Verified: new `mapCredit` test failed first, then passed (4 of 4). The new smoke failed against the live old build (received "Map data from OpenStreetMap"), then passed against the local preview with segments drawn. Typecheck clean. scripts/ci-local.sh exit 0.

### chore(deps): add vite-plugin-pwa 2.0.0 for the offline command post
- What: `vite-plugin-pwa` 2.0.0, exact pin, web devDependency (the spec's pinned version; brings workbox-build and workbox-window 7.4.1). The root lockfile gains 324 entries; none removed, no version changed (checked by diffing the package sets).
- Source: review P1 item 5, spec 6.3 "offline PWA" and the pinned stack list.
- Verified: socket depscore vite-plugin-pwa 2.0.0 supply chain 97, workbox-build 7.4.1 98, workbox-window 7.4.1 99, no vulnerability findings on the three; `npm ci` exit 0. npm audit rises from 10 to 18 findings; the 8 new ones are build-time tooling under workbox-build (rollup plugins, glob, minimatch, picomatch) that never ship to the browser. scripts/ci-local.sh exit 0.

### feat(web): load the command post offline after one visit with a Workbox service worker
- What: `VitePWA` in `web/vite.config.ts` generates `sw.js` (autoUpdate, clientsClaim, skipWaiting, old caches cleaned) that precaches the app shell: index.html, the JS and CSS, the MapLibre worker, the icon, the register script and a web manifest (8 entries, about 2.7 MB; the size limit is raised to 3 MiB for the 2.1 MB main bundle). Navigations fall back to index.html except Firebase's reserved `/__/` paths, `/pack/` and `/evidence/`. `version.json` is deliberately not cached, so the online check still has to reach the network. Firestore's persistent local cache (already on) supplies the last data.
- Source: UI review D2, review P1 item 5, spec 6.3 ("loads with Wi-Fi off") and the section 16 release gate ("an offline reload").
- Verified: new `e2e/offline.spec.ts` (join, wait for the segments and for the service worker to control the page, go offline, reload; expect the drill line, the map idle, Add sighting and the drill's segments drawn from cache) failed first (no service worker ever controlled the page), then passed against the local preview; a probe of the offline page showed the incident title, the match code and all 67 plates. scripts/ci-local.sh exit 0.

### test(e2e): mark the photo-dependent checks deployed-only so a local run fails loudly
- What: `deployedOnly()` in `e2e/fixtures.ts` throws a plain message unless BASE_URL is set. The two privacy tests and the joined smoke (whose console check sees photo reads) call it first. The production bucket's CORS trusts only the two hosting origins, so these checks only mean something on the deployed site; a local run now fails at once with that reason instead of timing out or being mistaken for a pass.
- Source: ruling on the photo checks (keep the bucket's CORS to the deployed origins; label the photo checks deployed-only).
- Verified: locally the three tests fail in under 0.2 s with the deployed-only message while the other smoke tests pass; with BASE_URL set to the live site the same three pass. scripts/ci-local.sh exit 0.

### feat(theme): add the measured 22.1 colour tokens and the contrast maths in one place
- What: `theme/tokens.ts` holds the spec 22.1 command colours (`COMMAND`), the eight-step `POA_RAMP`, `textPairAllowed` (the three "not allowed" pairs refused) and `dotRadiusPx`; `theme/contrast.ts` holds `contrast`, `hueDeg` and `lightness`. `map/poaStyle.ts` now takes the ramp, the dot size and the map inks from them instead of its own copies.
- Source: plan Task 39.1 (Task 39 starts after P0 and 23c).
- Verified: `src/theme/tokens.test.ts` (9 tests, the plan's list plus "base.css declares the same values as the tokens") failed first (modules missing), then passed: every allowed text pair is 4.5:1 or better, the spec's anchors reproduce (fg-1 on bg-1 15.99, fg-4 4.79, cyan 11.15, red 5.08), one warm hue with rising lightness, never red or cyan, plate 17:1, cyan needs the casing on step 6, dot radii 3 to 14. All 238 unit tests pass. scripts/ci-local.sh exit 0.

### feat(theme): self-host the DINish, Ioskeley Mono and DSEG7 Classic OFL fonts
- What: `web/public/fonts/` holds the original release files, unmodified: DINish variable (weight and width axes; release v4.007), Ioskeley Mono SemiBold (v2.2.0), DSEG7 Classic Bold (v0.46). Each folder has the repo's OFL text as `OFL.txt` and `SOURCE.txt` with the repo URL and the release commit SHA. `theme/fonts.css` declares them with `font-display: swap`; DINish is the UI and number face (tabular figures), Ioskeley Mono the 12 px caps labels, DSEG7 the clock (no clock on screen yet). The service worker now precaches the three woff2 files, so the fonts work offline. No font loads from a third-party host.
- Source: plan Task 39.1, spec 22.1 "Fonts".
- Verified: `src/theme/fonts.test.ts` (license and source per folder; every @font-face file exists) and the new `e2e/fonts.spec.ts` failed first (no font loaded), then passed: all three families load from this origin, DINish "1111" and "8888" measure the same width with tabular-nums, zero requests to font hosts, zero console errors. The SW precache grew to 10 entries. Stills at 1440 px checked. scripts/ci-local.sh exit 0.

### feat(change): add changeModel, the numbers and sentence for what a report did to the map
- What: `command/changeModel.ts` compares the POA before and after a report: the changed segments in whole percents, largest move first (rest-of-world mass left out), a banner ("Slipper in water (training inject). AC 12% to 31%.") and a screen-reader line ("Segment AC. POA 31 percent, up 19, after report: slipper in water."). A report that moves nothing gives "Report logged. Map unchanged. Ask the team." The cause label comes from the event type and reading (item and place for a clue, the cleared segments, sighting, camera sighting, found, place to check). Code and fixed copy only.
- Source: plan Task 26 (its `ChangeResult` also feeds Task 39's REPORT beat).
- Verified: `src/command/changeModel.test.ts` (the plan's two cases plus ordering, rest-of-world and a drop) failed first (module missing), then passed (4 of 4). scripts/ci-local.sh exit 0.

### feat(change): compute what the newest report did from the events alone
- What: `lastReportChange` in `command/viewState.ts` picks the newest report (by client time, then sequence; plan acknowledgements skipped) and runs the posterior without that one event and with every event, then `changeModel` on the two. Because it is recomputed from the events, a reload or a second seat shows the same change, with no browser memory of what the tab saw before.
- Source: plan Task 26 (the change beat needs before and after; "Hold Space shows the map before the event").
- Verified: 3 new tests in `src/command/viewState.test.ts` failed first (not a function), then passed: before and after equal the engine's posterior without and with the clue, AC moves up first, a later plan acknowledgement is skipped, no report gives null. scripts/ci-local.sh exit 0.

### fix(map): never drop a map redraw that arrives while a source is updating
- What: MapView redrew only when `isStyleLoaded()` was true and otherwise waited for the `load` event. `isStyleLoaded()` turns false again while a GeoJSON source is updating, and `load` fires once, so a POA or segment update arriving at that moment was parked forever and the map kept the old numbers. Redraws now check a flag set once when the style and sources exist.
- Source: found while building the change beat: holding Space set the "before" state but the chips and plates did not change.
- Verified: the change harness spec (next commit) failed before this fix (chips still 3 while Space was held) and passes after; the map and sighting harness specs still pass. scripts/ci-local.sh exit 0.

### feat(change): show what the newest report did: banner, cyan outlines, delta chips, hold Space
- What: `ChangeBeat` puts "What changed" in the rail with the banner from `changeModel` and the screen-reader line in a polite live region. MapView takes `moved`: the three largest moves get a 2 px change-cyan outline on a bg-0 casing (22.1: cyan means "moved by the last report" and nothing else) and a chip above the dot ("+15 pts", ASCII signs, `deltaLabel`). Holding Space (outside fields and buttons) shows the map before that report, with "Before this report", and releasing it brings the change back. The post computes it with `lastReportChange`.
- Source: plan Task 26 (delta chips and Hold Space are K; the animated sequence is Task 39.4). Ruling: outline only the three largest moves, the same ones that get chips; a strong report nudges nearly every segment, and an all-cyan map says nothing.
- Verified: new `deltaLabel` test failed first, then passed. New dev-only harness `web/harness/change.html` and its spec: banner and live-region text, three chips, cyan found across a moved edge and absent on an unmoved one (pixels), Space shows the before numbers and hides the chips, release restores them; all three harness specs pass. Still checked. scripts/ci-local.sh exit 0.

### test(change): prove the drill post shows what its newest report did
- What: `e2e/change.spec.ts` joins the drill and expects the "What changed" banner in one of its two forms (a moved segment with from and to percents, or "Report logged. Map unchanged. Ask the team.") and the matching screen-reader line in the section's live region.
- Source: plan Task 26, on deployed data.
- Verified: failed against the live site before this build was deployed (no change section), passed against the local preview on the live drill data. scripts/ci-local.sh exit 0.

### feat(motion): add the motion tokens and the two-second REPORT beat plan
- What: `motion/plan.ts`: `MOTION` (spec 22.1 enter 350 ms out(3), exit 250 ms inOut(3), swap, stroke 50 ms outQuart, line draw 600 to 1000 ms inOutExpo, release bounce 0.35 over 400 ms, reduced fade 150 ms, reduced hold 4 s) and `reportBeatPlan(change, distanceM, reduced)`: pin 0 ms, arc 100, lightness 300 (changed segments nearest first, stagger 40 ms capped so the spread stays within 300 ms), pulse 300, chips 900, reorder 1100, arc fade 1750, ending at 2000 ms; reduced motion is one 150 ms fade. `beatTotalMs` counts each step's stagger. No animation library in this file.
- Source: plan Task 39.4 interfaces and tests.
- Verified: `src/motion/plan.test.ts` (the plan's four tests) failed first (module missing), then passed. scripts/ci-local.sh exit 0.

### feat(motion): add the ripple delay from the point last seen
- What: `motion/ripple.ts` `rippleDelayMs(cell, origin, stepMs = 25)`: straight-line distance in cells times 25 ms, so dots grow outward from the point last seen on a prior's first draw.
- Source: plan Task 39.6.
- Verified: `src/motion/ripple.test.ts` failed first, then passed (0, 25 and 125 ms). scripts/ci-local.sh exit 0.

### feat(motion): add walker positions from tracks, released in cohorts
- What: `motion/walkerCanvas.ts`: `cohortReleaseMs` (25 walkers per cohort, 100 ms apart) and `walkerFrame(tracks, t)`, each walker's point at time t walked at even speed along its polyline, with done once it arrives. Plain arithmetic; the canvas will draw these points with no animation object per walker.
- Source: plan Task 39.5 (walker canvas; tracks come from Task 37).
- Verified: `src/motion/walkerCanvas.test.ts` (the plan's test plus a bent track) failed first, then passed. scripts/ci-local.sh exit 0.

### feat(map): hand the loaded map to an optional onReady callback
- What: MapView takes `onReady?: (map) => void`, called with the MapLibre map once its style and sources exist and with null when it is removed. Nothing in this repo branch uses it yet; the extras lane's ExtrasDock will (hook H3).
- Source: extras lane request H3.
- Verified: new map harness test failed first (no call), then passed; all four harness specs pass. scripts/ci-local.sh exit 0.

### chore(deps): add animejs 4.5.0 for the command post motion
- What: `animejs` 4.5.0, exact pin, web runtime dependency (spec 22.1: MIT, Julian Garnier, never 5.0 beta; only `web/src/motion/engine.ts` will import it). No dependencies of its own; the lockfile gains one entry.
- Source: plan Task 39.3 and 39.4.
- Verified: socket depscore supply chain 100, vulnerability 100, license 100; release date 2026-06-22. The 4.5.0 type files export `createTimeline` (add, label, call), `createScope` with `mediaQueries`, and `spring` taking `bounce` and `duration` (plan step 8 check). `npm ci` exit 0. scripts/ci-local.sh exit 0.

### feat(motion): play the REPORT beat as one animejs timeline inside a reduced-motion scope
- What: `motion/engine.ts`, the only file importing animejs. `motionScope(run)` is one `createScope` with the "(prefers-reduced-motion: reduce)" query and reruns when it changes. `playReportBeat(plan, targets)` builds one timeline labelled REPORT: each step (each changed segment for the staggered lightness step) animates a plain progress value 0 to 1 and hands it to `targets.progress`; the pin uses `spring({ bounce: 0.35, duration: 400 })`; `done` fires at the end; `cancel` stops it. The map, chips and rank list will apply the progress values (next commits). Dev-only harness `web/harness/beat.html`.
- Source: plan Task 39.3 and 39.4; API names read from animejs 4.5.0's type files.
- Verified: `e2e/harness/beat.spec.ts`: with motion, all seven steps (lightness once per changed segment) reach 1 and the beat ends in 1,900 to 2,400 ms; with reduced motion only the 150 ms fade runs. The engine was written before this spec, so two mutants were run against it: dropping the per-segment steps and ignoring reduced motion each fail the spec. scripts/ci-local.sh exit 0.

### feat(map): carry each segment's class before the newest report for the cross-fade
- What: `segmentFeatures(segments, poa, before?)` adds `clsOld`, the lightness class under the previous POA (with its own maximum), when `before` is given; without it the features are unchanged.
- Source: plan Task 39.4 (the REPORT beat cross-fades lightness from the old map to the new one).
- Verified: new test in `src/map/poaStyle.test.ts` failed first, then passed (11 of 11). scripts/ci-local.sh exit 0.

### feat(map): measure metres from a report to each changed segment for the beat order
- What: `metresBetween` (great circle) and `beatDistances(origin, changedIds, segments)` in `map/geo.ts`: metres from the report's position to each changed segment's centre, or from the largest move's centre when the report has no position. The beat staggers lightness nearest first by these.
- Source: plan Task 39.4 ("lightness is staggered by distance, nearest first").
- Verified: two new tests in `src/map/geo.test.ts` failed first, then passed (0 m at the origin; about 925 m for 0.01 degree of longitude at 33.78 N; over 1,100 m for 0.01 degree of latitude). scripts/ci-local.sh exit 0.

### feat(map): play the REPORT beat on the map: lightness cross-fade, outline pulse, chips rise
- What: MapView takes `beat` ({ key, before, change, distanceM }). When the key changes after the first one seen (never on load, so a reload shows the final map), it plays the plan through `motion/engine`: each changed segment cross-fades from its old lightness to the new one, nearest first (an old-colour fill under the new one, trading opacity through per-segment feature state, so at the end the map is exactly the plain one); the cyan outline pulses once; the chips rise at 900 ms; `data-beat` goes "playing" then "done". With reduced motion the final values show at once and only the chips fade in over 150 ms. The chip's visible element is now inside the marker element, because MapLibre rewrites a marker element's opacity every frame. The pin and the arc steps have no drawing yet.
- Source: plan Task 39.4.
- Verified: two new change-harness tests: after "Report again" CD's fill pixel shows the old step and the chips are hidden, then at "done" (within 2.5 s) the new step and the chips at full opacity; with reduced motion the new step shows at once and the beat is done within 0.5 s. Both failed first (no replay), and the chip check failed again until the inner-element fix. Frames at 50, 500, 1,000 and 2,100 ms checked by eye. All eight harness specs pass. scripts/ci-local.sh exit 0.

### feat(change): play the REPORT beat on the post only for reports that arrive live
- What: the post passes MapView a beat keyed by the newest report's event id, with distances from that event's position (`beatDistances`). `subscribeEvents` now reports whether a snapshot came from the local cache; the post hands over a beat only after the first server answer, and MapView records the first real key without playing it (an absent beat no longer counts as a first key). So opening or reloading the post, or the cache answering before the server, never plays a beat; a report that arrives while the post is open does.
- Source: plan Task 39.4 on the deployed data.
- Verified: new `e2e/beat.spec.ts` (writes one command-entered drill sighting per run): no beat on load, the new sighting plays it to "done" within 2.5 s, the banner updates, and after a reload nothing plays. Its first run failed (a beat had played on load because the empty first render counted as a key), then passed after the fix, against the local preview on the live drill data. Typecheck and build clean. scripts/ci-local.sh exit 0.

### feat(basemap): load a site's self-hosted PMTiles file whole, checked by its magic bytes
- What: `basemap/load.ts` `loadBasemap(url)` fetches the site's PMTiles file in one request (a small site extract, so the service worker can keep it as an ordinary response for offline use; no range requests) and accepts it only when it starts with "PMTiles" and spec version 3. A 404 or the hosting's HTML answer is "absent", other bytes are "invalid", a failed fetch is "unavailable". The file is wrapped in pmtiles' `FileSource` and keyed by its file name for the `pmtiles://` protocol.
- Source: UI review U4 and review P1 item 6 (self-hosted PMTiles basemap); the backend's dev extract for drill-dev-1.
- Verified: `src/basemap/load.test.ts` (4 tests) failed first (module missing), then passed. scripts/ci-local.sh exit 0.

### feat(basemap): style the Protomaps basemap in the 22.1 instrument greys
- What: `basemap/style.ts` `basemapLayers(source)`: under the probability fills, parks and green land in bg-1, water shapes in bg-3, buildings in bg-2; over the fills, streams, roads (wider by kind) and dashed paths as fg-4 lines at 0.6 opacity, so the fills keep their measured colours. Reads only Protomaps v4 layers. No label layers: they would need glyphs from a host.
- Source: UI review U4 ("paths, roads and the creek in fg-4, water as a bg-3 shape with no hue") and spec 22.1.
- Verified: `src/basemap/style.test.ts` (4 tests: tokens only, fills under and lines over with no labels, Protomaps v4 layers only, water bg-3 and lines fg-4) failed first (module missing), then passed. scripts/ci-local.sh exit 0.

### feat(map): draw the site's self-hosted basemap under the probability field
- What: MapView takes `basemapUrl`; the post passes `/tiles/<gridId>.pmtiles`. One pmtiles protocol is registered for the page; the loaded file is drawn with `basemapLayers`, shapes inserted under the probability fills and lines between the fills and the segment edges. The credit counts the basemap only once it is drawn, and the map carries `data-basemap` (drawn, absent, invalid, unavailable). The service worker precaches `.pmtiles` files, so the basemap draws offline. The dev extract (backend, Protomaps build 20261118, Piedmont Park, never for the film or judges) lives in `web/public/tiles/`, which `web/.gitignore` keeps out of git; a real site's extract will be copied in at build.
- Source: UI review U4, review P1 item 6.
- Verified: new `e2e/basemap.spec.ts` failed against the live site (no basemap), then passed against the local preview: basemap drawn, OpenStreetMap credit, zero tile requests to another host. The offline reload test still passes with the basemap precached (11 entries). Still at 1440 px checked. scripts/ci-local.sh exit 0. Not pushed or deployed yet: merge point 2 is running.

### feat(extras): mount the extras dock in the post header with the map from onReady
- What: the post header renders the extras lane's `ExtrasDock` ("More": print sheets, radio cards, check, export) with the post state, the view state and the MapLibre map, which MapView hands over through `onReady` (hooks H1 and H3).
- Source: extras lane request H1 and H3 (needed for the Sunday drill's ICS 204 sheet and radio card).
- Verified: new `e2e/extras-dock.spec.ts` failed first (no "More" in the header), then passed against the local preview on the drill (the menu opens with its items); layout, offline and judge e2e still pass. scripts/ci-local.sh exit 0.

### feat(extras): render the judge extras after the replay section
- What: `/judge` renders the extras lane's `JudgeExtras` after the replay section, given the published run when one exists (hook H2). It draws nothing today.
- Source: extras lane request H2.
- Verified: judge e2e (2 tests) pass against the local preview; typecheck and build clean. scripts/ci-local.sh exit 0.

### feat(web): precache the extras lane's json data files for offline use
- What: the Workbox precache adds `extras/**/*.json` (the extras lane's scam.json and terrain files once they ship) beside the existing patterns; `version.json` at the root stays network-only. The lazy extras chunks were already covered by the js pattern (hook H6).
- Source: extras lane request H6.
- Verified: build clean (11 precache entries today; no extras json exists yet, so the pattern matches nothing until it does); offline e2e passes. scripts/ci-local.sh exit 0.

### docs(web): point the web changelog at the extras lane's changelog
- What: one line under the heading of `web/CHANGELOG.md` points at `web/CHANGELOG-EXTRAS.md` (hook H5).
- Source: extras lane request H5.
- Verified: the target file exists on this branch after merge point 2. scripts/ci-local.sh exit 0.

### fix(profile): read a partial profile document as empty fields instead of crashing the post
- What: `sharedFromDoc` and `commandFromDoc` in `data/profile.ts` read `profile/shared` and `profile/command`; every missing or wrong-typed field reads as its empty value (strings "", numbers and dates null, arrays [] with only valid items kept, every flag false unless stated true, vehicle null). `subscribeProfile` uses them, so the approach card, the profile form and the extras lane always get a full object. Before, a nickname-only document made `approachLines` call `flatMap` on undefined and the command view crashed.
- Source: a verified MEDIUM from the Codex review of merge point 2 (the rules allow partial profile writes).
- Verified: new `src/data/profileRead.test.tsx` (4 tests) failed first (readers missing), then passed, including a server render of the approach card from a nickname-only document and wrong-typed arrays and flags. All data tests pass (73). scripts/ci-local.sh exit 0.

### chore(deps): add @axe-core/playwright 4.14.0 and axe-core 4.14.0 for accessibility checks
- What: exact dev dependencies for running axe in the e2e suite; axe-core is pinned directly so the plugin uses the same single copy (4.14.0, released 2026-10-15) instead of the two-day-old 4.14.1 its range would pull. Test-only; nothing ships to the browser.
- Source: tool audit item 1 (axe on the deployed post and /judge at 1440 and 390 px).
- Verified: socket depscore supply chain 99, vulnerability 100 for both (license 70: axe-core is MPL-2.0, acceptable for a test tool); `npm ls axe-core` shows one deduped copy; `npm ci` exit 0. scripts/ci-local.sh exit 0.

### test(a11y): check the join, judge and joined post pages with axe at 1440 and 390 px
- What: `e2e/a11y.spec.ts` runs axe with the WCAG 2.0, 2.1 and 2.2 A and AA rules on the join page, `/judge` and the joined drill post (map canvas excluded: MapLibre draws it), at 1440 x 900 and 390 x 844, and expects zero violations, printing each rule and node when one appears. A control plants an image with no alt text and expects axe to report it.
- Source: tool audit item 1 (axe beside Lighthouse; Lighthouse accessibility measured 100 on `/` and `/judge` at desktop and mobile).
- Verified: all six page checks pass against the local preview on the drill; the control passes (axe reports image-alt). scripts/ci-local.sh exit 0.

### docs(web): drop internal process names and a private path from the web changelog and S4 notes
- What: source lines now name the plan task, review or finding without the internal build roles, the S4 spike notes say the labels came from a separate Claude session, and one raw-file path outside the repo is no longer printed. No code changed.
- Source: new repo text rule before the repository goes public (no internal role names, private rule ids or private paths).
- Verified: `git grep` for the banned names, rule ids and private paths over web/ (outside the extras lane's files) and docs/evidence/spikes returns nothing; S4.json still parses. scripts/ci-local.sh exit 0.

### fix(plans): approve without waiting for the server so Approve works with the link down
- What: Approve awaited Firestore's `setDoc`, which settles only on the server's acknowledgement, and first asked the server for the plan list, so with the link down the button waited forever. `approveNow` now takes the next version from the plans already on this laptop and starts the write without waiting; the plans listener reports which versions still have pending writes (`pendingPlans` in the post state), and the plan reads "Approved on this laptop as plan vN. Sending." until the server has it, then "Approved as plan vN. Sent." If the server refuses it (plans are create-only, so another seat approved that version first), the line is replaced by "Plan vN was not saved: another plan was approved first. Suggest again." The Approve and Suggest buttons stay usable offline.
- Source: review sweep finding (verified in data/plans.ts: the awaited server acknowledgement).
- Verified: new unit tests (`approveNow` returns at once with a write that never settles and takes version max + 1 from the local plans; `planSendState` unknown, sending, sent; the reducer keeps and clears pending versions) failed first, then passed (320 unit tests). New `e2e/approve-offline.spec.ts` (writes one drill plan per run): offline, Suggest then Approve shows "Sending" within 3 s with Suggest still enabled, and after reconnecting "Sent"; it failed against the live build (no status, Approve waiting) and passed against the local preview. scripts/ci-local.sh exit 0.

### fix(photos): show the family's answer at once and say when the server refused it
- What: Yes, No and Not sure on a family photo no longer wait for the save: the answer shows at once and every button stays usable, because a Firestore write settles only on the server's acknowledgement and never does with the link down. If the server refuses the save, the answer is taken back and "Not saved. Try again." shows beside that photo (before, the rejection was unhandled and nothing showed). New dev-only harness `web/harness/photos.html` renders the tray with two synthetic photos and a save that never settles or fails.
- Source: review sweep finding (photo tray buttons waiting on the server while busy) and UI review D15 (silent failed answer).
- Verified: new `e2e/harness/photos.spec.ts` failed first (the answer never showed while the save waited; a refusal showed nothing and logged an unhandled rejection), then passed; all ten harness specs pass. scripts/ci-local.sh exit 0.

### fix(profile): close the profile form on Save without waiting for the server
- What: Save profile closed the form only after Firestore acknowledged both documents, so with the link down it stayed on "Saving". The form now starts the save and closes at once (the profile is already in the local snapshot); if the server refuses it, the post shows "The profile was not saved. Edit it and save again." under the Edit profile button. New dev-only harness `web/harness/profile.html` with a save that never settles.
- Source: review sweep finding, same pattern as Approve and the photo answers (writes awaited for UI state).
- Verified: new `e2e/harness/profile.spec.ts` failed first (the form stayed open while the save waited), then passed (closed within 0.5 s, one save); all eleven harness specs pass; typecheck clean. scripts/ci-local.sh exit 0.

### test(e2e): keep the extras lane's dev-server specs out of the deployed suite
- What: the main Playwright config now ignores `e2e/extras/**` as it already ignores `e2e/harness/**`. Those specs open `/extras-harness/*.html`, which only the Vite dev server serves; the extras lane runs them with `e2e/extras.config.ts`.
- Source: the first full deployed run after merge point 2 picked them up and they failed against the live site (the harness pages are not deployed).
- Verified: `--list` on the main config shows no extras spec; `npx playwright test -c e2e/extras.config.ts` passes (8 of 8) with the dock and judge hooks mounted. scripts/ci-local.sh exit 0.

### test(e2e): give the join step 20 s, since joinIncident can start cold under parallel joins
- What: `joinCommand` waits up to 20 s for the post after pressing Join instead of the 5 s default.
- Source: the first full deployed run after merge point 2: the four tests that started together all timed out at the join while every later join passed (the callable starting cold under concurrent calls).
- Verified: the same four tests then passed against the live site (change, basemap, the live beat, offline Approve). scripts/ci-local.sh exit 0.

### docs(evidence): record the web Lighthouse, axe and bundle-scan results
- What: `docs/evidence/web/2026-11-18-audit.md`: Lighthouse scores for `/` and `/judge` at desktop and mobile (accessibility 100 on all four), the axe results for the join page, `/judge` and the joined post at 1440 and 390 px (0 violations, with a control), and the scan of the live bundle (one public Firebase key, our public site key, no secret markers, one model name as the Remote Config fallback, prompt text present because on-device reads run in the browser), with what each failing audit means and what is to be fixed.
- Source: tool audit items 1 and 4 (Lighthouse and axe on the deployed pages; bundle inspection before the merge point).
- Verified: numbers copied from the Lighthouse runs, the axe e2e run and the scan output in this session; no secret value appears. scripts/ci-local.sh exit 0.

### feat(prior): rebuild the prior from the stored segments with the engine's buildPrior
- What: `prior/rebuild.ts`: `gridFromDocs` turns the stored segment documents back into the engine's grid; `rebuildPrior` calls `buildPrior` (the function the grid tools seeded the incident with, now with the 0.75 near-share guard) for the chosen layers and terrain, plus the ring-only baseline; `priorWrites` lists every segment's `priorPoa` and `ringPoa`, ROW, and the incident's layers, terrain and `priorVersion + 1`. The wedge is refused without a confirmed direction of travel. The segment reader now keeps `nearFrac` and `featureClasses`; the incident type carries `terrain` and `priorLayers`.
- Source: plan Task 26 (each prior layer is a visible switch) and spec 10.5.
- Verified: `src/prior/rebuild.test.ts` (4 tests on a synthetic 3 x 3 grid: the grid mapping; identical to calling `buildPrior` directly, ring baseline included, total mass 1; the writes with the version raised by one; the wedge refused without a bearing) failed first (module missing), then passed. 324 unit tests pass. scripts/ci-local.sh exit 0.

### feat(prior): add the prior layer switches with their sources and a confirm step
- What: `command/LayerSwitches.tsx`: "Rings, always on" with its source (ISRID dementia distances, n = 175, straight line) and the distance table (temperate flat marked "default, not verified for this site", or temperate mountain); a "Near roads, trails and water" switch with its source (75% within 71 m, n = 110, and the 0.75 near-share guard labelled as our rule); a "Direction of travel" switch (75% within 66 degrees, n = 11), disabled with "Needs a confirmed direction of travel." until one exists; the vehicle note when a vehicle is involved. A change asks "Rebuild the prior? Every team's map and match code change." with Rebuild prior and Cancel, then shows "Prior rebuilt on this laptop as vN. Sending." until the incident reaches that version. Dev-only harness `web/harness/layers.html`.
- Source: plan Task 26 and spec 10.5 ("Each layer is a visible switch with its source and n").
- Verified: new `e2e/harness/layers.spec.ts` (3 tests: sources, n and the wedge reason; the confirm and Cancel; Rebuild hands over the layers and terrain and shows the sending line) failed first (component missing), then passed. scripts/ci-local.sh exit 0.

### feat(prior): rebuild and share the prior from the post's layer switches
- What: the post renders `LayerSwitches` under the probability ranking with the incident's stored layers, distance table and prior version (the wedge stays disabled: no confirmed direction of travel yet; the vehicle note follows the command profile). Rebuild prior runs `rebuildPrior` and `priorWrites` and commits one Firestore batch (`prior/write.ts`: every segment, ROW and the incident, so no seat sees a mix), not awaited, so it also works offline; the line turns from "Sending" to "Prior rebuilt as vN." when the incident reaches that version.
- Source: plan Task 26, spec 10.5.
- Verified: typecheck and build clean; layers harness spec passes. One live round trip on the drill against the local preview (raised the drill's prior version by two): the mountain column changed the numbers; going back to flat reproduced all 67 seeded numbers exactly, so the web rebuild agrees with the grid tools; the match code moved KHSP, D23D, YNDY. scripts/ci-local.sh exit 0.

### feat(motion): compute ripple delays from each segment centre's distance to the start
- What: `rippleDelays(points, origin)` in `motion/ripple.ts`: each point's offset from the point last seen in 125 m cells (a local flat approximation), times 25 ms.
- Source: plan Task 39.6.
- Verified: new test failed first, then passed (0 ms at the origin, 50 ms two cells north, 75 ms three cells east). scripts/ci-local.sh exit 0.

### feat(motion): grow the probability dots outward from the start when a prior first draws
- What: `playRipple` in `motion/engine.ts` grows each dot over 400 ms out(3) after its delay (one RIPPLE timeline); MapView multiplies the dot radius and ring by a per-dot feature state and plays it when its `ripple` key first draws, marking `data-ripple` playing then done. The post keys it by prior version with the incident's start point, so it plays on load and again after a prior rebuild. Reduced motion draws the dots at once.
- Source: plan Task 39.6, spec 22.1 "Grid ripple".
- Verified: two new map harness tests failed first (no ripple), then passed: a far dot is not drawn early in the ripple and is drawn when it is done (pixels); with reduced motion the dots are there at once. All 16 harness specs pass. Typecheck clean. scripts/ci-local.sh exit 0.

### feat(motion): measure how far each rank row moved for the FLIP reorder
- What: `flipOffsets(before, after)` in `motion/flip.ts`: for each row in both measurements that moved, its old top minus its new top, in the new order. FLIP is written by hand, as spec 22.1 says.
- Source: plan Task 39.4 (the beat's reorder step).
- Verified: `src/motion/flip.test.ts` (2 tests) failed first (module missing), then passed. scripts/ci-local.sh exit 0.

### feat(motion): slide reordered rank rows from their old place, on the beat's reorder step
- What: `playFlip` in `motion/engine.ts` starts each moved row at its old place and slides it to the new one over 350 ms inOut(3) after a delay; reduced motion skips the slide. `PoaRank` measures its rows before and after an order change (`offsetTop`, which ignores transforms) and plays it; the post passes a 1,100 ms delay once the server has answered, so a reorder from a new report lands on the REPORT beat's reorder step. Dev-only harness `web/harness/rank.html`.
- Source: plan Task 39.4, spec 22.1 ("the ranked list reorders by FLIP over 350 ms").
- Verified: new `e2e/harness/rank.spec.ts`: right after a reorder the moved row is still at its old place and it reaches its new place after the delay plus 350 ms (failed first: it jumped at once, 55.5 px away); with reduced motion it is at the new place at once. All 18 harness specs pass. scripts/ci-local.sh exit 0.

### feat(motion): add the beat's pin at the report and the arc to the largest move
- What: the beat takes the report's position (`origin`, from the newest report's event). A neutral pin (fg-1 on a bg-0 ring; cyan stays reserved for what moved) springs in there (scale by the 0.35-bounce spring), and an arc (an SVG path over the map, curved, drawn by its dash offset) runs from the pin to the largest move's centre between 100 and 700 ms, then fades over the last 250 ms. The pin stays until the next report. A report with no position, or reduced motion, skips the arc.
- Source: plan Task 39.4 (pin, arc and arc fade steps) and UI review U1.
- Verified: new change-harness test failed first (no pin), then passed: during the beat the pin is visible and the arc exists, the arc is fully opaque after 900 ms and faded at "done", the pin remains. Frame at 750 ms checked by eye. All 19 harness specs pass. scripts/ci-local.sh exit 0.

### feat(walkers): run the seeded walker simulation as a worker job with its measured time
- What: `workers/walkerJob.ts` runs one `simulateWalkers` call (the engine's seeded walker prior, plain arithmetic) and posts `progress` at the start and the end, then `result` with the elapsed milliseconds on this machine, or `error` with the engine's message instead of throwing inside the worker. `workers/walkers.worker.ts` is the Web Worker around it (spec 10.6). Progress every 1,000 walkers needs an engine hook (asked of the engine's owners); splitting the run would change the seeded table.
- Source: plan Task 37c.
- Verified: `src/workers/walkerJob.test.ts` (2 tests on the engine's toy graph) failed first (module missing), then passed: the posted result equals `simulateWalkers` called directly, the time is measured, and a refused run posts the engine's message. scripts/ci-local.sh exit 0.

### feat(walkers): start the walker Web Worker from the page and resolve with its result
- What: `workers/runWalkers.ts` `runWalkersInWorker(job, onProgress)` starts `walkers.worker.ts` as a module Worker, forwards progress, resolves with the result and the measured time, rejects with the engine's message, and ends the Worker either way. Dev-only harness `web/harness/walkers.html` runs the engine's toy graph (10,000 walkers, 300 sampled tracks) through the Worker and directly.
- Source: plan Task 37c.
- Verified: new `e2e/harness/walkers.spec.ts`: the Worker's table equals the engine's for the same seed, the time is measured, progress reads 0 then 10,000, 300 tracks come back; a mutant Worker running another seed fails it. scripts/ci-local.sh exit 0.

### feat(walkers): turn sampled walker tracks into map polylines released in cohorts
- What: `motion/walkerTracks.ts` `walkerTracksToLngLat(tracks, graph, durationMs)`: each sampled track's stations (and its end point when it stayed on the graph) become longitude and latitude through the graph's projection, released in cohorts of 25, 100 ms apart, so the canvas projects only each walker's current point per frame.
- Source: plan Task 37c and 39.5 (walker canvas).
- Verified: `src/motion/walkerTracks.test.ts` (2 tests) failed first (module missing), then passed. scripts/ci-local.sh exit 0.

### feat(walkers): draw the walker flow on one canvas, then hand over to the probability grid
- What: `playWalkers` in `motion/engine.ts` is one 60 fps timer for every walker (no animation object per walker). `command/WalkerLayer.tsx` draws each walker's current point (`walkerFrame`, projected per frame) as a small fg-2 dot on one canvas over the map, then fades the canvas over 350 ms so the probability fill remains, marking `data-mode` "flowing" then "final-grid"; reduced motion goes straight to the grid. MapView takes `walkers` ({ key, tracks }) and shows the layer once its map has loaded.
- Source: plan Task 37c and 39.5 (walker canvas), spec 22.1 "Walkers".
- Verified: two new map harness tests (300 synthetic tracks fanning out from cell AB) failed first (no canvas), then passed: more than 50 lit canvas pixels mid-flow, then "final-grid"; with reduced motion "final-grid" at once. Frame at 900 ms checked by eye. All 22 harness specs pass. scripts/ci-local.sh exit 0.

### feat(walkers): load the site's route graph and write a walker run as the shared prior
- What: `prior/walkerPrior.ts`: `loadRouteGraph(url)` reads the site's route graph file (absent on a 404 or the hosting's HTML answer, invalid when it is not JSON or lacks stations, edges and nodes, unavailable when the fetch fails); `walkerPriorWrites` makes a walker table the shared prior: every segment's `priorPoa` and ROW (the ring prior stays in `ringPoa` as the baseline), and the incident's `priorModel` "walkers", `priorSeed`, the places used as attractors added once to `priorInputEventIds`, and `priorVersion + 1`.
- Source: plan Task 37c ("a change rewrites segments.priorPoa (rings stay in ringPoa), sets priorModel and priorSeed, adds any destination used as an attractor to priorInputEventIds, raises priorVersion").
- Verified: `src/prior/walkerPrior.test.ts` (4 tests) failed first (module missing), then passed. scripts/ci-local.sh exit 0.

### feat(walkers): add the Walkers or Rings switch with its two options of ours
- What: `command/PriorSwitch.tsx`: Rings and Walkers buttons (pressed state), "Pull toward confirmed places (ours)" (enabled when confirmed places exist) and "Low mobility: shorter distances (ours)", always the line "The walker model is a prior for planning. It does not predict where a person is.", a confirm step ("Every team's map and match code change."), the measured run line ("10,000 walkers in 1.84 s on this laptop.") and the sending line. Without the site's route graph Walkers is disabled with the reason. Dev-only harness `web/harness/prior-switch.html`.
- Source: plan Task 37c and spec 10.6.
- Verified: new `e2e/harness/prior-switch.spec.ts` (2 tests) failed first (component missing), then passed. scripts/ci-local.sh exit 0.

### feat(walkers): run the walker prior from the post and show the flow and the planning-only line
- What: the post loads `/tiles/<gridId>.graph.json` (precached for offline) and renders `PriorSwitch` above the layer switches. Walkers runs `simulateWalkers` in the Worker from the graph station nearest the start point, with the incident's seed (default 20261122, stored so a rerun gives the identical table), the terrain, low mobility when chosen, and confirmed places to check as attractors when chosen; it writes the walker table with `walkerPriorWrites` in one batch (not awaited), plays the 300 sampled tracks on the map, and shows the measured run time. Rings rebuilds the ring prior with the current layers and sets `priorModel` back to rings. While the walker prior is in use the map carries "The walker model is a prior for planning. It does not predict where a person is." The incident type gains `priorModel` and `priorSeed`.
- Source: plan Task 37c, spec 10.6.
- Verified: typecheck and build clean (the Worker is its own chunk, `walkers.worker-*.js`); on the joined drill post the switch renders, Walkers is disabled with "Walkers need this site's route graph." (none is built for the dev site yet), and axe still finds 0 violations at 1440 and 390 px. Not yet verified end to end on the drill: the walker run, the write and the flow wait for the dev site's route graph. scripts/ci-local.sh exit 0.

### test(e2e): find the sighting Place list by role so the places switch cannot match it
- What: the live beat spec and the sighting harness spec find the Place list as the combobox whose name starts with "Place", because `getByLabel("Place")` now also matched the "Pull toward confirmed places (ours)" switch, and an exact label match fails (the select's name includes its chosen option).
- Source: the full deployed run after the walker switch landed (strict-mode violation in `e2e/beat.spec.ts`).
- Verified: the live beat spec passes against the deployed site and the sighting harness spec passes. scripts/ci-local.sh exit 0.

### fix(web): serve a real robots.txt, describe the page, and title the judge page
- What: `web/public/robots.txt` (all user agents allowed) is served as a text file instead of the hosting rewrite's HTML; `index.html` has a meta description; `/judge` sets its own title, "Judge's door: Point Last Seen".
- Source: UI review D21; Lighthouse SEO 82 on `/` and `/judge` (robots.txt invalid, no meta description).
- Verified: new `e2e/pagefacts.spec.ts` tests "robots.txt is a real text file" and "each page has a description and its own title" failed first (text/html; no description), then passed against the local preview. scripts/ci-local.sh exit 0.

### fix(web): stop the join page jumping down when the app first renders
- What: `#root` is a block formatting context (`display: flow-root`), so the panel's top margin stays inside it instead of collapsing into `body`; before, the whole body moved down 108 px (12vh) when React rendered the first panel.
- Source: UI review D18 and Lighthouse (layout shift 0.084 desktop, 0.12 mobile on `/`). The cause was measured with the browser's layout-shift entries: one shift of 0.075 whose source was BODY, y 0 to 108.
- Verified: the `e2e/pagefacts.spec.ts` test "the join page does not shift as it loads" failed first (0.075), then passed (under 0.02); the phone layout, judge and shell checks still pass. scripts/ci-local.sh exit 0.

### feat(join): show the join form while connecting, with the button saying Connecting
- What: while the app connects, the join form is already shown with its button disabled and labelled "Connecting" (instead of a short "Connecting." panel that the form then replaced); it is the same form element afterwards, so anything typed stays.
- Source: UI review D18 suggestion.
- Verified: the shell smoke, App Check refusal and field-contrast checks pass against the local preview (they press "Join as command" once it appears); typecheck and build clean. scripts/ci-local.sh exit 0.

### feat(judge): show the cloud model Remote Config selects, when it was fetched, or the labelled default
- What: `/judge` has a "Cloud model" section from the real-time Remote Config listener: "Cloud model now: <model>." with "Chosen by Remote Config (fetched <time>), so it can change live with no new release." when the value came from Remote Config; otherwise "<model> (default)" with either "Remote Config answered at <time> with no value set, so this is the page's pinned default." or "Remote Config has not answered, so this is the page's pinned default."; and "Cloud steps are paused by command." when they are. It is never blank: before Remote Config starts the pinned default is named. `startRemoteConfig` now reports the value's source and the last fetch time. The words come from `modelLines` in `judge/judge.ts`.
- Source: promoted item C2 (live model swap shown on the judge page), with the fetch time and default label asked for in review.
- Verified: `modelLines` tests (4) failed first, then passed; new judge e2e "names the cloud model Remote Config selects right now" failed against the live site (no section), then passed against the local preview. Today the project has no Remote Config template (the fetch answers NO_TEMPLATE), so the page correctly shows the labelled default. scripts/ci-local.sh exit 0.

### feat(telemetry): describe each model call as a hybrid-inference trace with four attributes
- What: `telemetry/trace.ts`: `traceAttributes(route)` gives path, reason, platform and stage, nothing else (no report text, note, photo or answer); `recordInference(route, sink)` records one "hybrid-inference" trace from the call's start to its end with `latency_ms` as a metric, and drops any telemetry failure so it cannot break the read it describes. The sink will be Firebase Performance Monitoring (the web config has no Analytics measurement id, so the plan's `inference_complete` event has no web home).
- Source: promoted item P-15 and plan Task 27.
- Verified: `src/telemetry/trace.test.ts` (3 tests: the plan's attribute test, the recorded trace with start, duration and metric, a failing sink does not throw) failed first (module missing), then passed. scripts/ci-local.sh exit 0.

### fix(plan): name teams in the suggested plan instead of their document ids
- What: `WhatChanged` takes the incident's teams and prints each assignment's team name ("Team 2"), falling back to the id only for a team it does not know; the post passes its teams. Dev-only harness `web/harness/plan.html`.
- Source: UI review D14 (the person approved a plan that read Firestore document ids).
- Verified: new `e2e/harness/plan.spec.ts` failed first ("T1 Search AA."), then passed ("Team 1 ..."). scripts/ci-local.sh exit 0.

### fix(plan): pass the incident's teams to the plan card so it shows their names
- What: the post passes its teams to `WhatChanged`. The previous commit's entry said so, but this one-line change had been left out of that commit; this commit makes the claim true.
- Source: UI review D14 follow-up (committed-tree check).
- Verified: typecheck and build clean; the plan harness spec passes. scripts/ci-local.sh exit 0.

### fix(web): use 16 px field text and 44 px tap targets on phones
- What: under 900 px wide, inputs, selects and text areas use 16 px text (iOS Safari zooms into smaller fields on focus) and buttons are at least 44 px tall.
- Source: UI review D20 (15 px inputs, 39 to 41 px buttons at 390 px).
- Verified: new `e2e/phonefit.spec.ts` at 390 x 844 failed first (15px), then passed (16 px fields, Join button at least 44 px). scripts/ci-local.sh exit 0.

### feat(walkers): forward the engine's progress every 1,000 walkers from the Worker
- What: the walker job passes `onProgress` (engine hook added to the engine, called every 1,000 walkers and once at the end, with an identical table) and posts each value; the job's own end-of-run progress message is gone.
- Source: plan Task 37c ("the worker posts progress every 1,000 walkers").
- Verified: the walker job test now runs 2,500 walkers and expects progress 0, 1000, 2000, 2500; it failed first (0, 2500), then passed. The Worker harness spec now reads progress 0 to 10,000 in steps of 1,000 and still matches the engine's table. scripts/ci-local.sh exit 0.

### feat(walkers): read the grid builder's stored route graph and index it with the engine
- What: `loadRouteGraph` now reads the stored `RouteGraph` the grid builder writes (`build-grid --graph`) and indexes it with the engine's `indexRouteGraph`; a file without edges and nodes, or one the engine refuses (no bounds or projection, which would read as a graph with no exits), is "invalid".
- Source: plan Task 37c; `indexRouteGraph` moved into @pls/engine and built the dev site's graph.
- Verified: `src/prior/walkerPrior.test.ts` (5 tests, with a two-station stored graph) failed first (the old reader expected an indexed file), then passed, including a refused graph without a projection. scripts/ci-local.sh exit 0.

### test(e2e): sign in once per run and reuse the session in every test
- What: a Playwright setup project signs in once (the page's anonymous sign-in) and saves the session with its IndexedDB, where Firebase keeps the user, to `web/e2e/.auth/state.json` (gitignored; not under test-results, which Playwright empties each run); every test starts from it. Before, each test context made a new anonymous user (about 25 per full run), and after several runs in one day Firebase Auth refused sign-ups from this machine with HTTP 400 `TOO_MANY_ATTEMPTS_TRY_LATER` (its per-IP limit), so ten deployed tests could not join. Real users are not affected (one sign-up each); a drill should sign its browsers in before reaching the site rather than all at once on one network.
- Source: the failed deployed run and the limit confirmed with one probe.
- Verified: after the limit lifted, setup plus joined tests against the local preview: one setup sign-in, and a joined test counted zero sign-up requests; the phone layout tests pass. scripts/ci-local.sh exit 0.

### feat(telemetry): trace each wording, photo and sighting-note model call in Performance Monitoring
- What: `telemetry/perf.ts` is the sink (Firebase Performance Monitoring custom traces). The post records one "hybrid-inference" trace per model call: plan wording (its route from `wordPlan`), on-device and consented cloud photo reads, and on-device and consented cloud sighting-note reads, each with path, reason, platform and stage and the latency; never any text, photo or answer.
- Source: promoted item P-15 and plan Task 27.
- Verified: typecheck and build clean; `e2e/telemetry.spec.ts` (deployed-only) is run against the deployed build right after this commit: a consented cloud photo read must produce a Performance Monitoring upload naming "hybrid-inference" with its route values. scripts/ci-local.sh exit 0.

### test(e2e): run the App Check smoke from an empty browser so it proves the exchange
- What: the joined smoke runs with an empty starting state instead of the run's saved session, because the saved session carries a cached App Check token and the test's purpose is to see the debug-token exchange answer 200. It costs one anonymous sign-up per run.
- Source: the first deployed run with the shared session (the smoke waited for an exchange that the cached token made unnecessary).
- Verified: the smoke file passes against the live site (3 tests plus setup); the telemetry check passes there too. scripts/ci-local.sh exit 0.

### feat(web): put the product name above the drill line on the join and judge pages
- What: a small Ioskeley Mono caps wordmark, "Point Last Seen" (fg-3), above the drill line on the join page and `/judge`.
- Source: UI review D23 (the product name was on no screen).
- Verified: the `e2e/phonefit.spec.ts` test "the product name is on the join page and the judge page" failed first (not found), then passed; the join-page layout-shift test and axe on both pages at 1440 and 390 px still pass. scripts/ci-local.sh exit 0.

### fix(walkers): fill the pressed Rings or Walkers button so the chosen model shows
- What: a pressed ghost button (`aria-pressed="true"`) is filled fg-1 on bg-0 text, so Rings or Walkers reads as chosen at a glance.
- Source: the still of the first live walker run on the drill (both buttons looked the same).
- Verified: new harness test failed first (transparent background), then passed (fg-1); all prior-switch harness tests pass. Live run evidence from the same session: 10,000 walkers in 0.09 s on this laptop on the dev site's route graph (1,549 edges), the flow drew and handed over to the grid with the planning-only line under the map, and switching back to Rings restored the earlier numbers exactly. scripts/ci-local.sh exit 0.

### fix(join): name the hourly join limit instead of blaming the code
- What: when `joinIncident` refuses with `resource-exhausted` (10 join attempts per user per rolling hour, the guard against code guessing), the join form now says "Too many join attempts from this browser. Try again in an hour." instead of "Could not join. Check the incident id and the code."
- Source: found when the e2e suite, joining as one shared test user, ran past the limit; a real person retrying a code would have been told to check a correct code.
- Verified: new test in `src/data/join.test.ts` failed first, then passed (7 of 7). scripts/ci-local.sh exit 0.

### test(e2e): join once in the setup session and open the post directly in each test
- What: the setup project now also joins the drill once (when the drill fixture is set) before saving the session, and `joinCommand` opens the post and fills the join form only when the form, not the post, appears. The App Check refusal test starts from an empty browser, since the saved session carries a valid cached App Check token. Each full run now makes one anonymous sign-up and one join (plus one of each for the fresh-browser smoke), well inside Firebase Auth's per-IP sign-up limit and `joinIncident`'s 10 joins per user per hour.
- Source: the deployed run in which every test joined as the one shared user and `joinIncident` answered `resource-exhausted`.
- Verified: the full deployed suite passed 34 of 35 against the live site; the one failure was the live-commit check, because the live site still served the previous commit. scripts/ci-local.sh exit 0.

### test(e2e): require the cloud read to carry a Firebase Auth token and App Check
- What: the privacy positive control now also checks its one AI Logic request carries `Authorization: Firebase <ID token>` and a non-empty `X-Firebase-AppCheck`, the two headers AI Logic needs once App Check replay protection and authenticated-users mode are on. Every web cloud call lives in the command post, which mounts only after `ensureSignedIn` resolves (and a join needs a signed-in caller); the judge page only starts the on-device model download and never signs in.
- Source: App Check replay protection enforced on AI Logic for this project, and authenticated-users mode about to be turned on.
- Verified: against the live site after enforcement (19:12Z), with the token check changed to `Bearer` the test failed (`auth: false`), restored it passed; the private-read test and the telemetry cloud read passed in the same run. scripts/ci-local.sh exit 0.

### fix(join): disable the form after a failed sign-in and offer Try again
- What: a failed anonymous sign-in now keeps the join form disabled and shows one sentence with a Try again button that runs sign-in again; typed text stays. The sentence names the cause: Firebase Auth's per-network sign-up limit ("Too many sign-ins from this network. Try again later."), a lost connection, or a plain failure. Before, the form stayed live (a join with no user could only fail and then blamed the code), and the sign-in message never showed at all, because the join panel took its error from a prop only when it first mounted, while still connecting.
- Source: UI review D10.
- Verified: `signInErrorMessage` tests failed first, then passed (10 of 10 in join.test.ts); `e2e/signin.spec.ts` (local preview, empty browser, sign-up requests aborted) failed first (no alert), then passed: the alert reads "No connection. Try again when the link is back.", Join is disabled, Try again signs in and enables Join with the typed incident id kept. The join page's shift, product-name and axe checks still pass. scripts/ci-local.sh exit 0.

### test(e2e): require the judge page's cloud model to come from Remote Config
- What: the judge-page test no longer accepts the page's pinned default; it requires "Cloud model now: gemini-...-flash-lite." with no "(default)" and "Chosen by Remote Config (fetched HH:MM)".
- Source: the project's Remote Config template is now published (version 1, cloud_model_web gemini-3.5-flash-lite), closing the C2 check that waited on it.
- Verified: passed against the live site with the template published. scripts/ci-local.sh exit 0.

### feat(ai): add the cloud-only camera clip read with the shared CameraSighting schema
- What: `ai/clipRead.ts` builds the clip read's parameters: `ONLY_IN_CLOUD`, JSON reply with the response schema taken from `shared/schemas/camera-sighting.schema.json` (same fields, closed lists and caps), and the same prompt the Android family app sends (no face, no guessing who it is). `ai/client.ts` adds `clipCloudGenerator`, which sends the clip inline with its own video type, then the prompt, with a 120 s timeout. Nothing calls it yet; the intake and the read come next.
- Source: plan Task 18c (Step 3: "The model call is ONLY_IN_CLOUD with inlineData and responseSchema").
- Verified: `src/ai/clipRead.test.ts` (4 tests, schema compared field by field with the shared file) and two new `client.test.ts` tests failed first (module and export missing), then passed; typecheck clean. scripts/ci-local.sh exit 0.

### feat(data): store a camera clip and its consent record as the rules require
- What: `data/clips.ts` holds the clip's storage steps, matching the Android family app: `clips/{incident}/{sha256}.mp4`; the consent record `clipReadings/{sha256}` with exactly the rules' twelve keys (reading and route null, the four consents with public use optional, `expiresAt` 32 days out, the server's `createdAt`); a retry's renewal that keeps every stored field and renews only consent, expiry and createdAt; the completion that sets only reading and route; reading a record back; and the Storage and Firestore calls (consent write awaited within 20 s, because Storage refuses the clip without it; `clipExists` for a retry, since clips are create-only). Uses the engine's `ConsentMark` from the shared camera module.
- Source: plan Task 18c; rules ruling I9 (consent record first).
- Verified: `src/data/clips.test.ts` (8 tests, key list compared with the rules' list) failed first (module missing), then passed; typecheck clean. scripts/ci-local.sh exit 0.

### feat(ai): read a camera clip in the Android app's order with the shared checks
- What: `readClip` checks size (`sizeProblem`), the clip's length and the three consents bound to the clip's SHA-256 (`consentComplete`) and the cloud kill switch before anything leaves the laptop; a stored reading is returned with no model call and no write; on a miss it writes the consent record (or renews an earlier attempt's), uploads unless a retry finds the clip already stored, re-checks the bytes and the kill switch, calls the cloud model, checks the reading with `checkSighting` and completes the record with the cleaned reading and the route (`sdk_only_in_cloud`, as the Android app writes to the same collection). The bearing comes from `bearingFromExit` with the facing just given. `parseCameraSighting` refuses an edge, lighting or legibility off the closed lists. The shared checks come from the engine's camera module.
- Source: plan Task 18c; Android ClipReader order (consent first, retry renew, skip a stored upload).
- Verified: 11 new tests in `src/ai/clipRead.test.ts` (refusals with zero calls, call order on a miss, cached hit with only a lookup, retry renewal keeping stored fields and skipping the upload, a failed check and a model failure leaving only the consent record, parser refusals) failed first (exports missing), then passed (15 of 15); typecheck clean. scripts/ci-local.sh exit 0.

### test(e2e): add the script that generates a 6 s moving-box test clip
- What: `web/e2e/assets/make-moving-box.sh` writes `moving-box.mp4` (4,448 bytes, 6.0 s, 320x240, 10 fps, H.264: a red square crossing a grey frame; no person, no real footage) with ffmpeg, bit-exact and without metadata. The clip itself is not committed: the repo's media rule keeps every .mp4 out, so the intake tests generate it on demand (they run locally, not in CI).
- Source: plan Task 18c ("tested with a generated clip" until the staged S-CAM clips exist).
- Verified: ffprobe reads h264, 320x240, 60 frames, duration 6.000000. scripts/ci-local.sh exit 0.

### feat(camera): add the clip intake with four separate consents, clock, facing and camera place
- What: `camera/ClipIntake.tsx`, the "Add camera clip" form: the clip file (its length and size shown; one over 14,000,000 bytes refused at once with the engine's `sizeProblem` sentence), the clip's start time, "The camera's clock is right", the camera's facing on an 8-way picker (or Not known, which means no bearing), where the camera is (Place list, like the sighting form), and the four consents asked separately: the person in the clip, the owner of the footage, cloud reading, and public use (optional). Read clip stays disabled until the three required consents are given. A read that gives no sighting shows one sentence ("Couldn't read this clip. Nothing changed.", a refusal, or "The clip was not read. Try again."). A dev-only harness page (`web/harness/clip.html`) shows it with no Firebase. Not yet on the command post; that comes with the sighting card.
- Source: plan Task 18c, Step 3 (four consents separately, clock confirmed, 8-way facing).
- Verified: `clipFacts` and `clipOutcomeMessage` tests failed first (module missing), then passed; `e2e/harness/clip.spec.ts` failed first, then passed both tests with the generated clip (made on demand when missing): Read disabled until the third required consent, the values passed on (6 s, 4,448 bytes, facing 90, start time, consents, camera at segment AB), the could-not-read sentence, and the oversize refusal with nothing passed on. scripts/ci-local.sh exit 0.

### feat(camera): add the sighting card with three facts and See the frame
- What: `camera/SightingCard.tsx` shows a clip reading as three facts worked out by code: "Last seen HH:MM:SS" (clip start plus `lastSeen`, the engine's `lastSeenMs`), the heading from the bearing ("Heading north", or "Direction not known"), and the clothing with unknown parts left out ("(night: no colors)" under night infrared). "See the frame" opens the local clip paused at the model's key frame with its box drawn on it; "Read before, not sent again." marks a stored reading. The clip form's checkboxes and radios now sit beside their labels. The harness page's `?outcome=read` mode shows the card after a read. Not yet on the command post; Confirm comes next.
- Source: plan Task 18c ("The card shows time, direction, clothing, See the frame").
- Verified: `src/camera/sightingCard.test.ts` (4 tests) failed first (module missing), then passed; the harness test with the generated clip reads "Last seen 14:05:05", "Heading north" and the clothing line, and See the frame pauses the decoded video at 4 s with the box at 40%/30%/20%/40%; the two intake harness tests still pass. scripts/ci-local.sh exit 0.

### feat(camera): build the camera sighting event, its start-point patch and the travel bearing
- What: `data/cameraSighting.ts`. `buildCameraSighting` writes the event the Android family app writes for a confirmed clip: `camera_sighting`, reporter camera, last seen at clip start plus `lastSeen` (`lastSeenMs`), the camera's place as `camera_pin` (or none), input method clip, the reading with the clip's hash, start, clock flag and facing, the clip's route, effect none "incorporated_in_prior". `cameraStartPatch` adds it to `priorInputEventIds`, moves the start to the camera when it was placed and raises the prior version. `travelBearingFromInputs` works the bearing out again from the latest camera sighting among the prior's inputs (facing plus exit edge, `bearingFromExit`), so the bearing needs no new incident field and every rebuild keeps it. `sightings.ts` exports its event base as `commandEventBase` for this.
- Source: plan Task 18c (confirmClip: event, incident patch, priorVersion); spec 12.1 Confirmation.
- Verified: `src/data/cameraSighting.test.ts` (9 tests: the 25-field event, no place, the confirmation pairing, bearing from inputs only, no facing or top edge gives none, latest input wins, the patch with and without a place) failed first (module missing), then passed; `sightings.test.ts` still passes; typecheck clean. scripts/ci-local.sh exit 0.

### feat(prior): rebuild the ring prior from a confirmed camera sighting with the wedge on
- What: `prior/cameraPrior.ts` `cameraPriorWrites`: one batch that rebuilds the ring prior from the camera's place (the start stays when the camera was not placed), turns the direction-of-travel wedge on when the clip gives a bearing (otherwise keeps the stored setting), adds the sighting to `priorInputEventIds` and raises the prior version. `PriorWrites.incident` may now carry `ipp` and `priorInputEventIds`.
- Source: plan Task 18c; spec 12.1 ("moves the start pin, turns on the wedge (rings), raises priorVersion").
- Verified: `src/prior/cameraPrior.test.ts` (segment numbers equal `buildPrior` run directly at the camera with the wedge and bearing 0; the no-place, no-bearing case keeps start and wedge) failed first (module missing), then passed; `rebuild.test.ts` still passes; typecheck clean. scripts/ci-local.sh exit 0.

### feat(camera): add the clip panel with the reading's card and Confirm sighting
- What: `camera/CameraClipPanel.tsx` runs the intake, then shows the reading's card with "Confirm sighting" and "Discard". Confirm hands the reading and what was entered to the post once, is not awaited, and then says "Confirmed. Prior rebuilt as vN." (or "on this laptop ... Sending." until the server has it); a refused write says "The sighting was not saved. Try again." The harness page now shows the panel.
- Source: plan Task 18c ("Confirm writes the camera_sighting and confirmation events, applies the incident patch").
- Verified: new harness test "Confirm hands the reading on once and reports the rebuilt prior" passes (bearing 0, camera at segment AB, status v8, Confirm gone); with the panel's send state removed it failed (mutant check, since the test first ran after the panel existed); the three earlier clip harness tests still pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(web): read and confirm a camera clip at the command post
- What: the post gets "Add camera clip" beside "Add sighting" (the camera's place comes from a map click or the Place list, like a sighting). Reading binds the three required consents to the clip's SHA-256 and runs `readClip` against Firestore, Storage and the cloud model (`cloud_model_web`), tracing a fresh read as hybrid-inference. Confirm writes the camera sighting and its confirmation, then one batch that rebuilds the ring prior from the camera with the wedge on. The direction of travel is now worked out from the camera sightings among the prior's inputs, so the layer switches enable "Direction of travel" when one exists and every ring rebuild keeps the bearing (it was always null before).
- Source: plan Task 18c, Steps 3 and 6.
- Verified: typecheck clean; build clean; on the local preview the layout, axe (including the joined post) and focus checks pass (11). The live read of the generated clip runs against the deployed site next. scripts/ci-local.sh exit 0.

### test(e2e): read a fresh generated clip on the live site end to end
- What: `e2e/clip.spec.ts` (deployed-only): joins the drill, adds a camera clip with the three required consents and reads it. The clip is generated per run (`make-moving-box.sh` now takes an output path and the square's height, so each run's clip has new bytes and a new SHA-256). The test requires exactly one AI Logic request, carrying the clip inline as `video/mp4` and answered 200, then "Couldn't read this clip. Nothing changed." (the clip has no person) with the match code unchanged.
- Source: plan Task 18c Step 6 (a deployed check, with a generated clip until the staged clips exist).
- Verified: passed against the live site at c03fa8e. A first version reused one clip across runs and failed on the second run with "The clip was not read. Try again.": the earlier run's user had left a consent-only record (no person, so no reading), and the rules let only a record's creator renew it; this is reported separately and the test now uses a fresh clip. The clip harness tests still pass. scripts/ci-local.sh exit 0.

### docs(evidence): record that clip times stay counted from the clip start under video offsets
- What: `docs/evidence/web/2026-11-18-video-offsets.json`: one live AI Logic call with a 20 s synthetic clip (a red square visible 8.0 to 12.0 s) sent inline with `videoMetadata` 6 s to 14 s. `gemini-3.5-flash-lite` answered first 00:08, last 00:11: counted from the clip's start, not the window's (that would read 00:02). n = 1, stated as such.
- Source: P-39 decision (a): settle the timestamp question with one live call before the triage sends windows.
- Verified: the call answered in 3,463 ms through the web SDK with App Check and a signed-in user; the spike page and spec were temporary and removed (tree clean after). scripts/ci-local.sh exit 0.

### feat(camera): find the moving spans of a clip from sampled grey frames
- What: `camera/motion.ts` `motionWindows` (P-39 triage, step one, no model): grey frames sampled every 0.5 s at 64 x 36 are compared in pairs after removing the whole-frame brightness change (so an exposure shift is not motion); pairs whose mean local change is above a low floor (0.004, provisional until measured on the staged clips) form spans, spans less than 1 s apart merge, each is padded by 1 s within the clip, and the four strongest are kept in time order with their peak time.
- Source: promoted item P-39 ("pixel differencing finds motion windows").
- Verified: `src/camera/motion.test.ts` (6 tests on synthetic frames: still with noise, exposure ramp, one crossing with its padded span and peak, two crossings apart and clamped to the clip, two close crossings merged, at most four windows in time order) failed first (module missing), then passed; typecheck clean. scripts/ci-local.sh exit 0.

### feat(ai): let the clip read cover only a window of seconds through video offsets
- What: `clipParts` and `clipCloudGenerator` take an optional window (seconds from the clip's start); with one, the inline video part carries `videoMetadata` start and end offsets, so the model reads only those seconds. Its times stay counted from the clip's start (the one live call recorded in docs/evidence/web/2026-11-18-video-offsets.json), so the sighting checks against the clip's length are unchanged. Nothing passes a window yet; triage does next.
- Source: P-39 decision (a), videoMetadata offsets.
- Verified: the new `clipParts` window test failed first (no videoMetadata), then passed; the generator pass-through test failed with the window dropped (mutant) and passes as written; typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): count changed cells so a small figure is not lost in a still frame
- What: `motionWindows` now counts the cells whose grey value changed by more than 0.06 beyond the frame's mean change, and a pair of samples is motion when 4 or more cells changed (`changedCells`, exported). The earlier measure averaged the change over all 2,304 cells, so a small or distant figure was diluted by the still background. Both thresholds stay provisional until measured on the staged clips.
- Source: a probe of real decoded frames in Chrome: the generated clip's 40 x 40 box gave a mean change of 0.0043 per sample against the old 0.004 floor, a pass by a hair, while a still clip gave 0.
- Verified: new test "counts a small mover" (8 of 2,304 cells) failed first under the mean measure, then passed; the six earlier motion tests still pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(camera): sample a local clip's frames for triage and take one frame as a JPEG
- What: `camera/frames.ts`: `sampleFrames` decodes a clip on this laptop with a <video> element from a local object URL and returns grey frames every 0.5 s at 64 x 36 plus the clip's length; `jpegAt` returns one frame as a JPEG (longest side at most 768 px) for the laptop's model. Nothing leaves the browser. A dev-only harness page (`web/harness/frames.html`) exposes both to tests.
- Source: promoted item P-39 (frames for pixel differencing and the on-device frame check).
- Verified: `e2e/harness/frames.spec.ts` on clips generated with ffmpeg: the moving clip gives 12 samples of 2,304 cells over 6 s, every pair at least 4 changed cells, one span 0 to 6 s; the still clip gives none; a frame comes out as JPEG bytes. The sampler was written before this spec (a throwaway probe came first), so a mutant check: sampling every 1 s instead failed the moving-clip test. scripts/ci-local.sh exit 0.

### feat(camera): triage a clip on this laptop before any of it leaves
- What: `ai/frameCheck.ts` (the frame check: `ONLY_ON_DEVICE`, image input, one boolean "personVisible", options shared with the gate), `frameCheckGenerator` in `ai/client.ts` (with the unreachable base URL, like every private on-device read) and `camera/triage.ts` `triageClip`: without the built-in model it samples nothing ("no-model"); a still clip asks no model ("no-motion"); otherwise one frame per moving span, at its peak, goes to this laptop's model; no person anywhere gives "no-person"; any person gives "flagged" with the window from the first flagged span's start to the last one's end. An answer it cannot read counts as a person, so none is missed for it; a failed check or an undecodable clip gives "unavailable". Not yet in the panel.
- Source: promoted item P-39 ("Gemma 4 on device checks one JPEG frame per window. Only flagged windows go to Gemini in the cloud."); the private-data gate for any on-device frame read.
- Verified: `src/camera/triage.test.ts` (9 tests with fakes: params and parser, no model samples nothing, still clip asks no model, one check per span at its peak, flagged span only, every flagged span covered, unreadable answer counts as a person, failures end triage) and the `frameGeneratorFor` test failed first (modules and export missing), then passed; typecheck clean. Not measured on a real built-in model (none on this Mac). scripts/ci-local.sh exit 0.

### feat(ai): cache a no-sighting clip result and take over a stalled clip record
- What: per the ruling on stalled clip records and the shared schema and rules (500e574, fc6e005, merged): a reply with no usable sighting now completes the record with the typed result `{ status: "no_sighting", reasons }` (the check's reason codes, or `unreadable_reply`), so the next seat gets "Couldn't read this clip" from the record with no model call; a model or network failure still leaves the record open. A record with no reading, from anyone, is taken over: the writer becomes its owner with their own consent, expiry and createdAt, every other field unchanged (`takeOverConsent`, replacing `renewConsent`). `readClip` also takes the triage window (passed to the model) and the route's reason (default `sdk_only_in_cloud`).
- Source: review ruling (b) + (a) on the cross-seat finding; the ClipNoSighting schema and takeover rule.
- Verified: new and changed tests (takeover by another user's stalled record keeps stored fields and sets the writer as owner; failed checks and an unreadable reply stored as no-sighting with their reasons; window and reason passed through) failed first, then passed (27 in clipRead and clips tests); a stored no-sighting result returns with only a lookup; typecheck clean. scripts/ci-local.sh exit 0.

### test(e2e): read the same clip twice live and require no second model call
- What: the live clip test reads its fresh no-person clip a second time and requires "Couldn't read this clip. Nothing changed." again with still exactly one AI Logic request in the run: the first read stored the typed no-sighting result, so the second comes from the record.
- Source: ruling (b) on stalled clip records (ed004b6).
- Also: the test no longer compares the match code before and after (other live tests write to the same drill incident in parallel, and the code changed under it once); it requires that no camera-sighting card appears, so there is nothing to confirm.
- Verified: passed against the live site built from ed004b6 (that deploy was stamped dirty because this spec was uncommitted; redeployed clean right after). The first ci-local attempt failed on a 32 s timeout in scripts/test_emulator_config.py (the backend's emulator test; it passes alone in 3.6 s and this change touches no script), then scripts/ci-local.sh exit 0.

### feat(camera): triage a clip in the intake before sending, with a consented override
- What: when the post gives the intake a triage step, "Read clip" first checks the clip on this laptop ("Checking on this laptop"). No motion: "Nothing moves in this clip. Nothing was sent." No person: "No person found on this laptop. Nothing was sent." Both offer "Read in the cloud anyway", which sends the clip with the consents already given and the reason `user_override_after_triage`. A flagged clip goes to the cloud read with only its flagged seconds and the reason `on_device_triage_flagged`. Without the built-in model, or when triage fails, the clip goes to the plain consented read as before. The panel passes the triage step and the read's window and reason through. The harness page's `?triage=` mode gives fixed triage answers.
- Source: promoted item P-39; review ruling on the override's own reason.
- Verified: four new harness tests (no person: nothing passed on, then the override with its reason; still clip: nothing passed on; flagged: window 1 to 5 s with its reason; no model: plain read) failed first (no triage step), then passed; the four earlier clip harness tests still pass; typecheck clean. Unmeasured on a real built-in model. scripts/ci-local.sh exit 0.

### feat(camera): give the triage results that send nothing a route for the trace
- What: `triageRoute`: a still clip is recorded as a code decision (path rules, model "motion-check", reason `triage_no_motion`, no model asked); no person as this laptop's model (path on_device, "chrome-built-in", `on_device_triage_no_person`). These routes go only to the hybrid-inference trace and are never stored; a flagged or plain read is traced by the cloud read itself.
- Source: review ruling (a route record must never imply a model judged a static clip); the shared route reasons (23fde93).
- Verified: three `triageRoute` tests failed first (export missing), then passed (12 in triage.test.ts); typecheck clean. scripts/ci-local.sh exit 0.

### feat(web): run clip triage on this laptop before a camera clip is sent
- What: the post gives the clip panel its triage step: only when the gate says this laptop's model is available (`FRAME_OPTS`), the clip's frames are decoded here, one frame per moving span is checked on the laptop's model (`frameCheckGenerator`, no cloud fallback), and a result that sends nothing is traced with its route. The cloud read now carries triage's window and reason (`on_device_triage_flagged` or `user_override_after_triage`) into the stored route. On a browser without the built-in model nothing changes: the plain consented read. Unmeasured on a real built-in model.
- Source: promoted item P-39.
- Verified: typecheck and build clean; the deployed suite runs right after this commit (on this Mac's Chrome there is no built-in model, so the live clip test takes the plain path). scripts/ci-local.sh exit 0.

### feat(extras): add the person-in-view band model for a clip timeline
- What: `web/src/extras/clip/band.ts` (extras Task 10, P-40, owned by the web command post now): the cloud reading's first seen to last seen as one interval, clamped to the clip's length, at least 2 px wide, scaled to the last interval and marked open ended when the length is unknown, with the key frame's mark; "Person in view 00:10 to 02:14" or "No person seen.". Intervals from on-device checks keep their own source, but none are stored or passed today (triage keeps no per-window checks).
- Source: hand-off H4 (review: no extras session, the web command post owns it).
- Verified: `src/extras/clip/band.test.ts` (8 tests, the plan's seven plus the text) failed first (module missing), then passed. scripts/ci-local.sh exit 0.

### feat(camera): show the person-in-view band on the sighting card, opening the clip at a click
- What: `ClipBand` (an SVG strip: the cloud reading's span solid, on-device spans hatched if ever passed, the key frame marked) sits under the card's three facts. A click on the band opens the local clip at that second; Enter opens it at the first second the person is in view; "See the frame" still opens the key frame, and the model's box is drawn only there. The panel passes the clip's length.
- Source: hand-off H4.
- Verified: new harness test (band text "Person in view 00:01 to 00:05"; a click at the middle of a 6 s clip shows second 3 with no box; Enter shows second 1) failed first (no band), then passed; the eight earlier clip harness tests still pass; typecheck clean. scripts/ci-local.sh exit 0.

### docs(web): reword changelog sources for the public repository
- What: in `web/CHANGELOG.md` and `web/CHANGELOG-EXTRAS.md`, the names of internal process roles are replaced by plain wording with the same meaning ("review ruling", "reviewed before commit", "run in review", "Review fix before commit"). Text only; history is not rewritten.
- Source: the public-hygiene guard (scripts/hygiene_guard.py), ahead of the repository going public.
- Verified: the guard reports no hits in web/ (it reported 13 before: 4 in CHANGELOG.md, 9 in CHANGELOG-EXTRAS.md). scripts/ci-local.sh exit 0.

### test(harness): add a page that measures clip triage in a browser with the built-in model
- What: dev-only `web/harness/triage.html`: runs the real triage (the gate's answer for the frame check's options, the frame sampler, one on-device frame check per moving span) on a clip the dev server serves (`?clip=`), with a bare Firebase app (no App Check, no sign-in), and reports the gate's answer, samples and their decode time, each check's second, time and answer, the result, and every request the page made to a Google or Firebase host outside its own origin. For measuring in an installed Chrome that has the built-in model.
- Source: review request to measure P-39 triage on a real built-in model before any number is used.
- Verified: `e2e/harness/triage.spec.ts`: in Playwright's Chrome profile (no built-in model) the page stops at the gate: result no-model, 0 samples, 0 checks, 0 Google requests. A first version counted the dev server's own module URLs (they contain "firebase") as Google requests; it now matches external hosts only. scripts/ci-local.sh exit 0.

### test(harness): report the gate's text-only answer on the triage measurement page
- What: the triage measurement page also reports the gate's answer for text-only input (`textOnlyAvailability`), which tells "no built-in model here" apart from "the model is here but image input is not ready". Asking downloads nothing.
- Source: the first measurement in an installed Chrome answered "downloadable" for the frame check's options.
- Verified: the page's gate test still passes. In the installed Chrome connected to this Mac (2026-11-18), both answers were "downloadable": no built-in model is present in that profile, so triage stopped at the gate with 0 samples, 0 checks and 0 Google requests; no download was started. scripts/ci-local.sh exit 0.

### feat(ai): read a sighting note in the cloud through the server prompt template
- What: the consented cloud read of a sighting note now calls the server prompt template (`getTemplateGenerativeModel`, `{ templateId, templateVariables: { note } }`): only the template id and the phone-scrubbed note leave the laptop; the template (`shared/templates/pls-sighting-note-v1.json`, published with the backend) holds the model, temperature 0, the instruction and the output schema. The reply is validated exactly as before. New Remote Config key `sighting_template_id` (default "pls-sighting-note-v1"; anything that is not a plain name falls back), added to `remoteconfig.template.json` so the key check passes. The inline cloud parameters are removed; the on-device read keeps its own instruction, so that text stays in the bundle.
- Source: W2 (server prompt templates), the template 0c7b28c and its go.
- Verified: the RC tests (default, typed read, malformed ids fall back, every parsed value has a reader), the `templateGeneratorFor` test and a parity test (the template's output fields, lists and caps equal the client's `SIGHTING_CUES_JSON`) failed first, then passed (35); typecheck clean; scripts/check_rc_keys.py ok (11 keys). The live 200 through templateGenerateContent is checked after the merge to main and a deploy from main. scripts/ci-local.sh exit 0.

### feat(web): say what the product does on the join page and send judges to /judge
- What: under the wordmark on the join page: "Plans where to search for a missing person, and updates the map as reports come in." and a "Judges: start here" link to /judge.
- Source: judge-door review (a judge landed on a join form with no code and no way forward).
- Verified: the new e2e test (purpose line, link target, link opens the judge's door) fails against the live site's old join page and passes on the local preview; the join page's layout-shift, axe and phone-fit checks pass. scripts/ci-local.sh exit 0.

### feat(judge): fold the model's source and the Chrome note under Details, with a time zone
- What: /judge keeps "Cloud model now: ..." in view and moves where it came from ("Chosen by Remote Config (fetched 14:05:09 EST) ...") and the Chrome measurement note into one closed "Details" line. The fetch time now carries its time zone (`fetchedTime`, 24-hour clock).
- Source: judge-door review (fewer words on the judge's screen; a time without a zone is ambiguous).
- Verified: the `fetchedTime` test (EST and UTC) failed first, then passed; the judge e2e test (source line hidden until Details opens, then a time with a zone, and the Chrome note inside) fails against the live site's old page and passes on the local preview. scripts/ci-local.sh exit 0.

### feat(web): label the header's code MATCH so it does not read as the join code
- What: the post's header label beside the convergence code reads "MATCH" instead of "Code".
- Source: design review (D11: the header label read like the join code).
- Verified: the phone layout test now requires "MATCH" in the header and no "Code" label; it failed first, then passed on the local preview. scripts/ci-local.sh exit 0.

### fix(theme): draw ghost buttons with an fg-4 border so their edge is visible
- What: `.btn.ghost` borders use fg-4 (#898583) instead of the line color (#403c3a), so a ghost control's edge stands out on the dark ground.
- Source: design review (ghost button border fg-4).
- Verified: new harness test (the Walkers button's border is rgb(137, 133, 131)) failed first (rgb(64, 60, 58)), then passed; the prior-switch and clip harness tests and axe and contrast on the preview still pass. scripts/ci-local.sh exit 0.

### test(e2e): require 44 px join fields on phones
- What: the phone-fit test now requires the join page's Incident id and Join code fields to be at least 44 px tall at 390 px wide. The CSS rule for it (`input` other than checkboxes and radios, and `select`, at least 44 px on phones) went in with 5b01fdf by mistake, bundled with the ghost-border change, because both edits sat in base.css when that commit staged the file; this entry records it.
- Source: design review (join inputs 44 px on phones).
- Verified: the test failed first on the preview (fields under 44 px), then passed with the rule. scripts/ci-local.sh exit 0.

### feat(web): serve /llms.txt describing the site and where a judge starts
- What: `web/public/llms.txt`: what Point Last Seen is (a search-planning tool; hybrid inference with private reads kept on the laptop and cloud reads only after a consent tap; drill data only) and links to /judge and the command post.
- Source: design review (/llms.txt).
- Verified: new test (200, text/plain, starts with "# Point Last Seen", links /judge) failed first (404), then passed on the preview. scripts/ci-local.sh exit 0.

### docs(evidence): record the first on-device clip triage runs in Chrome, synthetic clips only
- What: `docs/evidence/web/2026-11-18-triage-chrome.json`: four runs of the triage measurement page in an installed Chrome 157 with the built-in model (downloaded through the site's own button), on three generated clips with no person. Zero Google or Firebase requests in every run; a warm frame check about 1 s (949 and 1,069 ms), the first after the download 18.0 s; sampling 12 frames in 37 to 45 ms, 40 in 158 ms; a still clip ends at no-motion with no model asked. The model said a person was visible in a red square: a false positive, so the person check is recorded as not validated until the staged clips exist.
- Source: request to measure P-39 on a real built-in model before any number is used.
- Verified: values copied from the page's own report in each run. scripts/ci-local.sh exit 0.

### fix(camera): clear clip consent on a new file and withdraw a held override when consent changes
- What: choosing a clip resets all four consents (consent is given for one clip), and changing any consent while triage holds a clip clears the hold, so "Read in the cloud anyway" can never send with consent that was withdrawn or given for another file.
- Source: second-model review of PR #16, finding 1 (high): consent carried over to a different file and survived being unchecked.
- Verified: two new harness tests (all consents cleared after choosing another file, Read disabled; unchecking cloud consent removes the override and nothing is passed on) failed first, then passed; all 11 clip harness tests pass. scripts/ci-local.sh exit 0.

### fix(camera): pass the flagged window to the cloud model instead of dropping it
- What: the post wrapped the clip generator in `(b64, m) => generate(b64, m)`, which dropped triage's window, so a flagged clip reached the model with no video offsets while its route said `on_device_triage_flagged`. The read's dependencies now come from `clipReadDeps(firestoreClipIo(...), clipCloudGenerator(...))`, which passes the generator through unchanged. The claim stays "the model reads only the flagged seconds": the whole clip is still in the request (offsets, not trimming).
- Source: second-model review of PR #16, finding 4 (medium).
- Verified: new test (readClip through `clipReadDeps` with a flagged window: the generator receives the window) failed first (factory missing), then passed; the generator test already pins that a window becomes `videoMetadata` in the request; typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): read the cloud pause live and check it again before the clip upload
- What: `readClip` checks the cloud pause again right after the consent record is saved, before the Storage upload; and the post's check reads the latest activated Remote Config through a ref instead of the value from the render that started the read. A pause that arrives mid-read now stops it before the clip leaves the laptop.
- Source: second-model review of PR #16, finding 5 (medium).
- Verified: new test (the pause turns on during the consent write: refused with "Clip reading is paused right now.", no upload) failed first, then passed (21 in clipRead.test.ts); typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): build every Confirm write before writing, and drop the wedge with no bearing
- What: `cameraConfirmWrites` builds the camera sighting, its confirmation and the rebuilt prior before anything is written; the post writes only after all three exist, so a prior that cannot be built leaves no sighting in the log. When the newest camera sighting gives no direction (facing not known, or a top or bottom edge), the stored direction-of-travel wedge is turned off: before, a second clip with no bearing kept the wedge on, the rebuild refused ("The wedge needs a confirmed direction of travel.", web/src/prior/rebuild.ts), and the two events had already been written. Writing the events and the prior as one atomic batch is not done: the events go through the create-only event writer with its own retry and state tracking.
- Source: second-model review of PR #16, finding 3 (high).
- Verified: new tests (the stored wedge goes off with no bearing; `cameraConfirmWrites` returns the two events and the prior with the sighting as an input; it throws, returning nothing, when part cannot be built) failed first, then passed (5 in cameraPrior.test.ts); typecheck clean; clip harness passes. scripts/ci-local.sh exit 0.

### fix(walkers): refuse a walker result that finishes after the prior moved on
- What: the walker prior is written only if the incident's prior version is still the one the run started from (`runAgainstVersion`, read through a ref to the latest incident). Before, a run that finished after another rebuild (for example a confirmed camera clip) was written as the same next version from the old start point and inputs, over the newer prior. The panel shows "The prior changed while the walkers ran. Run them again." This closes the case on one laptop; a write from another laptop at the same version needs a server-side version check (asked of the backend).
- Source: second-model review of PR #16, finding 2 (high).
- Verified: two new tests (an unchanged version returns the result; a version that moved during the run is refused with that sentence) failed first (export missing), then passed; typecheck clean; walker and prior-switch harness tests pass. scripts/ci-local.sh exit 0.

### fix(prior): record rings as the model whenever the ring prior is rebuilt
- What: `priorWrites` (every ring rebuild) now writes `priorModel: "rings"`, so a layer or distance-table change made while Walkers was on no longer leaves the stored model and the controls saying Walkers over a ring table. With Walkers on, the layer switches ask "Rebuild the prior as rings?" before doing it.
- Source: second-model review of PR #16, finding 6 (medium).
- Verified: the rebuild test (incident write includes priorModel rings) and a new layers harness test (the question names rings when Walkers is on) failed first, then passed; typecheck clean. scripts/ci-local.sh exit 0.

### fix(prior): rebuild with the incident's engine parameters instead of the defaults
- What: `rebuildPrior` takes the incident's `engineParams` (default only when the incident has none) for both the prior and its ring baseline; the ring button, the layer switches and Confirm on a camera clip all pass them. Before, every rebuild silently used the default ring radii and weights, so an incident seeded with its own parameters got a different table after any rebuild.
- Source: second-model review of PR #16, finding 7 (medium).
- Verified: new test (with ring radii a quarter of the default, the rebuild and its baseline equal `buildPrior` run with those parameters and differ from the default rebuild) failed first, then passed (17 prior tests); typecheck clean. scripts/ci-local.sh exit 0.

### fix(plans): refuse to approve before the plan history has come from the server
- What: the post knows when its plan history is loaded: after the first plans snapshot from the server (an empty one counts; it stays loaded if the link drops later). Until then `approveNow` refuses with "The plan history is still loading. Approve again in a moment.", and the plan panel shows a refusal's own sentence instead of a generic one. Before, a fresh seat could approve while the plans listener was still empty and take v1 when v1 already existed. A seat that opens fully offline cannot approve until it has been online once; allocating the version on reconnect is not done.
- Source: second-model review of PR #16, finding 8 (medium).
- Verified: new tests (approve refused and nothing written before loading; a cache-only snapshot does not count, a server snapshot does and stays) failed first, then passed (23); the offline-approval and change e2e pass on the local preview; typecheck clean. scripts/ci-local.sh exit 0.

### fix(prior): say Sending until the server acknowledges the write, not the local snapshot
- What: the layer switches, the Rings/Walkers switch and the camera clip panel now say "Prior rebuilt as vN." only when that write's own acknowledgement arrives. Before, they compared against the incident's prior version, which a queued local write advances at once, so "Sending" disappeared offline while other seats still had the old prior. The panels no longer take a priorVersion prop.
- Source: second-model review of PR #16, finding 9 (medium).
- Verified: new layers harness test (after Rebuild prior the status stays "... Sending." until the harness's "Server acknowledges" settles the write, then "Prior rebuilt as v5.") failed first (it showed rebuilt at once), then passed; the 20 layers, prior-switch and clip harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(judge): start a practice search through startJudgeSession and refresh the sign-in
- What: `data/practice.ts`: `practiceSearch` calls the `startJudgeSession` callable (backend; App Check enforced, capped, a sandbox that expires), checks the answer is a command seat on a `judge-` incident, then refreshes the ID token so the new claims apply, and returns the incident. `practiceErrorMessage` shows the server's own sentences for its refusals (one new practice search per hour, full for today, none available), names a lost connection or a browser that could not be checked, and is plain otherwise.
- Source: judge-door review item (b); the startJudgeSession contract.
- Verified: `src/data/practice.test.ts` (call then refresh, in that order; a non-practice or non-command answer refused; the error sentences) failed first (module missing), then passed. scripts/ci-local.sh exit 0.

### feat(judge): offer a practice search first on /judge and label the practice incident
- What: /judge opens with "Try a practice search": one sentence (a training incident on a real park map with the real engine; add one sighting and watch the map and the plan change) and a button that signs in, starts the browser's own practice incident and opens the command post on it, with no code. "No published run yet." is said once (the Numbers section is hidden until there is a run). The post's header shows the incident's own drill label, so a practice incident reads "Training drill. Practice search; nobody is missing.".
- Source: judge-door review item (b) (a judge had a join form with no code, and the page said "No published run yet." twice).
- Verified: two new e2e tests on the local preview against the live callable (the page offers the practice search and says "No published run yet." once; the button lands on /?incident=judge-..., the header shows the practice label and MATCH, segments draw) failed first, then passed; all six judge tests pass. scripts/ci-local.sh exit 0.

### test(ai): pin the plain plan-wording message for an HTTP 500 from AI Logic
- What: a test that a 500 from AI Logic (how the proxy returns the before-generate guard refusing a model off the allow-list) gives the plan's fixed wording and "The cloud step did not answer. The plan below uses fixed wording.", never the raw error. The other cloud reads already turn any thrown error into a plain sentence: the photo ("Couldn't read this photo."), the sighting note ("The note could not be read. Fill the fields by hand.") and the clip ("The clip was not read. Try again.").
- Source: the backend's note on the guard's error shape.
- Verified: passes as written; with the fallback sentence replaced by the raw error (mutant) it fails. scripts/ci-local.sh exit 0.

### ci(web): run the browser checks that need no backend on every web pull request
- What: the `web` workflow now installs Playwright's Chromium and runs `e2e/ci.config.ts` against its placeholder-config build: the tests tagged `@no-backend` (judge page offers the practice search and says once that no run is published; join page purpose and judges link; /llms.txt; phone fit on the join page; product name on both pages; axe on the join and judge pages at 1,440 and 390 px). The specs that need a joined drill (layout, contrast, focus, offline) wait for CI test keys, which need Stephen's yes.
- Source: review item 5, option 2 (run what needs no Firebase now).
- Verified: locally, a build with the workflow's exact placeholder values, served by `vite preview`, with Playwright's bundled Chromium: 9 passed. scripts/ci-local.sh exit 0 (it does not run Playwright; the browser step was run by hand as above).

### fix(camera): lock the clip form before reading the file, so consent cannot change mid-read
- What: pressing "Read clip" now locks the form (consents, file, everything) before the file is read into memory; before, the lock came only after that await, so consent unchecked in between was not seen and the read went ahead with the old consent. A second press during a read does nothing.
- Source: second-model review of PR #16, round 2, finding 1 (high).
- Verified: new harness test (with the page's file read slowed to 1.5 s, the "Cloud reading" box and the file input are disabled within 300 ms of the press, and the read gets the consents as given) failed first (still enabled), then passed; all 12 clip harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): write the camera sighting, its confirmation and the prior in one batch
- What: Confirm now commits the camera sighting, its confirmation, every segment, ROW and the incident in one Firestore batch (`writePrior` takes the events; `priorBatchOps` lists the operations, events as creates with the server's time). The server takes all of them or none, so a refused sighting (for example its clip record deleted meanwhile) can no longer leave a confirmation and a prior pointing at it, and the panel's ack now covers the sighting too.
- Source: second-model review of PR #16, round 2, finding 3 (high).
- Verified: `src/prior/write.test.ts` (one operation list: segments, ROW, the incident update, then the two event creates with the server timestamp; no events gives the plain prior batch) failed first (export missing), then passed; typecheck clean. Not run live: a live Confirm needs a staged clip with a person; the all-or-nothing outcome rests on Firestore batch semantics. scripts/ci-local.sh exit 0.

### fix(camera): check the cloud pause again right before the clip upload
- What: on a retry, `readClip` asks Storage whether the clip is already stored, then checks the live cloud pause once more immediately before uploading. Before, the last check came before that lookup, so a pause that arrived during it still let the clip upload.
- Source: second-model review of PR #16, round 2, finding 5 (medium).
- Verified: new test (the pause turns on during the stored-clip lookup: refused, no upload) failed first, then passed (22 in clipRead.test.ts); typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): store a no-sighting result only for a full-clip read
- What: a read limited to triage's flagged seconds that finds no usable sighting now leaves the clip record open instead of storing `no_sighting`. The record is keyed by the clip's hash alone, so a stored miss from a window would have answered a later full-clip read (from a seat without on-device triage) with "Couldn't read" even if the person appears elsewhere in the clip. A full-clip miss is still stored and cached.
- Source: second-model review of PR #16, round 2, finding 4 (medium).
- Verified: new test (a windowed read with no person ends could-not-read with no completion written) failed first, then passed (23 in clipRead.test.ts); typecheck clean. scripts/ci-local.sh exit 0.

### fix(prior): apply a write's result only while it is the latest one sent
- What: the layer switches, the Rings/Walkers switch and the clip panel number each submission and apply its acknowledgement or refusal only if it is still the latest one, so a refused older rebuild can no longer clear a newer rebuild's "Sending" or show its error over it.
- Source: second-model review of PR #16, round 2, finding 7 (medium).
- Verified: new layers harness test (two rebuilds v5 and v6; refusing the first leaves "v6. Sending." with no alert; acknowledging the second shows "Prior rebuilt as v6.") failed first, then passed; the layers harness now numbers rebuilds and can refuse the first; 22 layers, prior-switch and clip harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(prior): say another seat updated the map when a stale prior write is refused
- What: the rules now refuse a prior batch that does not raise the prior version by exactly one (security rules, 04b9565), which means another seat rebuilt first. The layer switches and the Rings/Walkers switch show "Another seat updated the map. Showing the newer one." for that refusal (`priorRefusalMessage`), and "The prior was not saved. Try again." for anything else.
- Source: the priorVersion rule; review round 2, finding 2 (closed by that rule plus the local guard in 0158e35).
- Verified: new layers harness test (a rebuild refused with permission-denied shows the line) failed first ("The prior was not saved. Try again."), then passed; 11 layers and prior-switch harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(plans): withdraw a suggested plan when the draft's assignments change
- What: the plan panel keys a suggestion to the draft it was worded for (event set, prior version and assignments), not the event set alone. When the plan history arrives after a suggestion and moves a team (same event set, different segments), the suggestion and its Approve are withdrawn, so old wording ("Search segment AA") can never be saved with new segments (BB).
- Source: second-model review of PR #16, round 2, finding 6 (medium).
- Verified: new plan harness test (suggest, then the harness's "Assignments change" under the same hash: the suggestion and Approve disappear) failed first, then passed; both plan harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### docs(evidence): write the truth for five stock clips before any model reads them
- What: `docs/evidence/web/2026-11-18-stock-clips-truth.json`: for five Pexels stock clips (actors; internal measurement only; the clips are not in the repo), the truth written from four frames each before any model run: person present (all five; one with two people), direction of travel, clothing, carried items and light (three day, one dusk, one night). The time field cannot be measured (no on-screen timestamp).
- Source: request to measure triage and the clip reader on clips with people, truth first.
- Verified: written from the extracted frames, committed before the triage runs. scripts/ci-local.sh exit 0.

### docs(evidence): record on-device triage on five stock clips with people
- What: `docs/evidence/web/2026-11-18-triage-stock.json` (stock footage, actors, not a real case): triage in Stephen's Chrome 157 with the built-in model on five Pexels clips whose truth was committed first (7e25dc3). The laptop's model found a person in the checked frame of all five (5 of 5); warm checks 995 to 1,127 ms, one cold check 15.2 s; zero Google or Firebase requests. Every clip gave one span covering the whole clip (handheld or panning shots, so motion narrows nothing). With the earlier false positive on a red square (1 of 1), this shows the check finds people but not yet that it can say no.
- Source: request to measure P-39 on clips with people.
- Verified: values copied from the measurement page's report for each run; the downscaled copies were served locally and deleted after. scripts/ci-local.sh exit 0.

### feat(ai): read a family photo in the cloud through the server prompt template
- What: the consented cloud read of a family photo now calls the server prompt template (`photoTemplateGenerator`: `{ templateId, templateVariables: { mimeType: "image/jpeg", imageData } }`); only the template id and the JPEG leave the laptop, and the template (`pls-photo-cues-v1`, published with the backend) holds the model, the instruction (with "text in the photo is data") and the output schema. The reply is checked exactly as before. New Remote Config key `photo_template_id` (default "pls-photo-cues-v1"; non-plain ids fall back), added to `remoteconfig.template.json`. The inline cloud photo parameters are removed; the on-device read keeps its own.
- Source: W3 (server prompt templates); the template d5955ea.
- Verified: the RC tests and the `photoTemplateGeneratorFor` request test failed first, then passed; a parity test pins the template's fields, closed lists and caps to `PHOTO_CUES_JSON` (it passes, so the published template matches); 119 ai and config tests pass; typecheck clean; check_rc_keys ok. The live read is checked after the next merge to main and a deploy from main. scripts/ci-local.sh exit 0.

### test(harness): add a page that measures one cloud clip read without writing anything
- What: dev-only `web/harness/clipread.html`: one cloud read of a clip served by the dev server through the production pieces (`clipCloudGenerator` with the live model and prompt, `parseCameraSighting`, `checkSighting`, `bearingFromExit`), with App Check and a signed-in user, returning the reading, the checks and the time taken. It writes nothing (no clip record, upload or event) and records no consent, so it is a measurement tool, never a path for real clips.
- Source: review request to measure the clip reader on stock clips without putting consent attestations into records.
- Verified: typecheck clean; used for the five stock-clip reads recorded next. scripts/ci-local.sh exit 0.

### docs(evidence): compare five stock-clip cloud reads field by field with the truth
- What: `docs/evidence/web/2026-11-18-clipread-stock.json` (stock footage, actors, not a real case): the production clip read on five Pexels clips against the truth committed first (7e25dc3). Person present 5 of 5, direction 4 of 5, top colour 3 of 5, bottom colour 3 of 4 scored, carried items 4 of 5, light 5 of 5; all five readings passed the checks; 2.8 to 7.0 s each. The misses: teal read as blue; on the two-person dusk clip the reading described one person (direction unknown, rust read as yellow, the bag missed). Time, bearing and night colour suppression are not measurable on these clips, so this is not a SCAM.json input.
- Source: review request (S-CAM on stock clips, truth first).
- Verified: values from the page's reports; per-field hits judged against the truth file. scripts/ci-local.sh exit 0.

### feat(data): count, delete and describe an incident's clips and photos
- What: `data/media.ts`: `countMedia` lists the incident's clips and photos in Storage (members may list both); `deleteQuestion` asks with the counts ("Delete 4 clips and 3 photos for this search? This can't be undone.", nothing when there is nothing); `deleteMediaNow` calls the `deleteIncidentMediaNow` callable (backend; command only, live incident) and returns its total; `deletedLine` states that total; `deleteMediaMessage` shows the server's own refusal sentences, names a lost connection, and is plain otherwise.
- Source: review ruling on deleteIncidentMediaNow (one control, counts in the confirm, the server's reason on a refusal).
- Verified: `src/data/media.test.ts` (5 tests) failed first (module missing), then passed; typecheck clean. scripts/ci-local.sh exit 0.

### feat(command): add the delete-media control that asks with counts and reports the result
- What: `command/DeleteMedia.tsx`: counts the search's clips and photos once when opened, asks "Delete N clips and M photos for this search? This can't be undone." with "Delete now" and "Cancel" (or says there are none, with no delete), then shows what the server removed or the server's own reason for a refusal. A dev-only harness page (`web/harness/delete.html`) runs it with fakes; nothing is deleted there. Not yet in the menu.
- Source: review ruling on deleteIncidentMediaNow.
- Verified: `e2e/harness/delete-media.spec.ts` (question with counts then "Deleted 14 items: ..."; Cancel runs nothing; a refusal shows "Only the incident's command can delete its media."; nothing stored offers no delete) failed first (component missing), then passed; a first version re-counted on every parent render and overwrote the result, now it counts once. scripts/ci-local.sh exit 0.

### feat(web): put Delete this search's clips and photos in the More menu
- What: the command post's More menu gets "Delete this search's clips and photos", which opens the delete-media control in a dialog (counts from Storage, then the `deleteIncidentMediaNow` callable). It is only in this menu, never on the working screen; the server checks the caller. The dock takes the control through an optional `deleteMedia` prop and imports it through the extras host module (now `hostApp.ts`), as the extras boundary requires.
- Source: review ruling on deleteIncidentMediaNow.
- Verified: two new extras tests on the dock harness with fakes (the item opens a dialog asking "Delete 2 clips and 1 photo ..."; Cancel runs nothing; Delete now runs once and shows "Deleted 6 items: ...") pass, with the 8 earlier extras tests; the extras import guard passes after routing through the host module (it failed on the first, direct import); typecheck clean. scripts/ci-local.sh exit 0.

### fix(plans): drop a suggestion reply that arrives after the draft changed
- What: the plan panel keeps each model reply with the draft (event set, prior version, assignments) it was asked for, and shows it, and lets Approve use it, only while that draft is still current. Before, the panel cleared the card when the draft changed, but a reply that arrived afterwards put the old wording back, and Approve could save the new assignments with the old instructions.
- Source: second-model review of PR #16, round 3, finding 1 (high).
- Verified: new plan harness test (with the model answering only on a button: suggest, change the assignments, then the model answers: no suggestion and no Approve) failed first, then passed; all three plan harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### test(profile): expect stop_calling_name as the third default approach note
- What: the shared approach notes now carry `stop_calling_name` ("If they may not come when called, stop calling their name.", shown when `may_not_respond` is), third in their order. The web card and the printed sheets render notes by id, so it shows with no code change; the default-notes test pinned exactly two and now expects the three, and a new test checks that a family answer of "answers when called" (`mayNotRespond: false`) removes both name-calling notes.
- Source: field-expert input (search and rescue practitioner), with the shared note from the field-expert branch.
- Verified: the old pin failed on the new shared notes (three, not two); the updated test and the new one pass; 12 profile unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(data): complete an incident's engine settings with the engine defaults
- What: the command post reads the incident through `incidentFromDoc`, which completes the stored `engineParams` with `withEngineDefaults` from the engine. An incident saved before urban rings existed now has them when its terrain is urban, stored values are kept, and an incident with no stored settings gets the defaults; every reader and rebuild sees the same complete settings. Prior writes only read `engineParams`, so nothing new is written.
- Source: review of the field-expert branch (urban terrain).
- Verified: `src/data/incidentDoc.test.ts` (old rings gain urban and keep a stored column; nothing stored gives the defaults; the rest of the incident is unchanged) failed first (missing), then passed; 448 web unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(command): offer Urban first in the distance table and name the column in use
- What: the prior's distance table lists "Urban (suburb, town, big park)" first, then "Temperate flat" and "Temperate mountain" (`command/terrains.ts`), so an urban incident, which new incidents now are, has its own option and shows it chosen. The rings' source line names the column in use and its sample size, for example "Urban rings, ISRID dementia (n = 336), measured in a straight line."; before it always said n = 175. The sizes (urban 336, flat 175, mountain 95) are the ones the shared source line states, and a test checks them against it. An incident with no stored terrain still reads as temperate flat, the column its stored prior was built with.
- Source: field-expert input (Atlanta suburbs and parks are urban) and review of the field-expert branch.
- Verified: `src/command/terrains.test.ts` (order and label, sizes parsed from the shared source line, the line per column) failed first (missing), then passed; new layers harness test (`?terrain=urban`: Urban chosen, the three options in order, the urban line) fails against the previous picker (value "temperate_flat") and passes now; 8 layers harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(data): keep a profile's other names when command saves the profile
- What: `sharedFromDoc` now keeps `otherNames` (string entries only) when the stored shared profile has the list, and adds none when it does not. The shared document is replaced whole on save, so before this a command edit to any field (clothing, say) wrote the profile back without the list and erased the names the family app saved. The engine's `profileForSearchers` writes the list back with `nickname` mirrored from its first entry.
- Source: review of the field-expert branch (other names).
- Verified: two new profile tests (a clothing edit at command keeps all five names and the mirrored nickname; only string names are read, and no list appears when none was stored) failed first (the list read as undefined), then passed; 14 profile tests and 453 web unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(profile): save only the fields command changed, so family edits are kept
- What: the profile form keeps the profile as it was when it opened, and Save writes only the fields that differ from it (`profilePatch`), merged into each document that already exists (`writeProfile`). A document that does not exist yet is written whole, since the rules check the complete shared document. Before, Save wrote a whole snapshot of both documents, so a name, or any other field, that the family app changed while the form was open was erased.
- Source: review of the field-expert branch, round 2, finding 1 (high).
- Verified: three new `profilePatch` tests (opened with the family's names, a clothing edit writes only the clothing; a flag change writes the flags and the approach notes it changes; a command-only field touches only the command document) failed first (missing), then passed; 456 web unit tests and the profile harness test pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(profile): show the family's names list instead of a nickname field it would override
- What: when the profile has the family's list of other names, the form no longer shows a Nickname field: the nickname mirrors the list's first entry on every save, so an edit there was silently dropped. It shows the list instead, read-only, through `namesToCall`: "Names they answer to: Bea, Mom, Roberta. The family keeps this list in their app." Without a list, the Nickname field works as before.
- Source: review of the field-expert branch, round 2, finding 3.
- Verified: the profile harness gets `?names=1`; the new test (no Nickname field, the list line) failed first, then passed; a second test checks the field is still there without a list; 3 profile harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(command): name custom ring radii as custom instead of crediting ISRID
- What: the rings' source line credits ISRID only while the incident's stored radii for its terrain are the sourced ones (`DEFAULT_PARAMS.rings`). Radii stored differently are named with their values: "Urban rings, custom radii (0.5, 1, 2.5, 10 km), not the ISRID table, measured in a straight line." The picker takes the incident's stored radii (`rings`, from `engineParams` completed with the defaults).
- Source: review of the field-expert branch, round 2, finding 5.
- Verified: two new `terrains.test.ts` cases (the sourced radii keep the ISRID line; other radii give the custom line) failed first for the custom case, then passed; the new layers harness test (`?rings=custom`) failed first, then passed; 9 layers harness tests and 5 terrain unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(profile): save over the server's current profile in one transaction
- What: the profile form's Save now runs one Firestore transaction over both profile documents read from the server (`writeProfile`), and `mergeProfileSave` decides what to write: only the fields command changed since the form opened, applied onto the profile as the server holds it now, with flags applied one by one. A family edit that lands meanwhile makes the transaction retry with it, so it is never overwritten, whichever writes first; an absent document is created only when the server says it is absent; offline, the save fails and says so. The family's names list, when the server has one, is kept and its first entry stays the nickname, so a stale nickname edit here gives way while the other edits still land. Missing fields of an older document are filled with their empty values, so the written document is complete and valid. The approach notes are worked out again from the merged profile in the same write, so a family flag set meanwhile (fall risk, say) keeps its note. These three fixes share the one merge and save path, so they are one commit.
- Source: review of the field-expert branch, round 3, findings 1 (high), 2 and 3.
- Verified: seven new `mergeProfileSave` tests (family created the profile after the form opened; family changed the names after; a legacy document with only a nickname; a family flag set meanwhile keeps its note; a nickname edit gives way to a names list; nothing changed writes nothing; an absent document is created) failed first (missing), then passed; 465 web unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(command): show invalid stored ring radii as invalid settings instead of crashing
- What: the rings' source line now checks the incident's stored radii with the engine's own rule (one radius per ring mass, each finite, positive and larger than the last) before formatting them. A column that is not a list, or is empty, short, non-finite, non-positive or out of order, shows "Urban rings: the radii stored for this incident are not valid settings (4 increasing positive distances are needed)." and the command post stays usable. Before, a non-list column threw during render and took the post down, and empty, NaN or Infinity columns were shown as custom radii although the engine refuses them.
- Source: review of the field-expert branch, round 3, finding 6.
- Verified: two new `terrains.test.ts` tests (four non-list values; six unusable lists) failed first, then passed; 7 terrain unit tests and 9 layers harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): release the clip form when the chosen file can no longer be read
- What: the clip form locks before its first await (so consent cannot change mid-read), but a file that became unreadable after it was chosen made `arrayBuffer()` reject outside any handler, leaving the form, Cancel and the file picker locked. The read is now caught: the form says "This clip could not be read from this computer. Choose it again." and unlocks, and nothing is sent.
- Source: second-model review of PR #16, round 3, finding 3 (medium; follow-up after the merge).
- Verified: new clip harness test (arrayBuffer rejects: the alert shows, the file input and Cancel are enabled, the model was never asked) failed first, then passed; all 13 clip harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(prior): stop an older refused write from showing an alert beside a newer rebuild
- What: the prior switch now claims each attempt's id before its run starts (it claimed it after the run). Before, if the previous write was refused while the next run was still going, the old attempt still owned the status and left a refusal alert beside the newer, successful rebuild.
- Source: second-model review of PR #16, round 3, finding 5 (medium; follow-up after the merge).
- Verified: the prior-switch harness gets a `?race=1` mode (first write refused on a button, second run finishes on a button); the new test (Walkers v6 pending, Rings started, first write refused, second run finishes: "Prior rebuilt as v7." and no alert) failed first (one alert), then passed; all 5 prior-switch harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(prior): blame another seat for a refused write only after the server confirms it
- What: `writePrior` now classifies a refused batch. On a permission refusal it reads the incident from the server; only when the server's `priorVersion` is at least the version this write tried to save does it report `pls/prior-superseded`, which the post shows as "Another seat updated the map. Showing the newer one." Any other refusal (for example a closed incident, where the version did not move), an unreadable server, or another failure gets "The prior was not saved. Try again." Before, every permission refusal claimed a newer map was on screen. Applies to rebuilds, walker runs, layer changes and camera confirmations, which all write through `writePrior`.
- Source: second-model review of PR #16, round 3, finding 6 (medium; follow-up after the merge).
- Verified: `src/prior/refusal.test.ts` (6 tests: superseded only at the sent version or newer; original error when the version did not move, when the read fails or returns nothing; no server read for other failures; message for each) failed first (module missing), then passed. New layers harness test (an unconfirmed permission refusal shows the plain line) fails against the previous message code ("Another seat updated the map ...") and passes now; the harness gets an "Another seat saved first" button for the confirmed case, and that test still passes. 13 layers and prior-switch harness tests pass; 65 prior and command unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): let a full clip read past a windowed miss that older code stored
- What: a stored no-sighting result was final for its bytes. Code before the windowed-miss guard also stored a miss from a flagged window (route reason `on_device_triage_flagged`), which says nothing about the rest of the clip, so those records still blocked a full read. Such a record is now read again from the bytes on the laptop, inline, under the stored record's consent while it has not expired, and nothing is written: no consent takeover and no completion (a completed record is read-only under the rules), and no Storage check or upload (the upload rule needs the caller to own the record with 31 days left). Every other stored no-sighting stays final, and an old windowed miss whose consent has expired is not read again.
- Source: second-model review of PR #16, round 3, finding 4 (medium; follow-up after the merge).
- Verified: `src/ai/clipRead.test.ts` new tests (old windowed miss then a full read: calls are find then model only, no window, read result not cached, nothing written; expired consent: no model call; full-clip miss stays final) failed first for the re-read case (the miss blocked it), then again after tightening it to no Storage calls, then passed; 109 ai unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(plans): withdraw a suggestion when the ranked probabilities change
- What: the plan panel's draft key now includes the ranked probabilities (`draft.rank`, which the model reads to write each reason) as well as the event set, prior version and assignments. Before, when another seat's rebuild reached the segments before the incident, the probabilities could change while the key stayed the same, and Approve could save reasons worded for the old values.
- Source: second-model review of PR #16, round 4 (medium; follow-up after the merge).
- Verified: the plan harness gets a "Probabilities change" button (same hash, version and assignments; new rank); the new delayed-reply test (suggest, probabilities change, model answers: no card, no Approve) failed first (the card showed), then passed. The earlier delayed-reply test now waits for "Suggest plan" to be enabled again instead of 200 ms, as the review suggested. 4 plan harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(ai): send the 2,048-token output cap on every direct cloud call
- What: the clip read and the plan wording, the web app's two direct cloud calls, now send `maxOutputTokens: 2048` (`ai/limits.ts` `CLOUD_MAX_OUTPUT_TOKENS`). The server's before-generate guard rewrites a request to its cap only below its media size limit; above it (a clip over about 6.75 MB, 9,000,000 base64 characters) the request passed as sent with no limit, so its output was unbounded. Smaller requests are unchanged in effect: the guard already set 2,048 on them. Template calls (sighting note, photo cues) and on-device calls are not affected.
- Source: security review of the guard's large-media path; the guard keeps its exception until every direct caller sends a limit.
- Verified: `src/ai/limits.test.ts` (the cap equals the guard's `MAX_OUTPUT_TOKENS`, read from the guard's source; both direct calls send it) failed first (module missing), then passed; 111 ai unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(photos): stop deleted photos being read in the cloud or given a reading
- What: the command post loads a search's photos into its tray once, so after "Delete this search's clips and photos" a seat still held the JPEG bytes: a cloud read could send them to Gemini and a family answer could save a new reading for a deleted photo. Now: (1) right before a cloud read, the post checks the photo is still in Storage (`photoStillStored`, `stillStored` in `data/photos.ts`); if it is gone the tray says "This photo was deleted." and nothing is sent, and if the check cannot run nothing is sent either. This holds for every seat, including one that loaded the tray before another seat deleted. (2) A family answer is refused with the same sentence when the photo is confirmed gone; when the check cannot run (link down) the save is queued as before, so an offline answer is not lost. (3) After a delete attempt this seat's tray remounts empty (its reads and pending results go with it) and reloads from Storage.
- Source: second-model review of PR #20, finding 1 (high).
- Verified: `stillStored` unit tests (present, gone, a failed check throws) failed first (missing), then passed; two new photo tray harness tests (a cloud read and an answer for a deleted photo both show "This photo was deleted.") fail against the previous tray and pass now; 4 photo harness tests and 11 photo unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): re-read the clip's consent record right before the clip is sent
- What: a clip read now reads its consent record again right before the bytes go to the model, on every path, and sends nothing when the record is gone or expired ("The consent record for this clip was deleted. Nothing was sent."). Before, command could delete the record (with "Delete this search's clips and photos" or by deleting the reading) after the lookup or after the consent write, and the read still sent the clip; the re-read of an old windowed miss skipped both the consent write and the Storage check, so it had no check at all. The cloud pause is read once more after that lookup too.
- Source: second-model review of PR #20, finding 2 (high).
- Verified: two new `clipRead` tests (record deleted after the consent write and upload; an old windowed miss whose record is deleted after the first lookup) failed first, then passed: refused with that sentence and the model never called. The fake store now renews the record on the consent write, and every call-order test that reaches the model shows the second lookup before it. 113 ai unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(harness): remove the clip measurement page and bar cloud models from dev pages
- What: the dev-only measurement page (`web/harness/clipread.html`, `src/harness/clipReadHarness.ts`) fetched any clip URL it was given and sent it to the project's cloud model, with no consent record and no cloud pause, so a real clip served on the dev server could be sent by mistake. The stock measurement it existed for is done, so the page is removed (it is in git history at 3327d01, and the evidence file's method now says so). A new test, `src/harness/noCloud.test.ts`, fails if any dev harness page (`src/harness`, `src/extras/harness`) names one of the four cloud model builders (clip read, plan wording, sighting template, photo template); on-device builders stay allowed. It must walk at least 10 files, so an empty scan cannot pass.
- Source: second-model review of PR #20, finding 3 (medium).
- Verified: the new test failed first, naming `./clipReadHarness.ts: clipCloudGenerator`, then passed after the removal; typecheck clean. scripts/ci-local.sh exit 0.

### fix(command): offer to delete a search's saved records when no files remain
- What: "Delete this search's clips and photos" counted only the files in Storage, so when a clip's consent record was saved but its upload failed (no file), the dialog said there was nothing to delete and offered no Delete now, although the server call removes that record too. `countMedia` now also counts the clip and photo reading records (`getCountFromServer` on both collections). With files present the question is unchanged; with only records it asks "Delete N saved records for this search's clips and photos? This can't be undone."; with neither it still offers nothing.
- Source: second-model review of PR #20, finding 4 (medium).
- Verified: new `deleteQuestion` unit test (records only, singular and plural) failed first, then passed; new delete harness test (`?counts=0,0,2`: the records question and Delete now) passes, the harness's fake total now counts records, and the first test passes `4,3,7` for the same 14; the dock's prop type and its harness fake carry `records`; 6 media unit tests, 5 delete harness tests and 10 extras tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(prior): settle each prior write's Sending line by that write's own id
- What: the prior switch tracks which write's status line is on screen separately from the latest attempt. A write's own acknowledgement or refusal now settles its line even after a newer attempt has started; only the latest attempt may show a refusal alert. Before, if the earlier write was refused while the next run was going, its refusal was ignored, and if that next run then failed, the earlier version stayed on "Sending" although the server had refused it.
- Source: second-model review of PR #20, finding 7 (medium).
- Verified: the prior-switch harness gets `?race=fail` (the second run fails); the new test (v6 pending, Rings started, first write refused, second run fails: the run's error shows and no "Sending" line remains) failed first (one "Sending"), then passed; all 6 prior-switch harness tests pass, including the earlier race test (no alert beside a newer success); typecheck clean. scripts/ci-local.sh exit 0.

### fix(command): say when a delete is unconfirmed and count again before a retry
- What: the delete dialog no longer claims outcomes it cannot know. Only the server's own refusals ("Only the incident's command can delete its media.", "Sign in before ..."), which it gives before deleting anything, are shown as a refusal with the question kept. Any other failure (a lost connection, a timeout, an internal error) shows "The server did not confirm the delete. This shows what is stored now." and counts again before offering Delete now, because the server deletes files and records in steps and its reply can be lost after the delete finished. A reply without a whole, non-negative count no longer becomes "Deleted 0 items": it shows "The delete finished, but the server did not say how many items it removed." and counts again. Before, a lost connection said "Nothing was deleted".
- Source: second-model review of PR #20, finding 5 (medium).
- Verified: unit tests for `readDeletedCount`, `deletedLine(null)` and `deleteFailure` failed first (missing), then passed. The delete harness gets `?answer=unavailable|nocount` and `?after=`; two new tests (a lost reply: the unconfirmed line, the fresh count's question and Delete now; no count: the finished line and "There are no clips or photos for this search.") fail against the previous dialog (it showed "Deleted null items ...") and pass now; 7 delete harness tests, 8 media unit tests and 10 extras tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): offer a whole-clip read after the flagged seconds show no one
- What: when on-device triage flags part of a clip and the cloud read of those seconds finds no one, the form now says "No one was found in the flagged seconds. Nothing changed." and offers "Read the whole clip in the cloud", which reads the full clip (no window, route reason `user_override_after_triage`) with the consents already given; changing any consent withdraws it, as for the other held states. Before, the only retry was Read clip, which triaged again and read the same seconds. The windowed miss is not stored as final (be49d3d), so the full read goes ahead normally.
- Source: second-model review of PR #20, finding 6 (medium).
- Verified: new clip harness test through the form with triage on (flagged read, the sentence, then the whole-clip read with no window) failed first (it showed "Couldn't read this clip. Nothing changed."), then passed; a second test checks a consent change withdraws it; all 15 clip harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): confirm the clip's consent with the server, not a cache, before sending
- What: the last check before a clip goes to the model now reads the consent record from the server only (`confirmClipReading`, `getDocFromServer`). Before, it used `getDoc`, which can answer from the local cache when the server is unreachable, so a seat holding a cached record could pass after another seat deleted it. Now an unreachable server refuses ("Could not confirm this clip's consent with the server. Nothing was sent."), and a missing or expired record, or one missing any of the three required consents, refuses with the deleted-record sentence. Only synchronous checks run between that read and the model call.
- Source: second-model review of PR #20, round 2, finding 2 (high).
- Verified: new `clipRead` tests (the server read throws: refused, model never called; a record missing one consent: refused) failed first, then passed; the earlier revocation tests now drop the record at the server read; call-order tests show "confirm" right before the model; 227 ai and data unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): never write consent on a whole-clip retry; refuse when the record is gone
- What: "Read the whole clip in the cloud" (after the flagged seconds showed no one) is now a retry (`retry: true`). A retry never writes or renews a consent record and never uploads: it uses the record and the clip saved by the first read. If the record is gone (for example command deleted the search's clips) or the clip is no longer stored, it is refused with "The consent record for this clip was deleted. Nothing was sent.", and the family must consent again through a new read. Before, the retry reused the form's checked boxes, wrote a fresh consent record, uploaded the clip again and passed the final check, so a withdrawn consent came back.
- Source: second-model review of PR #20, round 2, finding 1 (high).
- Verified: three new `clipRead` tests (retry with the record gone: refused after one lookup, nothing written; retry with record and clip stored: no consent write, no upload, then the server check and the model; retry with the clip gone: refused, no upload) failed first, then passed; the clip harness test now expects the retry flag on the whole-clip read; 118 ai unit tests and 15 clip harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(photos): refuse a family answer when the photo cannot be checked
- What: a family answer is saved only after Storage confirms the photo is still there (`saveIfStillStored` in `data/photos.ts`). When the check cannot run (the link is down, say) the answer is refused with "Could not check this photo. The answer was not saved. Try again." and the answer buttons come back. Before, a failed check counted as "still there" and queued the save, which could land after another seat deleted the photo and bring its reading back. The two sentences now live in `data/photos.ts`; the tray re-exports `PHOTO_DELETED`.
- Source: second-model review of PR #20, round 2, finding 4 (medium).
- Verified: three `saveIfStillStored` unit tests (saves when stored; refuses when gone; refuses when the check throws, saving nothing) failed first (missing), then passed; the new photo tray harness test (`?unchecked=1`: the sentence and the buttons back) fails against the previous tray ("Not saved. Try again.") and passes now; 14 photo unit tests and 5 tray harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): say a flagged window gave no usable reading, not that no one was there
- What: after a windowed read that returns no usable sighting, the form says "No usable reading from the flagged seconds. Nothing changed." (still offering the whole-clip read). Before, it said "No one was found in the flagged seconds." for every such outcome, although a reply that could not be parsed or had impossible times takes the same path, so the sentence claimed a negative sighting the model never gave.
- Source: second-model review of PR #20, round 2, finding 7 (medium).
- Verified: the clip harness test, changed to the new sentence first, failed against the old wording, then passed; 15 clip harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(command): count what is left after every delete; never show a failed count as empty
- What: after any delete the dialog counts what is stored again before offering anything, and gives the server's total as the server's ("The server reports 14 items deleted: ..."), since two deletes running at once can both count the same files. "There are no clips or photos for this search." now shows only after a count that succeeded and found nothing. When a count fails it says so with an alert ("... what is stored now could not be counted. Close this and open it again to check.") and offers no Delete now. Before, a failed recount after a lost reply fell through to the empty-search sentence while media could remain.
- Source: second-model review of PR #20, round 2, finding 6 (medium).
- Verified: the updated `deletedLine` unit test and two harness tests (Delete now: the server's number, then the empty-search line from a fresh zero count; records only: the server's number) failed first against the old wording; the new harness test (`?countfail=after` after a lost reply: the alert, no empty-search line, no Delete now) failed first, then passed; 8 delete harness tests, 8 media unit tests and 10 extras tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(photos): empty every seat's photo tray when a delete is announced
- What: the command post's photo tray now lives in `usePhotoTray` (`photos/usePhotoTray.ts`). The server's delete sets the incident's `mediaRevokedAt` before it removes any file; every open seat already listens to the incident, and on a new value the tray empties, remounts (its reads and pending results go with it) and reloads from Storage. A load that started before the delete is ignored, so it cannot bring the deleted photos back. The seat that ran the delete does the same at once. Before, only that seat cleared its tray, and another seat kept showing the photos and could still read them on its laptop.
- Source: second-model review of PR #20, round 2, finding 5 (medium); the field is set by the server since ffe018c.
- Verified: a new harness page (`web/harness/tray-revoke.html`, fake store) and two tests (another seat's delete empties this tray; a reload that started before the delete and finishes after it does not bring the photos back) failed first (the hook was missing), then passed; `revokedAtMs` unit tests pass; 7 photo harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### docs(limits): state that a delete landing mid-send can still be read once
- What: `docs/LIMITS.md` (Media retention) now says what the browser can and cannot stop when a delete lands while another seat is sending: the checks right before a clip or photo leaves (the clip's consent record read from the server, all three consents and an unexpired expiry; the photo still in Storage), that only synchronous checks follow them, that a delete completing after the check answered and before the request reaches the model cannot be stopped from the browser, and that the result is then discarded (a clip's reading cannot be saved once its record is gone; a tray empties when the delete is announced).
- Source: second-model review of PR #20, round 2, finding 3 (high; ruled a stated limit once the window is as small as the browser can make it).
- Verified: each claim checked against the code: `confirmReading` (`getDocFromServer`) and the consent checks in `ai/clipRead.ts` run right before `generate` with no await between; `photoStillStored` runs right before the photo read; `completeClipReading` is an update that fails on a missing record; `usePhotoTray` empties on `mediaRevokedAt`. scripts/ci-local.sh exit 0.

### test(harness): also bar dev pages from building a model straight from the SDK
- What: the dev-page guard (`src/harness/noCloud.test.ts`) also fails when a harness page imports `getGenerativeModel` or `getTemplateGenerativeModel` from `firebase/ai`, which would build a model around the app's builders. Importing `getAI` alone, as the triage page does to hand an instance to the on-device frame check, stays allowed.
- Source: second-model review of PR #20, round 2 (note: the four-name scan missed a direct SDK import).
- Verified: a planted page importing `getGenerativeModel` from `firebase/ai` made the guard fail naming it; with the page removed it passes; a first, broader version flagged the triage page's `getAI` import and was narrowed to the model builders. scripts/ci-local.sh exit 0.

### fix(camera): require the stored clip before re-reading an old windowed miss
- What: re-reading a no-sighting result that older code stored for a flagged window now first checks the clip is still in Storage, and refuses ("The consent record for this clip was deleted. Nothing was sent.") when it is gone. It still uploads nothing. Before, that path skipped Storage entirely, so a clip whose file had been deleted while its record remained could still be sent from the bytes on the laptop.
- Source: second-model review of PR #20, round 3, finding 2 (high).
- Verified: the legacy re-read test now expects the Storage check before the server check and the model, and a new test (clip gone: refused after the lookup and the check, model never called) failed first, then passed; 119 ai unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): treat every later read of a clip as a retry; untick consents on a delete
- What: once a staged clip has reached the cloud (a reading, a no-sighting result or a model failure, so its consent record exists), every later read of it from the form goes out as a retry, plain "Read clip" included, so it uses that record and can never create or renew consent. When this search's media is deleted (`revocation`, the tray's delete epoch: this seat's delete or one announced through `mediaRevokedAt`), the form unticks every consent, drops the held whole-clip read, says "This search's clips and photos were deleted. Give the consents again to read a clip.", and the next read with fresh ticks is a new read. Before, pressing "Read clip" again after a flagged window could recreate a withdrawn consent from boxes still ticked. The reset runs in a layout effect: as a plain effect it ran after paint, and a test's fresh ticks landed first and were then undone.
- Source: second-model review of PR #20, round 3, finding 1 (high).
- Verified: three new clip harness tests (a second "Read clip" after a flagged miss is a retry; "Media deleted" unticks all three and removes the whole-clip read; after fresh ticks the next read is not a retry) failed first where they should (the first two), then passed; the third first passed against the old code and then failed on the late reset, which the layout effect fixed; 18 clip harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(photos): read a photo in the cloud only with the family's own consent record
- What: a cloud photo read now needs the family's consent for that photo: before anything is sent the post reads `incidents/{id}/photoConsents/{sha256}` from the server (`confirmPhotoConsent`, `getDocFromServer`; only the family member who shared the photo writes it) and uses it only when its `storagePath` is the photo's own path and its `cloudProcessing` mark is the sharer's (`photoConsentFromDoc`). With no such record the tray says "The family has not agreed to a cloud reading of this photo. It stays on this laptop."; when the server cannot be reached, "Could not check the family's consent with the server. Nothing was sent." Then the photo must still be in Storage, as before. Before, the post built the consent itself from the signed-in user and the clock. The confirm step now says "Sent only if the family agreed to a cloud reading when they shared it." and its button is "Send this photo to the cloud". On-device reads are unchanged. Until the family app writes these records, no photo is read in the cloud.
- Source: second-model review of PR #20, round 3, finding 3 (high); the record and its rules are shared (f2a43e6).
- Verified: `photoConsentFromDoc` unit tests (the sharer's own mark for this path; null with no record, another path, someone else's mark, a mark without a time, a bad creator) failed first (missing), then passed; the new photo tray harness test (`?consent=none`: the confirm copy, then the no-consent sentence) failed first, then passed; the two live-backend specs that click the confirm button use the new label (they need a seeded consent record to pass now); 241 ai, data and photo unit tests and 6 tray harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### test(harness): catch namespace and dynamic SDK imports in the dev-page guard
- What: the dev-page guard is now a function, `cloudOffenders`, with a control for each form. It flags the app's cloud builders, and the SDK's model builders (`getGenerativeModel`, `getTemplateGenerativeModel`) whenever a page loads `firebase/ai` in any way: a named, namespace or default import, a re-export, or a dynamic `import()`. Loading the SDK for `getAI` alone stays allowed. Before, only a named import was matched, so `import * as sdk` and a dynamic import passed.
- Source: second-model review of PR #20, round 3, finding 6 (medium).
- Verified: the previous pattern flags the named control and misses the namespace and dynamic ones (checked directly); the new controls (named, namespace, two dynamic forms, getAI alone) and the walk over every dev page pass. The controls name the builder without calling it, because the rules gate allows a call only in the AI client file. scripts/ci-local.sh exit 0.

### docs(limits): state the announce-before-delete window and the offline queued answer
- What: `docs/LIMITS.md` (Media retention) gains two stated limits: the delete is announced before its files are gone, so a seat's immediate reload can list a photo still being deleted until its next reload, while its cloud read and any answer for it stay refused once the consent record and file are removed; and a family answer confirmed against Storage is still a Firestore write, which can wait offline and land after a delete, bringing back the reading (cues and answer, never the image) until command deletes again.
- Source: second-model review of PR #20, round 3, findings 4 and 5 (medium, ruled stated limits).
- Verified: each claim checked against the code: `usePhotoTray` reloads on a new `mediaRevokedAt`; the cloud read needs `confirmPhotoConsent` and `photoStillStored`; `saveIfStillStored` checks Storage, then `savePhotoReading` is a `setDoc`. scripts/ci-local.sh exit 0.

### fix(camera): stop a clip read that a delete overtakes, at every step
- What: a clip read now holds only while the search's delete epoch is unchanged since the read was pressed. The form captures it at "Read clip" (and at the held-read buttons) and checks it after the file load, after triage and after the read returns; a result that comes back after a delete is dropped. `readClip` takes it as `stillCurrent` and checks it with the cloud pause at every step (start, around the consent write, around the upload, before the model call) and once more when the reply arrives, which is then discarded, never saved: "This search's clips and photos were deleted. Nothing was sent." Before, a delete landing during the file load or triage left the pending read holding the withdrawn consent, so it could write a new record, upload and send the clip.
- Source: second-model review of PR #20, round 4, finding 1 (high).
- Verified: three new `clipRead` tests (delete before the start: nothing called; during the consent write: no upload; during the model call: no completion) and two new clip harness tests (a delete while the file loads, with `arrayBuffer` held open; a delete while triage runs, `?slowtriage=1`: the model is never asked) failed first, then passed; 122 ai unit tests and 20 clip harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(photos): hash the bytes sent to the cloud and require them to match the consent
- What: the cloud photo read is one entry point, `readStoredPhotoInCloud` (`photos/cloudRead.ts`), used by the command post. It first hashes the exact bytes it would send (SHA-256) and refuses unless that hash equals the photo's name, which is also the id of the family's consent record ("This photo's file does not match its name, so it was not sent."); then the family's consent from the server; then the file still in Storage; only then the model. Before, the consent covered the hash taken from the file name while the bytes sent were never hashed, so a stored file whose content did not match its name could be sent under another photo's consent.
- Source: second-model review of PR #20, round 4, finding 3 (high).
- Verified: `src/photos/cloudRead.test.ts` with a generator that records its calls (consent for these exact bytes: one model call; a name that does not match the bytes: no call at all; no consent, an unreadable consent, a deleted file: no model call) failed first (module missing), then passed; 249 photo, data and ai unit tests and 6 tray harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(camera): leave retry mode off when a read failed before its consent was saved
- What: a failed clip read now says whether a consent record for the clip existed or was written before the failure (`recorded`). The form enters retry mode only for a reading, a no-sighting result or a failure with a record; a failure before the record was written (the first lookup or the consent write failing, say) leaves the next read a normal one. Before, any failure switched the clip to retry mode, and once the link came back the retry was refused because no record had ever existed.
- Source: second-model review of PR #20, round 4, finding 4 (medium).
- Verified: new `clipRead` tests (a failed lookup and a failed consent write report no record; a model failure, and a failure after finding another seat's record, report one) and two clip harness tests (`?outcome=failed-early`: the next read is not a retry; `failed-late`: it is), each waiting for the second call, failed first where they should, then passed; the harness counts its calls; 124 ai unit tests and 22 clip harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### test(camera): make two clip tests depend on the checks they name
- What: two tests now fail without their checks. The clip harness test "after a delete and fresh ticks, the next read is a new read" waits for the second read (the harness's call count reaching 2) before checking its options; before, it could read the first read's identical options and pass with no second read. The `clipRead` test for an old windowed miss whose record is deleted now stores the clip and asserts the calls `find, exists, confirm` with no model call; before, the missing clip refused the read before the consent check it names was reached.
- Source: second-model review of PR #20, round 4, finding 6 (medium).
- Verified: both pass on the current code; with the server consent refusal disabled the unit test fails (the model is called), and with the delete's retry reset removed the harness test fails (the read goes out as a retry); both files restored. scripts/ci-local.sh exit 0.

### test(harness): read dev-page imports from the syntax tree, not with a regex
- What: the dev-page guard reads each page's imports with the TypeScript parser (already a web dev dependency), so a comment before the module name, a template-string module name or a re-export can no longer hide a load of `firebase/ai`. It also flags any dynamic import whose module name is computed, since the scan cannot follow it and no dev page needs one. Loading the SDK for `getAI` alone stays allowed.
- Source: second-model review of PR #20, round 4, finding 7 (medium).
- Verified: new controls (a comment before the name, a template string, a re-export, a computed dynamic import) failed against the regex version, then passed; the earlier controls and the walk over every dev page still pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(prior): stamp each rebuilt prior with the server's build time
- What: every prior batch (`priorBatchOps`: ring rebuilds, layer changes, walker runs and camera Confirm) adds `priorBuiltAt: serverTimestamp()` to the incident update that carries the version step. The rules take the field only in a write that raises `priorVersion` by exactly one and only as the server's time; the exporter publishes it as `priorBuiltAtMs` for the replay.
- Source: shared rules for `priorBuiltAt` (live since ca5b51f).
- Verified: new `write.test.ts` test (the incident update has the version step and a server-timestamp `priorBuiltAt`) failed first, then passed; 27 prior unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### docs(config): cite the one-sample latency record behind the flash-lite rule
- What: the comment above `LIVE_MODEL` in `config/rc.ts` now says the 116 s figure is one sample (116,071 ms) and points at `docs/evidence/model-latency.md`, where the model and the record are now public. The comment does not name the model id, because the rules gate refuses that id on any live path. No code change.
- Source: evidence file published on main.
- Verified: the figures match the evidence table on main (one sample, 116,071 ms, 2026-11-17); a first wording that named the model id failed the rules gate ("banned on any live path") and was reworded. Typecheck clean. scripts/ci-local.sh exit 0.

### fix(judge): say a copy with no Firebase settings cannot start a practice search
- What: `readEnv` now throws a named `MissingConfigError` when the build has no Firebase settings, and the judge page's practice search says "This copy has no Firebase settings, so it cannot start a practice search. Use the live site." instead of "The practice search could not start. Try again.", which sent a fresh clone's visitor retrying something that can never work.
- Source: fresh-clone test of the repository.
- Verified: the new `practice.test.ts` test (an empty config throws `MissingConfigError`, and its message is the new sentence) failed first, then passed; the 10 practice and config unit tests pass; the judge page catches the error on both of its Firebase calls; typecheck clean. scripts/ci-local.sh exit 0.

### feat(photos): mark each tray photo with its own hash
- What: each photo row in the tray carries `data-sha256`, the photo's SHA-256, which is also its Storage name and the id of its family consent record. It is a public hash, not the image. The live photo specs read it to give the family's consent for exactly the photo they then read.
- Source: the live photo specs needed a consented cloud read (second-model review of PR #20, round 4, finding 5).
- Verified: the new photo tray harness test (both rows carry their hash) failed first, then passed; 7 tray harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(sightings): leave footwear and carried empty when a note read answers unknown
- What: a sighting-note read (on this laptop or in the cloud; both go through the same parser) now leaves Footwear and Carrying empty when the model answers "unknown" (any case, with spaces), which is how it says the note does not mention them. Before, the word "unknown" was written into both fields.
- Source: live judge walk of the command post.
- Verified: the new `sightingText` test (footwear "unknown" and carried " Unknown " read as empty) failed first, then passed; 14 sighting text unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### build(web): copy each grid's tiles and route graph from shared/grid into the build
- What: a build plugin (`src/buildinfo/gridFiles.ts`, `gridFilesPlugin`) copies `shared/grid/piedmont-park-dev.pmtiles` and `.graph.json`, where the grid builder commits them with their provenance and licence, into the build at `tiles/`, and serves the same files in dev. A missing file fails the build. Before, the files lived only in the gitignored `web/public/tiles/`, so a build from a clean checkout had no basemap and no route graph: the deploy of eff2db1 went out that way.
- Source: live judge walk (the map had no streets and Walkers was off) and the grid files committed to shared/grid.
- Verified: `src/buildinfo/gridFiles.test.ts` (both files under tiles/; a missing file fails the build) failed first (module missing), then passed; a real build with no `web/public/tiles/` emits both files byte-identical to shared/grid; and before shared/grid was merged in, the same build failed with "shared/grid/piedmont-park-dev.pmtiles is missing". scripts/ci-local.sh exit 0.

### test(smoke): check the deployed site serves the grid's tiles and route graph
- What: a deployed-only smoke test fetches `/tiles/piedmont-park-dev.pmtiles` (a range of its first bytes) and `/tiles/piedmont-park-dev.graph.json` and requires a real file each time: status 200 or 206, not `text/html`, the "PMTiles" magic bytes, and a non-empty JSON graph with `application/json`. Hosting now answers a missing tile with 404, never the app shell, so a deploy without its map fails here.
- Source: live judge walk (the tiles came back as the app shell).
- Verified: against the deployed eff2db1 site it failed ("text/html; charset=utf-8"); after the deploy of 00dccae it passes. scripts/ci-local.sh exit 0.

### fix(plans): build each team's task line from the plan; the model writes reasons only
- What: plan wording asks the model only for each team's reason and the summary (`PLAN_WORDING_JSON` no longer has a task line); each team's task line ("Search segment AC.") is built from the plan's own assignment (`taskTextFor`), and a task line the model sends anyway is ignored. `checkWording` also refuses a reason that names a segment the team was not given, and the fixed template is used instead. Before, only team ids were checked, so the model could tell a team to search one segment while the saved plan assigned another. The approval card shows the team, the code-built task line and the reason.
- Source: whole-repository review (Codex, Gemini), item 3 (high).
- Verified: three new tests (the model is asked for no task line; a task line naming another segment is replaced by the plan's; a reason naming another team's segment falls to the template, and with the segment check disabled that test fails) failed first where they should, then passed; 21 wording tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(plans): word plans on this laptop first, labelled by the route that ran
- What: plan wording now uses the SDK's PREFER_ON_DEVICE: Chrome's built-in model words the plan when the browser has it, and the cloud model only when it does not. The route records which one ran from the SDK's `inferenceSource`, never the mode asked for: on this laptop is `sdk_prefer_on_device`; the cloud is `on_device_unavailable`. The route glyph reads "On this laptop" (it read "This laptop") or "Cloud". The model now writes only reasons and the summary, so the smaller local model cannot misassign a segment.
- Source: whole-repository review, item 6 (decision: this laptop first); live judge walk, item 4 (the plan was labelled Cloud beside "Draft from this laptop").
- Verified: the updated `replanWording` tests (this-laptop-first mode; each route's reason) and a new plan harness test (`?route=cloud`: "Cloud"; `?route=on_device`: "On this laptop") failed first, then passed; 128 ai unit tests and all 79 harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(sightings): let command place a family sighting so it can move the map
- What: `placeFamilySighting` builds command's placement of a family sighting. The family app sends a sighting with no position and no effect ("needs command"), so it could never move the map. Events are create-only, so command writes its own sighting at the picked point: the family's time, words and reading, reported by the family, `positionSource: "map_click"`, linked to the original by `targetEventId`, and with the effect the engine derives for that point. Confirming it then moves the map like any command sighting. The review list (`sightingCards`) shows the placement in place of the family's unplaced report.
- Source: whole-repository review, item 1 (high).
- Verified: new tests (the placement keeps the family's report and links to it, and is strong evidence for the picked segment; an Android-shaped family sighting, placed and confirmed, raises segment AA's probability through the engine's `posterior`; the review list shows only the placement, ready to confirm) failed first (missing), then passed; 22 sighting and card unit tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(command): add Place on map for family sightings that have no place
- What: a sighting with no place (a family report) offers "Place on map" in the review list; it starts the map pick ("Click the map to place it."), and the click writes command's placement (`placeFamilySighting`) through the post's event writer. The placement then appears in the list with Confirm ready. Before, such a report showed "No place yet." with Confirm disabled and no way to place it.
- Source: whole-repository review, item 1 (high).
- Verified: a new harness page (`web/harness/sightings.html`) and two tests (an unplaced family report offers Place on map, Confirm waits, and pressing it hands over that report; a placed report offers no Place on map) failed first where they should, then passed; typecheck clean. scripts/ci-local.sh exit 0.

### feat(prior): confirm a family camera clip as command and rebuild the prior from it
- What: `familyCameraConfirmWrites` builds what command writes to apply a camera clip the family app read: command's confirmation of the family's `camera_sighting` and the camera prior, for one batch. The start point is the clip's camera place, or the place command picked when the family gave none ("Place the camera on the map first." otherwise); the direction comes from the clip's camera facing and the side the person left by (`bearingFromExit`). The family's event is not changed; its id joins the prior's inputs. `cameraReading` is now exported for it.
- Source: whole-repository review, item 2 (high).
- Verified: three new tests (a family clip with no camera pin, confirmed from the picked place: one command confirmation, the family event in the prior's inputs, the start point and the next version; the clip's own camera place is used when given; no place throws before anything is built) failed first (missing), then passed; 8 camera prior tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(sightings): list camera clips the family app read for command to apply
- What: the review list (`sightingCards`) now includes the family app's `camera_sighting` events as camera cards (`camera: true`). The family's own confirmation of its clip does not count as applied, since only command can rebuild the prior; a card is confirmed once command confirms it. Command's own camera clips stay out: they are applied when confirmed. Before, a family camera clip never reached the review list.
- Source: whole-repository review, item 2 (high).
- Verified: four new card tests (a family clip with the family's confirmation is awaiting and needs a place; command's confirmation makes it confirmed; command's own clips are left out; ordinary reports are not camera cards) failed first, then passed; 10 card tests pass; the sightings harness carries a family camera card for the panel; typecheck clean. scripts/ci-local.sh exit 0.

### feat(command): review and apply camera clips the family app read
- What: a camera clip from the family app shows in the review list as "Camera clip from the family, last seen HH:MM.", with what the clip saw (colours, footwear, carried items) and "Confirming rebuilds the map from the camera's place." With no camera place it offers "Place camera" (the map pick), kept on this post until Confirm since the family's event never changes, and Confirm waits for it. Confirm writes command's confirmation and the camera prior in one batch (`familyCameraConfirmWrites`, then `writePrior`); Reject is a plain rejection. A refused write shows "Not saved. Try again." beside the card.
- Source: whole-repository review, item 2 (high).
- Verified: a new sightings harness test (the family clip's line, what it saw, the rebuild sentence, Confirm disabled until placed, Place camera handing over the clip) failed first, then passed; 3 sightings harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(plans): read stored plans field by field instead of casting them
- What: `planFromDoc` checks every field a plan holds (integer version, text hash and approver, numeric prior version and time, a list of assignments each with a text team id, task, reason and a list of text segment ids, a route that is an object or null) and returns null when any is not what a plan holds, instead of handing an unchecked record to the plan panel.
- Source: whole-repository review, item 4 (medium).
- Verified: two new tests (a stored plan reads back; a numeric segment id, assignments that are not a list, an assignment with missing fields, a text version and a null record each give null) failed first (function missing), then passed; 15 plan tests pass. scripts/ci-local.sh exit 0.

### feat(command): say which plan records can't be read and keep their versions taken
- What: the plans listener reads each record through `planFromDoc` (`readPlans`), so a record that is not a plan never reaches the team list, the change marks, the draft or the extras views. The post shows "This plan record can't be read: plan 3. Teams show the newest plan that can." (one line naming every such record), and Approve counts those records' versions as taken, so the next plan does not collide with one the create-only rule already holds.
- Source: whole-repository review, item 4 (medium).
- Verified: new tests (records left out and named by id, plans oldest first; approval after unreadable 0002 writes version 3; the reducer keeps the ids and clears them on a denial; the line for one record, for two, and none) failed first (functions and field missing), then passed; 18 plan tests and the reducer tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(command): say a draft is past the plan limits before it can be suggested
- What: `planLimitLine` holds the plans rule's limits (at most 10 teams, at most 6 segments for one team, team ids of letters, digits and underscores up to 32). For a draft past them the plan card shows, for example, "A plan can name at most 10 teams. This draft has 11, so it can't be approved. Search with 10 teams or fewer." and Suggest plan is disabled, so no model call is spent on a plan the server would refuse and the refusal is never reported as "another plan was approved first". The plan harness takes `?teams=N`.
- Source: plans rule limits (at most 10 assignments), whole-repository review follow-up.
- Verified: three unit tests (10 teams pass; 11 teams, 7 segments for one team and an id with a space each give their line) and a plan harness test (11 teams: the line shows, Suggest plan is disabled, no Approve) failed first, then passed; 21 plan tests and 6 plan harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(judge): show the server's still-being-set-up answer for a practice search
- What: when startJudgeSession answers `unavailable` with "Your practice search is still being set up. Try again in a moment." (a second start during another's setup, or a failed copy that was released), the judge's door shows that sentence instead of "No connection", and the Try a practice search button is enabled again so the retry resumes the same daily slot. Any other `unavailable` still reads as a lost connection.
- Source: new error from the practice-search callable.
- Verified: a new case in `src/data/practice.test.ts` failed first ("No connection" received), then passed; 5 practice tests pass. scripts/ci-local.sh exit 0.

### ci(web): let the no-backend browser checks preview a build kept elsewhere
- What: `web/e2e/ci.config.ts` previews `PLS_PREVIEW_DIR` when it is set (`vite preview --outDir`), so the local CI mirror can build the placeholder web into a temporary folder and never overwrite a real `web/dist`. Unset, as in the workflow, it previews `web/dist` as before.
- Source: local CI mirror request.
- Verified: a placeholder build in a temporary folder with a marker file only there; `vite preview --outDir` on that folder served the marker; `PLS_PREVIEW_DIR=<folder> npx playwright test -c e2e/ci.config.ts` ran 9 checks, 9 passed. scripts/ci-local.sh exit 0.

### refactor(command): drop the listener for a server plan draft that is never written
- What: the post no longer listens to `planDrafts/{eventSetHash}`; no backend function writes that collection, so the draft always came from `localDraft` (the engine's team assignment on this laptop). The plan card now always reads "Draft from this laptop for the current reports.", and the comments that named a draft function that does not exist are gone.
- Source: review of the plan path against the deployed functions.
- Verified: typecheck clean; 21 plan unit tests and 6 plan harness tests pass. scripts/ci-local.sh exit 0.

### fix(judge): say the laptop's model is ready, not that it read anything
- What: Get this laptop ready only asks Chrome what its built-in model can take; it reads no note and no photo. The lines now say "The built-in model on this laptop is ready for the sighting note." (and "... and sample photos." when it takes images), with "It cannot read images, so photos stay on this laptop." for a text-only model. With no model, the line points at "The replay above shows a recorded drill run." instead of saying the replay runs in the cloud, which it does not.
- Source: judge-page claims review, item (c).
- Verified: the three d2Copy tests were changed to the new lines first and failed, then passed; 15 judge tests pass. scripts/ci-local.sh exit 0.

### feat(judge): check the published run with the replay's own reader
- What: `loadPublishedRun` no longer checks for ten field names; it runs the file through `fromPublishedRun`, the reader the replay uses. A file the reader accepts is a run; one it refuses comes back as `refused` with the reader's reason (for example "The run has no arrival time for a report."), and still reaches the replay section, which shows that reason. A file that is not a JSON object is `invalid`.
- Source: judge-page review, item (b).
- Verified: new loader tests (the harness run is accepted; one with a report missing its arrival time is refused with that reason; one with no reports is refused; a JSON array is invalid) failed first (a refused file read as a run, a run with no reports as invalid), then passed; 16 judge tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(judge): replay the published run in one section, or say why there is none
- What: the judge page no longer holds the replay behind a switch. A run the replay reader accepts plays in the replay section ("Watch the run over time", with its match code, map plates, time slider and the "Training drill. Nobody is missing." label); a run it refuses shows the reason there; with no file the page's own section says "No published run yet."; a file that is not JSON says "The published run file can't be read, so nothing is replayed and no numbers are shown."; a failed load says to reload. The page has one replay section in every state, the old "opens here once the sandbox is live" line is gone, the laptop line names the replay only when it plays, and the Numbers section shows only for an accepted run.
- Source: judge-page review, items (a) and (d).
- Verified: `e2e/judgeRun.spec.ts` (three no-backend tests serving the replay harness's made-up run, a copy with a report missing its arrival time, and a non-JSON file) failed first (the placeholder section was still drawn beside the replay; no unreadable line), then passed; against a placeholder build all 12 no-backend browser checks pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(judge): publish the development drill run at /evidence/published-run.json
- What: the site now serves its drill run (85,288 bytes, sha256 2811a59a89a8cdd3...), labelled "Development drill, Piedmont Park, Atlanta: the build's own test reports and plans, 2026-11-18 to 19. Training drill. Nobody is missing." It holds 24 reports, 18 plans and 68 segments, and the replay reader accepts it (no user ids, no stray fields), so the judge page replays it with its match code. The no-model laptop line now points at that replay. The "no published run" test serves a 404 for the file so it keeps testing that state.
- Source: judge-page review (the replay needs a published run to show).
- Verified: a new no-backend test (the built site serves the file as JSON with the drill label, and /judge replays it with no refusal) failed first (the preview answered with the app page), then passed; 13 of 13 no-backend browser checks pass against a placeholder build; the reader accepted the file in a one-off check before it was added. scripts/ci-local.sh exit 0.

### fix(judge): say which run is published without promising an unbuilt panel
- What: for an accepted run the Numbers section reads "Published run drill-dev-1-2026-11-19." (the file's own id); the sentence "The numbers panel is added with the recompute script." is gone, since that panel is not built.
- Source: review of the judge page copy.
- Verified: the served-run test now checks the Numbers line names the run and says nothing about a recompute; it failed first (the old sentence was there), then passed; 13 of 13 no-backend browser checks pass against a placeholder build. scripts/ci-local.sh exit 0.

### test(judge): pin the published run's match code at T43J
- What: the served-run test now requires the replay's end-frame match code to be T43J, the code of the committed file (24 reports, plan v18), instead of any four characters. A change to the engine or the replay reader that moves the judged map now fails this test; re-exporting the run changes the file and the code in the same commit.
- Source: review of the judge replay tests.
- Verified: a copy of the test pinned to T43K failed with "Received: T43J"; the T43J pin passes; 13 of 13 no-backend browser checks pass. scripts/ci-local.sh exit 0.

### test(photos): give the family's consent before the live cloud photo reads
- What: the deployed privacy positive control and the telemetry check now read the photo's own SHA-256 from the tray (`data-sha256`) and give the family's cloud consent for it the way the family app does (`e2e/familyConsent.ts`): an anonymous sign-in, the registered App Check debug token exchanged for a token, `joinIncident` as family with the drill's family code, then a create-only `photoConsents/{sha256}` record at the server's time. An earlier run's consent for the same photo is kept. The debug token and the code come from the environment and are never logged.
- Source: the consent gate before any cloud photo read.
- Verified: against the deployed site (aaae392), `privacy.spec.ts` and `telemetry.spec.ts`: 4 of 4 pass, including the consented cloud read sending exactly one signed AI Logic request with App Check; the run log holds no token. scripts/ci-local.sh exit 0.

### fix(command): point at Confirm when a saved sighting has not moved the map yet
- What: a likely sighting (high or medium) counts toward the map only once it is confirmed, so after saving one the change line now reads "Sighting saved. Confirm it under Sightings to move the map." instead of "Report logged. Map unchanged. Ask the team." A low-likelihood sighting, which never moves the map, keeps the old line. The judge page's practice text now says "Add a sighting, then confirm it under Sightings, and watch the map and the plan change." The deployed change spec accepts the new line.
- Source: live judge walk, item 2.
- Verified: a new changeModel test (a medium sighting with no move gives the Confirm line on screen and for screen readers; a low one keeps "Map unchanged") failed first, then passed; 6 change tests pass. scripts/ci-local.sh exit 0.

### fix(command): one precision for a change, and name confirmations in the change line
- What: the change line, the screen-reader line and the chip on the map now use the POA table's precision, one decimal (`formatPct`), so one move reads the same everywhere: "AC 1.4% to 1.8%.", "+0.4 pts", "POA 1.8 percent, up 0.4". Before, the line rounded to whole percents and the chip to whole points while the table showed tenths, so one change showed three different numbers. A move under a tenth of a point is no move at that precision. A change caused by a confirmation reads "after report: sighting confirmed" (or "Sighting rejected", or "Report withdrawn" for a retraction) instead of "after report: report".
- Source: live judge walk, item 3.
- Verified: changeModel tests changed to the new text and two new tests (a 1.4% to 1.8% move in line, chip and list; confirmation, rejection and withdrawal labels) failed first, then passed; 8 change tests pass; 82 harness browser tests pass with the change patterns updated. scripts/ci-local.sh exit 0.

### feat(map): draw each segment's code beside its dot
- What: every cell now carries its code (AA, BO, ...) in a small dark tag left of its dot, clear of the largest dot's 14 px radius, so a person can find and name a cell on the map that the table, the plan and the radio talk about. The code is its own marker, never part of the percent plate, so checks that read the plates are unchanged.
- Source: live judge walk, item 6.
- Verified: a new map harness test (24 codes for 24 cells, including the one left out of the POA; AB drawn once; the code ends at least 14 px left of its dot; no code inside a plate) failed first (no codes), then passed; 8 map harness tests and 42 extras browser tests pass; a screenshot of the harness grid checked by eye. scripts/ci-local.sh exit 0.

### fix(pwa): move an open page onto a new deploy when its worker takes over
- What: the service worker already skips waiting and claims open pages, but the page itself kept running the old build until the next visit, so a returning visitor saw a stale build right after a deploy. Now, when a new build's worker takes over a page the old one was serving, the page reloads once into the new build. If a field holds typed words, it shows "A new version of this page is ready." with a Reload button instead, so nothing typed is lost. A first visit (no worker yet) is left alone.
- Source: live judge walk, item 8.
- Verified: unit tests (`src/pwa/takeover.test.ts`: one reload on takeover, a question instead while words are typed, nothing on a first visit or without service workers; typed fields only) failed first (module missing), then passed; two no-backend browser tests on the preview build (a worker-controlled /judge reloads on takeover; the join page with a typed incident id shows the Reload line and keeps the text) pass, and both fail on a build with the watch removed. scripts/ci-local.sh exit 0.

### feat(judge): say what the product is in one line and link to the command post
- What: the judge page now opens with the same one line as the join page, "Plans where to search for a missing person, and updates the map as reports come in." (one shared constant, `PURPOSE_LINE`), and a Links row with "Command post" (home). The repository and the video are added to that row only once they are public, so the page never links to something a judge cannot open.
- Source: live judge walk, item 9.
- Verified: a new no-backend test (the purpose line, the home link, no repository or video link yet) failed first (no purpose line), then passed; 16 of 16 no-backend browser checks pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(command): say why a shared incident link still asks for the join code
- What: opening `/?incident=<id>` without a seat on that incident shows the join form with the id filled in (as before) and, above it, "This link names incident <id>. Enter its join code to open it: a link alone never opens an incident, so a forwarded link does not give anyone access." With no incident in the link there is no note.
- Source: live judge walk, item 10.
- Verified: two new no-backend tests (`e2e/sharedLink.spec.ts`: prefill plus the note; no note without a link) were written first; the prefill already held and the note test failed (no note), then passed; 18 of 18 no-backend browser checks pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(command): show the top 5 POA rows, with Show all for the rest
- What: the POA list shows the 5 most likely segments and the row for outside the mapped area, then "Show all 67" (the real count) to open the whole list and "Show top 5" to close it. On a phone the 67-row list had filled the page below the map. A list of 5 or fewer has no button.
- Source: live judge walk, item 7 (phone).
- Verified: two new rank harness tests (67 made-up rows show 5 plus the outside row, Show all opens 67, Show top 5 closes; a 4-row list has no button) were written first; the long-list test failed (67 rows shown), then passed; 4 rank harness tests pass, including the reorder slide. scripts/ci-local.sh exit 0.

### feat(map): keep only the most likely cells' labels when the map is crowded
- What: a cell's code and percent need about 56 px across to be read. When the median cell is narrower on screen (the whole park on a phone, or zoomed out on a laptop), only the 8 most likely cells keep their code and percent; zooming in past that width brings the rest back. The hidden labels stay in the page, so anything that reads the plates still finds every one. On the drill park at its first view the cells are about 30 px across, so before this the percents overlapped each other.
- Source: live judge walk, item 7 (phone), and the segment codes from item 6.
- Verified: unit tests (`src/map/labelDensity.test.ts`: dense below a 56 px median, the top cells by POA with ties by id) failed first (module missing), then passed; a map harness test at a 300 px wide viewport shows 8 codes and 8 percents, AB among them, with all 24 codes still in the page, and fails with the hiding rule removed (24 shown); 86 harness and 42 extras browser tests pass. scripts/ci-local.sh exit 0.

### fix(command): fit the post header in two lines on a phone
- What: under 900 px wide the header wraps: "Training drill. Nobody is missing." takes its own row, and the incident name, the match code and More share the second. At 390 px the drill line had been squeezed into four lines beside the other items (126 px of header).
- Source: live judge walk, item 7 (phone).
- Verified: a new deployed test (`e2e/phone.spec.ts`, 390 px: header at most 110 px, the drill line whole) failed on the deployed site at aaae392 (126 px); it is re-run on the deploy that carries this change. Harness map, beat, change and walker tests pass. scripts/ci-local.sh exit 0.

### fix(map): keep the lowest cells' labels above the map credit
- What: the first view now fits the grid with 64 px of room at the bottom (40 px on the other sides), so the percent plates and codes of the lowest row sit above the OpenStreetMap credit instead of under it.
- Source: live judge walk, item 7 (phone).
- Verified: a new deployed test (`e2e/phone.spec.ts`, 390 px: no visible plate or code overlaps the credit) failed on the deployed site at aaae392; it is re-run on the deploy that carries this change. Harness map, beat, change and walker tests pass. scripts/ci-local.sh exit 0.

### fix(map): place cell labels by collision instead of a width threshold
- What: the 8-cell rule still let the kept labels collide on a phone, because the most likely cells sit side by side. Labels are now placed in POA order, most likely first; a cell whose code or percent would cover a label already placed hides its own labels (its dot and fill stay). The labels a person sees never overlap, at any zoom, and zooming in brings hidden ones back. Hidden labels stay in the page for anything that reads the plates.
- Source: live check of the deployed map at 390 px after the previous change.
- Verified: unit tests for the placing (collision, a cell's code and percent as one unit, nothing hidden when nothing touches, POA order with ties by id) failed first, then passed; harness tests (at 300 px no two visible labels overlap, AB keeps its labels and all 24 codes stay in the page; at full size all 24 codes and 23 percents show) pass, and the overlap test fails with the hiding rule removed; 87 harness and 42 extras browser tests pass. scripts/ci-local.sh exit 0.

### test(e2e): wait for the first visible plate, not the first plate in the page
- What: the deployed specs that wait for the map (a11y, approve-offline, beat, change, judge, offline, phone, smoke) now wait for `.plate:visible`. A cell whose labels give way to a more likely cell's keeps its plate in the page but hidden, so the first plate in page order can be a hidden one, which made the two phone tests time out on the live site.
- Source: the live run of `e2e/phone.spec.ts` on 5f2b594.
- Verified: against the deployed site (5f2b594), phone, change and beat specs 5 of 5 pass (the phone tests had failed at their first wait). scripts/ci-local.sh exit 0.

### fix(command): keep More on the second header row on a phone
- What: on the phone header, a long incident name now shrinks with an ellipsis (full name still in the page), so the incident, the match code and More always share the second row. With "Development drill (synthetic)" More had wrapped to a third row (118 px of header).
- Source: live run of `e2e/phone.spec.ts` on 8e57c12 (118 px against the 110 px limit) and a screenshot.
- Verified: the deployed phone header test failed on 8e57c12; it is re-run on the deploy that carries this change. scripts/ci-local.sh exit 0.

### feat(data): ask the family a question and tell them searching or paused
- What: `data/familyQuestions.ts` for the command post's channel to the family. `askFamily` writes `incidents/{id}/familyQuestions/{id}` (a random 20-character id; the text, 1 to 280 characters, trimmed; the writer; the server's time) and `subscribeQuestions` reads them newest first with the family's answer once added (`questionFromDoc`). `tellFamily` sets `searchState` to "searching" or "paused" only; `searchStateOf` reads only those two. Three templates: "Did they ever go by another name?", "Places they used to walk or live?", "What were they wearing when you last saw them?". Nothing about whether the person was found, or their condition, goes through this channel.
- Source: field-expert input (search and rescue practitioner) and the shared family-channel rules.
- Verified: `src/data/familyQuestions.test.ts` (7 tests: templates, question length, ids the rules accept, the exact keys written, questions with and without an answer, only the two states) failed first (module missing), then passed; typecheck clean. scripts/ci-local.sh exit 0.

### feat(command): add the family section to ask questions and give the search state
- What: `command/FamilyChannel.tsx`, "Family": command tells the family the search is Searching or Paused (it asks first: "Tell the family the search is paused? They get a notice with no details.", then shows "The family was told: paused."), asks a question (typed, or from the three templates; "Type a question first." when empty), and sees each question with the family's answer or "No answer yet.". It carries no control for a find or the person's condition and says "News of a find or their condition goes from the search lead in person, not here." A refused send says so and keeps the text. A dev-only harness page (`web/harness/family.html`) runs it with fakes. Not on the command post yet.
- Source: field-expert input (search and rescue practitioner) and the shared family-channel rules.
- Verified: `e2e/harness/family.spec.ts` (6 tests: answers and open questions; a template then Ask; an empty question refused; paused asks first then shows; no found or condition control; a refused ask keeps the text) failed first (component missing), then passed; typecheck clean. scripts/ci-local.sh exit 0.

### refactor(data): let Firestore pick the id of a question to the family
- What: `askFamily` now writes with `addDoc`, so Firestore's own auto-id (20 letters and digits) names the question, which is exactly what the familyQuestions rule requires, instead of an id made in this file. The hand-made id and its test are gone.
- Source: the familyQuestions create rule (auto-id only).
- Verified: 6 family question tests pass; typecheck clean; the rules tests in scripts/ci-local.sh cover a command create at an auto-id. scripts/ci-local.sh exit 0.

### feat(command): put the family channel on the command post
- What: the post's right rail now has the Family section: Searching or Paused for the family (from `incident.searchState`, sent with `tellFamily`), the three question templates, Ask (`askFamily`, auto-id), and the family's answers as they arrive (`subscribeQuestions`). If the questions cannot be read (for example before the channel's rules are deployed), the section is not drawn and the rest of the post keeps working; that refusal never counts as the post losing access.
- Source: Ask the family, with the family-channel rules.
- Verified: a new read-only deployed test (`e2e/family.spec.ts`: the Family region, Searching and Paused, a template) failed on the live site at 784f5e2 (no section); it passes once this deploy and the channel's rules are both live. The 6 family harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### ci(web): run the component harness and extras browser suites in the web workflow
- What: the web job now also runs `npx playwright test -c e2e/harness.config.ts --grep-invert "built-in model"` (map, beat, plan, sightings, family, clips and the rest) and `npx playwright test -c e2e/extras.config.ts`, after the no-backend checks. Both configs use Playwright's own Chromium when `CI` is set (the workflow installs it) and desktop Chrome locally. The tests that need Chrome's built-in model stay out.
- Source: CI audit (the harness and extras suites ran only on a developer's laptop).
- Verified: in a fresh worktree with no `.env.local`, after `npm ci`, with `CI=1`: harness 93 of 93 and extras 42 of 42 pass on Playwright's Chromium; the workflow file parses. Actions minutes are used up, so the workflow itself runs when they return. scripts/ci-local.sh exit 0.

### test(e2e): run the page-facts and font checks with the no-backend browser checks
- What: `e2e/pagefacts.spec.ts` (robots.txt is a real file, each page's description and title, the join page does not shift) and `e2e/fonts.spec.ts` (self-hosted fonts from this origin, tabular digits) are tagged `@no-backend`, so the web workflow and the local mirror run them on every change instead of only against the deployed site.
- Source: CI audit.
- Verified: in a fresh worktree with no `.env.local`, against the placeholder build with `CI=1`, the 4 tests pass; with them, 22 of 22 no-backend browser checks pass here. scripts/ci-local.sh exit 0.

### docs(web): drop an internal planning name from a changelog source line
- What: the family channel entry's source line named an internal planning queue; it now names the feature and its rules only.
- Source: public-repository hygiene review.
- Verified: a scan of web/CHANGELOG.md and web/CHANGELOG-EXTRAS.md for internal names and private paths finds none. scripts/ci-local.sh exit 0.

### docs(web): name review sources plainly in this changelog
- What: 14 source lines that named an internal audit of other projects now say "review", keeping each line's engineering reason (for example "review (version.json)"). No entry's facts change.
- Source: public-repository hygiene review.
- Verified: a case-insensitive search of this file for the audit's two names finds nothing (the word "arrival" aside). scripts/ci-local.sh exit 0.

### docs(web): keep the audit's names out of the entry that removed them
- What: the previous entry's Verified line quoted the search it ran, which put the two names back into this file; it now describes the search instead.
- Source: the committed-tree check after that commit (want-0 found 1).
- Verified: the same case-insensitive search of the committed file finds nothing. scripts/ci-local.sh exit 0.

### fix(camera): trace clip triage on this laptop only when the SDK says it ran there
- What: the on-device frame check now passes the SDK's `inferenceSource` through, and triage keeps it. A clip with no person is traced as `on_device` with `sdkReported: true` only when every frame check reported on-device; if any check reported the cloud the path is `cloud`; with no report the path is `unknown` and `sdkReported` is false, so it never counts toward the on-device share. Before, every no-person result was stamped on-device and SDK-reported.
- Source: review (clip triage stamped on_device without an SDK-reported source).
- Verified: new tests (`src/camera/triage.test.ts`: every check on-device gives on_device; no report, or a mix, gives unknown; the route for unknown is path unknown with sdkReported false) failed first, then passed; the frame generator test now also expects the SDK's source back; 14 triage tests and 23 clip and triage harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(plans): keep a failed model attempt apart from the fixed wording that replaced it
- What: when the plan wording asked a model and its answer was not used (an error, a timeout, text that is not the wording's JSON, or wording that fails the checks), `wordPlan` now returns that attempt beside the fixed-wording route: where it ran as the SDK reported it (`on_device`, `cloud`, or `unknown` with `sdkReported` false) and why it failed. The post traces the attempt on its own, so an attempt that may have sent the draft is never hidden behind the "rules" route of the fixed wording. Unusable model text now says "The model's wording could not be used. The plan below uses fixed wording." No attempt is recorded when the model's wording was used or when no model was asked.
- Source: review (a failed plan-wording cloud attempt was recorded as the rules route).
- Verified: two new tests (`src/ai/replanWording.test.ts`: error, unreadable, rejected and timeout attempts with their routes and the plan still worded by rules; none for a used answer or a paused cloud) failed first, then passed; 23 wording tests and 6 plan harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### fix(command): drop a note read that answers after the note changed
- What: the sighting note stays editable while it is read, on this laptop or in the cloud. A reply that arrives after the note was changed is now dropped instead of filled into the fields, and the form says "The note changed while it was being read. Read it again." A reply for the unchanged note fills the fields as before.
- Source: review (a late reply could fill fields from an older note).
- Verified: two new sighting harness tests (`?read=slow`: change the note, then the model answers, and the fields stay as they were with the line shown; the unchanged note fills Top) were written first and the dropped-reply test failed, then both passed; 3 sighting harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### feat(judge): open the judge page with a numbered three-minute route
- What: under the one-line purpose, an ordered list "Three minutes, in order": Try a practice search, Watch the drill replay, Get this laptop ready, See the cloud model. Each step links to its section on the page (the replay step goes to the replay when a run is published, otherwise to the line saying there is none). Rows are 28 px tall so each link is an easy target.
- Source: judge-page review (a judge needs the route before the details).
- Verified: a new no-backend test (the four steps in order; every link lands on one heading on the page) failed first (no list), then passed; the axe check caught link targets that were too close and passes after the row height; 23 of 23 no-backend browser checks pass. scripts/ci-local.sh exit 0.

### feat(plans): a closed What ran receipt on each plan suggestion
- What: under the suggested plan, a closed "What ran" line opens to: what was asked for ("this laptop first"), where it ran as the SDK reported it (or "not reported by the SDK"), the model, and what left this laptop ("nothing left this laptop", or the UTF-8 size of the plan text sent, or "up to" that size when the source was not reported). For fixed wording it says no model was asked and nothing was sent; when a model was asked but its answer was not used, it describes that attempt and why fixed wording won. It never shows the prompt. `wordPlan` now reports the plan text's size (`promptBytes`), measured from the exact prompt.
- Source: review (a compact receipt on each AI result).
- Verified: `src/ai/receipt.test.ts` (4 tests) and the `promptBytes` test failed first, then passed; two plan harness tests (cloud: the four lines with "1,234 bytes of plan text"; on this laptop: "nothing left this laptop") failed first, then passed; `src/command/whatRan.test.ts` (attempt and paused-cloud branches) was written after the code and passes; 8 plan harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### docs(web): name owners by role in this changelog
- What: 40 places in this file named build work streams by their internal labels; they now name the role (the backend, the security rules, the engine, the Android family app, the web command post) or the shared contract, and the extras module by its current name. No entry's facts change; history is not rewritten.
- Source: the public-hygiene guard's new patterns.
- Verified: `python3 -I scripts/hygiene_guard.py . --public` reports 0 hits under web/ (it still exits 1 on other folders' files, which their owners are sweeping). scripts/ci-local.sh exit 0.

### test(map): check the ripple from its own record, not a moment on the clock
- What: the ripple test read the far dot's pixel right after the ripple started and expected it unlit; under load the far dot's start (a fixed delay later) had already passed by the time the pixel was read, so the test failed in full-suite runs and passed alone. The map harness now records every dot's grow value in order (`window.growLog`, harness only), and the test checks the ripple's own record: every dot starts at nothing, the far cell starts growing after the point last seen, and the far dot is never larger than the near one; at the end the far dot is drawn.
- Source: full local mirror runs on main (2 of 2 failed on this test under load).
- Verified: the new test passes; with the ripple's origin moved to the far cell it fails (the far cell grew first); 5 consecutive full harness-suite runs, 97 of 97 each (21.8 s to 1.0 m under other sessions' load). scripts/ci-local.sh exit 0.

### fix(command): close family questions once the search is no longer open
- What: the security rules take a new family question only while the incident is open, but the Ask button stayed live after a find, so the write was refused and the card said to try again. The Family section now takes the incident's status: when it is not open, the question box, the templates and Ask are disabled with "Questions close when the search is no longer open.", and the questions already asked, with their answers, stay visible. Nothing in the web reads a question id from the family push.
- Source: review of the risky-change set (question create allowed only on an open incident).
- Verified: a new family harness test (`?status=found`: the closed line, Ask, the box and a template disabled, both questions and the answer still shown) failed first, then passed, with a second test that an open search has no closed line; 8 family harness tests pass; typecheck clean. scripts/ci-local.sh exit 0.

### test(judge): wait for the run file before checking the route's links
- What: the route test read the replay step's link right after the page opened, while the published run was still loading; under load the run arrived between reading the link and checking its target, so the target section had already been swapped. The test now waits for the replay section before reading the links, and a second test serves no run file and checks the replay step goes to the "No published run yet." line.
- Source: a full local mirror run under load (the route test failed once; the page logic was right).
- Verified: `judgeRun.spec.ts` run 5 times over (35 of 35) against the placeholder build. scripts/ci-local.sh exit 0.

### feat(command): list every name they answer to on the approach card
- What: `answersToLine` (web/src/data/profile.ts) builds the card's names line from the shared profile: the main name, then every other name they answer to (the family's list through the engine's `namesToCall`, else the nickname), each once, for example "Answers to Roberta (also Bea, Mom, Miss Bea)". With no main name it lists the others; with no names it shows nothing. The approach card uses it, so the print sheet and radio cards can import the same builder instead of a copy.
- Source: field input on approach (people answer to more than one name), with the shared otherNames list now on main.
- Verified: three new tests (all names in order; no repeat of the main name and the nickname fallback; names alone and none) failed first (builder missing), then passed; 27 profile tests pass; typecheck clean. The full local mirror runs on the pull request head.

### fix(photos): say no model reads a photo, not that it stays on this laptop
- What: three lines said a photo stays on this laptop, which is not true at the command post (photos are stored in Cloud Storage). They now say what does not happen: "The family has not agreed to a cloud reading of this photo, so no AI model in the cloud reads it.", "This browser's model cannot read images, so no model read these photos.", and on the judge page "It cannot read images, so no model reads the sample photos." A code comment in the photo read says the same. This entry also corrects the previous entry's verification line (that commit ran typecheck and its own tests; the full mirror runs on the pull request head).
- Source: review (a no-consent line claimed the photo stays on this laptop).
- Verified: the judge test and the photos harness test were changed to the new lines first and failed, then passed (16 judge tests, 7 photos harness tests); a search of web/src for "stays on this laptop" style lines finds none; typecheck clean. The full local mirror runs on the pull request head.

### docs(ai): name the plan wording's mode correctly in its comment
- What: the comment on `wordingGenerator` said plan wording runs on the SDK's PREFER_IN_CLOUD mode; it runs on PREFER_ON_DEVICE (`wordingParams`), and the comment now says so.
- Source: review.
- Verified: typecheck clean; no other comment in web/src names the old mode. The full local mirror runs on the pull request head.

### fix(pwa): move a just-opened page of an older build onto a new deploy
- What: a page running a build from before the reload watcher has no code that hears a new worker take over, so a returning visitor could see an old build on the first visit after a deploy until a manual reload. The generated worker now imports `sw-takeover.js`: on activate it claims every open page and asks each "which build are you?" (a message with a reply port). Pages from this build on answer (`src/pwa/takeover.ts`) and keep their own reload-or-ask behaviour. A page that does not answer is an older build; the worker reloads it only if it is the focused page and the worker began installing under a minute ago (the update came from that page just opening, as on a judge's first visit). Any other older page, including a background tab that may hold a half-written note, is left alone and gets the new build on its next load. The reload is started, not awaited, because its request waits until the worker has finished activating. Pages also ask for a worker update when they become visible again and every 30 minutes, so a long-open demo tab notices a deploy.
- Source: a stale first load of /judge in a real browser after a deploy (review).
- Verified: a local end-to-end proof with a real older build (aaae392, cached by its own worker) and this build served next on the same origin: a control build without the script left the old page stale; with it, the just-opened page showed the new build 4 to 6 s after opening with no manual reload, 3 of 3 runs. Headless Chromium reports every tab as focused, so the background-tab case is proven in `src/pwa/swTakeover.test.ts`, which runs the worker script in a sandbox with fake pages (focused just-opened page reloaded; background and hidden older pages, current pages, and a focused page long after install left alone) and fails if hidden pages are reloaded. Two no-backend browser tests check that a page answers the ping and that the built worker imports the script. Typecheck clean; the full local mirror runs on the pull request head.

### build(web): ship the Kennesaw drill grid's tiles and route graph
- What: the build now copies `kennesaw-mountain-drill.pmtiles` and `.graph.json` from shared/grid into `/tiles/` beside the dev park's, so the Sunday drill incident (drill-kennesaw-1) draws its basemap and can run the walker model; both are precached for offline use like the dev park's. The tiles check covers both grids and now also runs in the no-backend browser checks, so a grid left out of the build fails before a deploy.
- Source: the Kennesaw drill seed (shared/grid gained the grid's files).
- Verified: the tiles check for kennesaw-mountain-drill failed first against the placeholder build (the app shell came back as text/html), then both grids pass (PMTiles magic on a range request; graph as application/json). Typecheck clean; the full local mirror runs on the pull request head.

### feat(command): show the incident's terrain note under the ring source line
- What: when an incident carries `terrainNote` (written by the seed, for example "Default terrain column (urban), not verified for this site." on the Kennesaw drill), the Prior section shows it under the ring source line, so command knows the distance table is a default. A missing or non-text note shows nothing; text is capped at 200 characters. Command cannot change it here.
- Source: the Kennesaw drill seed's terrain note.
- Verified: a new layers harness test (the note under the source line; none without it) failed first, then passed; 11 layers harness tests pass; typecheck clean. The full local mirror runs on the pull request head.

### fix(plans): cap a plan at 8 teams, as the plans rule now does
- What: the plans rule now takes at most 8 assignments (the worst case fits 9 under the rules' expression limit, so 8 keeps a margin), and the seed refuses more than 8 teams. The plan card's limit follows: "A plan can name at most 8 teams. This draft has 9, so it can't be approved. Search with 8 teams or fewer." and Suggest plan stays disabled past it.
- Source: the plans rule change (at most 8 assignments).
- Verified: the plan unit test and the plan harness test were changed to 8 first and failed, then passed (21 plan tests, 8 plan harness tests); typecheck clean. The full local mirror runs on the pull request head.

### fix(plans): fall back to fixed wording when the model writes a number it was not given
- What: the wording check looked at team ids, other teams' segment ids and text length, but not numbers, so a figure the model made up in a reason or the summary would reach command as fact. Now every run of digits (with an optional decimal part) in a reason or the summary must appear in the plan text the model was sent; otherwise the plan uses fixed wording, and the "What ran" receipt says "Not used: it used a number that is not in the plan."
- Source: review (model-invented figures in plan wording).
- Verified: new tests (numbers from the plan accepted; a number not in the plan refused in a reason and in the summary; "a reason with a number not in the draft falls to the template", with the attempt recorded as "number"; the receipt line) failed first, then passed; 27 wording tests and 3 receipt tests pass; typecheck clean. The full local mirror runs on the pull request head.

### feat(photos): a closed What ran receipt on each family photo read
- What: under a photo's suggested cues, a closed "What ran" line opens to what was asked for ("this laptop only" or "the cloud, with the family's consent"), where it ran as the SDK reported it, the model, and what left this laptop: "nothing left this laptop" for a laptop read, or the exact size of the request's photo data for a cloud read ("Sent: N bytes of the photo, as base64.", 4 characters per 3 bytes of the JPEG, measured from the bytes the read encodes). It never shows the photo or the prompt.
- Source: review (a compact receipt on each AI result, media reads first).
- Verified: a new photos harness test (`?read=cloud`: the cloud read's four receipt lines) failed first (no receipt), then passed; 8 photos harness tests pass; typecheck clean. The full local mirror runs on the pull request head.

### feat(camera): a closed What ran receipt on each camera clip reading
- What: `readClip` now reports what it sent, measured where the request is built: the length of the clip's base64 string on a fresh read, and 0 when the reading was stored before. The camera sighting card shows a closed "What ran" line: asked for ("the cloud, with the clip's three consents"), where it ran as the SDK reported it, the model, and "Sent: N bytes of the clip, as base64." or, for a stored reading, "Sent: nothing now; this reading came from an earlier read of the same clip." It never shows the clip or the prompt. This entry also turns the photo receipt entry's sample size into a placeholder (it was an illustration, not a measurement).
- Source: review (a compact receipt on each AI result, media reads first).
- Verified: a new readClip test (a fresh read's size equals the base64 the model was handed, 4 characters per 3 bytes; a stored reading reports 0) and a new clip harness test (the four receipt lines with "5,000 bytes of the clip") failed first, then passed; 40 clip read tests and 23 clip harness tests pass; typecheck clean. The full local mirror runs on the pull request head.

### feat(command): a closed What ran receipt on each sighting-note read
- What: after a note read fills the fields, a closed "What ran" line opens to what was asked for ("this laptop only", or "the cloud, after the consent tap"), where it ran as the SDK reported it, the model, and what left this laptop: nothing for a laptop read, or the UTF-8 size of the note the template received, measured after phone numbers were removed ("Sent: N bytes of the note, with phone numbers removed."). It never shows the note.
- Source: review (a compact receipt on each AI result).
- Verified: a new unit test (the cloud read reports the size of the note it sent, with a phone number removed first) and a new sighting harness test (the cloud path's receipt lines with "22 bytes of the note") failed first, then passed; 15 note read tests and 4 sighting harness tests pass; typecheck clean. The full local mirror runs on the pull request head.

### ci(web): install ffmpeg before the component harness checks
- What: the clip and frame harness tests make their synthetic test clip (a grey frame with a moving red square, no person) with ffmpeg, which GitHub's Ubuntu runner does not ship, so two harness tests failed on the first real CI run while passing locally. The web job now installs ffmpeg (`sudo apt-get install -y --no-install-recommends ffmpeg`) before the harness step, and the workflow-mirror check lists that install as runner setup, like the Playwright browser install.
- Source: the web job on pull request CI ("ffmpeg: not found").
- Verified: the workflow file parses; `scripts/test_ci_local.py` (every workflow command mirrored, setup excepted) and `scripts/test_workflow_paths.py` pass; the next CI run on the pull request is the check.

### feat(command): show the note's own words a read was taken from
- What: when a note read fills the fields, the form now shows `From the note: "<quote>"`, the evidence quote the read returned, so command sees which words the suggestion rests on. With no quote it shows nothing. The read already refuses a reply whose quote is not in the note; the form also shows a quote only while the note still holds those exact words.
- Source: review (the checked evidence quote was never shown).
- Verified: three new sighting harness tests (a quote shows; no quote shows no line; a quote that is not in the note is never shown) were written first; the first failed (no line), the other two held, then all passed; 7 sighting harness tests pass, and the existing read test that drops a reply whose quote is not in the note still passes; typecheck clean. The full local run of every workflow command happens on the pull request head.

### feat(command): show the family's tracking aids on the approach card
- What: the approach card lists the engine's line for each tracking aid on the shared profile (`trackingAidLines`), for example "Enrolled in Project Lifesaver: ask the county team to bring receivers.", with the family's note after them. An empty list shows "No tracker or medical ID, as the family said."; a profile without the field shows nothing, since unknown is not none. The card reads only; no model sees this field.
- Source: field input on approach (tracking and ID aids), with the shared trackingAids field now on main and in the live rules.
- Verified: a new approach harness (`web/harness/approach.html`) and two tests (two aids and a note in card order; an empty list gives the none line and an absent field shows no list) failed first, then passed; typecheck clean.

### fix(profile): keep the family's tracking aids when command saves the profile
- What: a command save writes the shared profile document whole, built from what the post read, and the reader kept only fields it knew, so saving any shared field (gender, say) would have erased the tracking aids the family app writes. The reader now keeps `trackingAids` when it is stored (known aid ids only, the note as text) and leaves it absent when it is not, the same way it keeps the family's names list.
- Source: review while adding tracking aids to the approach card.
- Verified: two new tests (the stored aids read back and an absent field stays absent; a command save of another shared field keeps them) failed first (the field was dropped), then passed; 29 profile tests pass; typecheck clean.

### test(profile): every shared-profile field in the schema survives a command save
- What: a new test walks the shared schema's SharedProfile (`shared/schemas/subject-profile.schema.json`), makes a valid value for each field that differs from an empty profile, stores it, saves a command edit of another field, and checks the stored value is still in the shared document written. A field added to the schema without the web keeping it fails here, because the save writes the document whole. The approach note ids are worked out again on every save and are left out.
- Source: review (the tracking-aids erase, so the next optional field cannot repeat it).
- Verified: 21 tests pass (20 fields and the schema walk); with the tracking-aids reader branch removed, "keeps trackingAids" fails, and it passes again with it restored.

### docs(web): restore the headings of the three debrief entries
- What: the three debrief entries under 2026-11-17 had lost their "### " heading lines when they were carried onto main, so their bullets ran into each other. The headings are back, each before its own "What" line, taken from the original commits.
- Source: review of the changelog after the debrief merge.
- Verified: the three headings match the original commit subjects; no other line changed.

### fix(profile): a field command sets back to unknown is removed on save
- What: a save applies only what command changed, and it looked only at fields present in the edited profile, so an optional field set back to unknown (tracking aids, say) was silently kept. Now a field present when the form opened and absent after counts as a change, and the merged document drops it.
- Source: review while adding the tracking-aids editor.
- Verified: a new test (tracking aids set back to unknown are not in the shared document written) failed first (they were kept), then passed; 30 profile tests and the 21 schema survival tests pass; typecheck clean.

### feat(command): edit the tracking or ID aids in the profile form
- What: the profile form has a "Tracking or ID aids" group: "Not known yet" (no field, the default) or "The family answered", which shows a box for each aid with the shared list's labels (in card order) and "Note for teams (no numbers)" (up to 80 characters). Nothing ticked means the family said none. A note with a digit is refused before saving: "Leave out numbers: give serials and phone numbers to the search lead directly.", which matches the security rule. Aids already on the profile show ticked.
- Source: field input on approach (tracking and ID aids).
- Verified: five new profile harness tests (unanswered saves no field; named aids saved in card order with the note; answered with none ticked saves an empty list; a note with a number refused and nothing saved; stored aids shown ticked) failed first, then passed; 8 profile harness tests pass; typecheck clean.

### fix(camera): redraw a clip sample that repeats the previous frame before calling it still
- What: the motion sampler seeks the clip, waits for "seeked", and draws the frame to a canvas. Under load "seeked" can fire before the new frame is decoded, so the canvas reads the previous frame again and a moving span reads as still (on-device triage could then decide "no motion" and skip a clip with a person in it). Now a sample that is byte-identical to the previous one is drawn again after a frame (up to 3 times) before it is accepted. A truly still clip settles on the same frame and costs only those waits. A frame-callback approach was tried first and dropped: a clip element that is not on the page never presents frames, so every sample waited its full bound.
- Source: an intermittent harness failure on CI (two consecutive samples identical on a moving clip).
- Verified: three new unit tests for the redraw (a stale draw redrawn until the new frame; a still frame accepted after the retries; one draw when the frame differs) failed first, then passed; the frames harness tests pass at their usual speed (0.5 s moving, 0.7 s still), 30 of 30 over 10 repeats with 7 workers; clip and triage harness tests pass; typecheck clean.

### test(e2e): live tests refuse the judge's seeded incident
- What: the live-test fixtures (`joinCommand` and the family consent helper) now refuse the judge's seeded incident with "This is the judge's seed incident; live tests run on the test drill (PLS_SMOKE_INCIDENT=drill-test-1).", because those tests write sightings, photos, consents and plans. The seed's id comes from one shared constant, `shared/constants/judge-seed.json` (with the test drill's id beside it), so no test types it. A no-backend test checks the refusal and that the test drill is accepted.
- Source: the judge's seed must stay as judges see it; live writes go to the test drill.
- Verified: the guard test failed first (no such export), then passed; 29 of 29 no-backend browser checks pass; typecheck clean.

### test(e2e): form-only specs type the test drill's id, not the judge's seed
- What: four specs that only type an incident id into the join form or a link (sign-in, App Check, the new-build reload and the shared-link note) now use the test drill's id; none of them joins. With this, the judge seed's id appears nowhere in web/e2e.
- Source: a repository check that the judge seed is never named in test code.
- Verified: a search of web/e2e (tracked files) for the judge seed's id finds none; 29 of 29 no-backend browser checks pass, including the new-build and shared-link specs.

### test(e2e): the family spec names the Family region exactly
- What: `family.spec.ts` finds the command post's family channel with `{ name: "Family", exact: true }`. On a post whose family has shared photos, the "Family photos" tray also matched the plain name, and the strict locator failed before checking anything.
- Source: a deployed-site run on the test drill (the tray is present there).
- Verified: the spec failed against the live site on the test drill with "strict mode violation ... resolved to 2 elements", then passed with the exact name; typecheck clean.

### fix(data): read callable errors without the SDK's appended status
- What: `data/callableError.ts` gives a failed Cloud Functions call as `{ code, message, reason }`: the server's sentence with the " [503]" the Firebase SDK appends removed, and `details.reason` when the server sends one. Not used by the mappers yet.
- Source: a live practice search started twice at once showed "No connection" for the server's "still being set up" answer; the SDK had ended the message with " [503]", so an exact match missed.
- Verified: `src/data/callableError.test.ts` (3 tests, the first two run a real callable through the SDK against a stubbed 503 and 429) failed first (module missing), then passed; the raw SDK message is asserted to end in " [503]".

### fix(data): practice search shows the server's sentences the SDK suffixed
- What: `practiceErrorMessage` reads errors through `callableError`, so "One new practice search per hour...", "...full for today..." and "...still being set up..." show as the server wrote them instead of "No connection" or "could not start". A `details.reason` (hourly_limit, daily_limit, no_practice, setup_busy) is trusted over the wording when the server sends one. New `isSettingUp(e)` says when a start should be retried.
- Source: a live double start on the judge page showed "No connection" for the server's "still being set up" answer.
- Verified: two new tests with the SDK's real " [429]" and " [503]" messages and with reasons failed first, then passed; 7 of 7 practice tests pass; typecheck clean.

### fix(data): media delete shows the server's refusal the SDK suffixed
- What: `deleteFailure` reads errors through `callableError`, so "Only the incident's command can delete its media." and "Sign in before deleting an incident's media." show as refusals (nothing deleted) instead of "The server did not confirm the delete". A `details.reason` (not_command, not_signed_in) is trusted over the wording when the server sends one.
- Source: the same SDK status suffix found on the practice search; this mapper used the same exact match.
- Verified: a new test with the SDK's real " [403]" and " [401]" messages and a reason failed first, then passed; 9 of 9 media tests pass; typecheck clean.

### feat(data): retry a practice search while the server is still setting it up
- What: `startWithRetry(start, { onWaiting })` in `data/practice.ts`: when the server answers "still being set up" (code unavailable with that sentence, or reason setup_busy), it passes the sentence to `onWaiting` and starts again every 2.5 s for up to 30 s, then gives up with the server's answer. Any other failure, a lost connection included, is thrown at once. Not used by the judge page yet.
- Source: a second start during setup (a double click) is answered "still being set up"; the person should not have to click again.
- Verified: 3 new tests with a fake clock (busy twice then success with two 2.5 s waits; busy throughout stops after 13 tries within 30 s; a 503 with no sentence is thrown after one try with nothing said) failed first (no such export), then passed; 10 of 10 practice tests pass; typecheck clean.

### fix(judge): a practice search still being set up says so and starts again by itself
- What: the judge page starts a practice search through `startWithRetry`: while the server answers "still being set up", the sentence shows as a status under the button (which stays "Starting" and disabled) and the start repeats every 2.5 s for up to 30 s, then the page opens the incident. A 503 without the server's sentence still says "No connection. Try again when the link is back." and does not repeat. A ref set before the first await keeps a second click in the same moment from starting a second search.
- Source: a live double start showed "No connection" for the server's "still being set up" answer, and the judge had to click again.
- Verified: three new browser checks that answer the start callable in the page (so no practice search is used up): busy then a seat shows the sentence and lands on the incident after two calls (failed on the live site before this change: no status line); a bare 503 says No connection with one call after 3.5 s; a double click makes one call. All three pass on a local build, with 16 of 16 other judge checks; typecheck clean.

### fix(data): callable errors also give the HTTP status, 0 for no answer
- What: `callableError` now returns `status`, the HTTP status the Firebase SDK appended (any one to three digits, so " [0]" too), and strips it from the message. The SDK reports a request that never got an answer (a lost connection) as `functions/internal` with status 0.
- Source: review of the callable error fix: a real lost connection reached the practice mapper as "internal [0]", not as a 503.
- Verified: a new test that makes the SDK's fetch fail outright (status 0, code functions/internal, message "internal") and the existing tests updated for the new field failed first, then passed; 23 of 23 helper, practice and media tests pass; typecheck clean.

### fix(data): a practice search with no connection says No connection
- What: `practiceErrorMessage` returns "No connection. Try again when the link is back." for a request that got no answer (the SDK's status 0) and for a sign-in that could not reach the network (`auth/network-request-failed`). Before, both said "The practice search could not start. Try again."; a server error with a real status (500) still does.
- Source: review of the callable error fix.
- Verified: a unit test (status 0, the sign-in network error, a 500) and a browser check that cuts the start callable's connection (No connection, one call after 3.5 s) failed first (the live site said "could not start"), then passed on a local build with the other four practice checks; 11 of 11 practice tests pass; typecheck clean.

### fix(judge): the waiting line says the page opens the practice search itself
- What: while the server is still setting a practice search up, the status under the button says "Your practice search is still being set up. This page opens it when it is ready." instead of the server's "Try again in a moment.", which asked the judge to do what the page is already doing (the button is disabled meanwhile). After 30 s without a seat, the server's sentence shows as the error and the button comes back.
- Source: review of the judge page retry.
- Verified: the busy-then-seat browser check, changed to expect the new line, failed on a build without it, then passed on a local build with the other 16 judge checks; typecheck clean.

### test(e2e): two clicks in the same moment start one practice search
- What: the double-click check now clicks the start button twice in one task (`b.click(); b.click()`), before React can disable it, so only the page's own guard stops the second start. Playwright's `dblclick` sends the second click after React has already disabled the button, so the old check could not fail.
- Source: review of the judge page retry.
- Verified: on a build with the guard's early return removed the check failed (2 calls, expected 1); with the guard it passes, with the other judge checks.

### feat(map): a rule for which probability plates the map draws
- What: `map/plateRule.ts`: `plateShown` shows a plate only at 1.0% or more and only when the plate fits inside its segment's on-screen box (width and height, no margin); with "every percent" on, every plate of 0.1% or more; never a "<0.1%" or empty plate. `screenBox` is the axis-aligned box around a segment's projected points. Not used by the map yet.
- Source: the shared map label rule for the phone and web maps (68 plates buried the map in "<0.1%" labels).
- Verified: `src/map/plateRule.test.ts` (5 tests) failed first (module missing), then passed; typecheck clean.

### feat(map): plates show at 1.0% or more and only where they fit their segment
- What: `MapView` applies `plateShown` before placing labels and again after every move (zoom or pan): a plate under 1.0%, or wider or taller than its segment's box at the current zoom, is hidden (class `unfit`, visibility hidden, still in the page), never clipped. The labels left still hide by collision, so none overlap. New prop `everyPercent` shows every plate of 0.1% or more. Plates now have 6 px side and 2 px top and bottom padding (12 and 4 in total), as on the phones. The map harness takes `?every` and `?tiny` (cell DF at 0.01%) and exposes its map and cells for tests.
- Source: the shared map label rule for the phone and web maps.
- Verified: three harness checks failed first (all 23 plates showed on a roomy map; on a 300 px map AB's plate showed wider than its cell; with every percent a "<0.1%" plate would show), then passed: 17 plates of 1.0% or more on a roomy map, no visible plate wider or taller than its cell on a 300 px map, 23 plates and no "<0.1%" with every percent on. All 125 harness checks pass; typecheck clean.

### feat(map): an Every percent switch on the map
- What: `MapView` takes `onEveryPercent`; when set (and the map has segments) it shows an "Every percent" checkbox at the map's top right, which turns `everyPercent` on and off. Keyboard-reachable with the page's focus ring. The map harness shows it with `?switch`.
- Source: the shared map label rule (command may show every percent).
- Verified: a harness check (unchecked shows 17 plates; checked 23; unchecked 17 again; focusable) failed first (no switch), then passed with the 11 other map checks; typecheck clean.

### feat(command): the command map has the Every percent switch
- What: the command post keeps an "every percent" view setting for its own screen (off at first) and passes it to the map with its switch. Nothing is written anywhere; other seats are not affected.
- Source: the shared map label rule (command may show every percent).
- Verified: a new live check on the test drill, `e2e/plates.spec.ts` (every visible plate is 1.0% or more; Every percent shows more plates and never a "<0.1%" one; off again goes back), passed on a local build: 14 plates by default, 47 with Every percent; typecheck clean. Screenshots of both views were checked by eye.

### test(e2e): phone-width checks wait for segment codes, not plates
- What: the 390 px phone checks and the joined-post accessibility check wait for a visible segment code before reading the page. Under the plate rule a plate shows only where it fits its segment, and at phone width no plate fits the drill's segments, so waiting for a visible plate timed out.
- Source: a full local run of the browser checks after the plate rule.
- Verified: the two phone checks and the 390 px accessibility check timed out on "a visible plate" after the plate rule, then passed with the new wait (10 of 10 phone and accessibility checks).

### feat(map): the map credit is one linked line, "© OpenStreetMap contributors · Protomaps"
- What: the credit under every map is one short muted line (fg-4, the same on every map view): "© OpenStreetMap contributors", linked to OpenStreetMap's copyright page (their guideline for web maps), and " · Protomaps", linked to Protomaps' attribution guidelines, only when the basemap is drawn. The grid's stamped licence line is the OpenStreetMap link's title. Both links open in a new tab, are reachable by keyboard and show the page's focus ring. `mapCredit` now returns whether Protomaps is credited instead of a sentence.
- Source: the shared map credit for the phone and web maps.
- Verified: the credit unit tests and a harness check (one line, link and address, muted colour, keyboard focus with a visible outline) failed first (the old "Map data from OpenStreetMap" line), then passed with 12 other map checks; the judge replay map now also asserts its credit link; the basemap check expects the full line and passes on a local build with the replay, phone and accessibility checks (18 of 18); typecheck clean. The deployed smoke check is updated to the new line and runs after deploy.

### fix(pwa): a first install of the service worker reloads no page
- What: `public/sw-takeover.js` notes at install whether an older worker was active, and reloads a focused page that did not answer its ping only when it was (an update from an older build). On a first install there is no older build, the page came from the network, and a page slow to answer is only busy; before, it was reloaded, which on a slow machine could lose what someone had just started typing.
- Source: the local CI mirror under load: three first-visit browser checks (the new-build pair and the 390 px judge page accessibility check) failed with "Execution context was destroyed ... navigation".
- Verified: a new sandbox test (first install, focused page that does not answer: no reload) failed first (1 reload), then passed with the 4 existing takeover tests, including the update case that still reloads; the new-build and no-backend accessibility browser checks pass on a local build (9 of 9); typecheck clean.
### test(e2e): the clip form check expects the clip's real size, not a fixed byte count
- What: `e2e/harness/clip.spec.ts` checks that the form passes `bytes: statSync(CLIP).size`, the size of the clip file the test uses, instead of 4448. The clip is generated on the machine running the test, and its size depends on that ffmpeg build.
- Source: CI with a pinned static ffmpeg 8.1 encoded the same clip to 4434 bytes, and the fixed count failed; apt's ffmpeg and a local ffmpeg 9.0.2 both give 4448.
- Verified: with the clip made 20 bytes longer (4468 bytes, still "4 KB"), the old check failed (expected 4448, received 4468) and the new one passed; all 23 clip checks pass on the normal clip; typecheck clean.

### fix(judge): a judge page shown again from the back/forward cache has its start button ready
- What: `JudgePage` listens for `pageshow`; when the browser shows the page again from its back/forward cache (`persisted`), the practice start is reset: the guard is cleared and the button reads "Try a practice search" again. Before, coming Back from the practice incident could show the page exactly as it left, mid-start, with the button disabled on "Starting".
- Source: review finding (start button stuck after a back/forward cache restore).
- Verified: a new check in `e2e/judge.spec.ts` (start pending, then the restore event fired by hand, since Playwright's Chromium restored the page from its cache in only 1 of 6 real tries) failed against the live site (button still "Starting") and passed on a local build with the 4 other start checks; typecheck clean. A start cancelled by stopping the navigation is not covered.

### feat(judge): one advice line from a dementia-care expert on the judge page
- What: under the purpose line, /judge shows `ADVICE_LINE` (in `src/judge/judge.ts`): Kim Franklin of the Alzheimer's Association Georgia told us to check the immediate area first and, if the person is not found within five minutes, call police, because the longer you wait, the further they can get. It is a paraphrase of what she told us, so it has no quote marks, and it is worded as her advice, never as an endorsement. She agreed to be quoted.
- Source: an expert call with a dementia-care organization's staff member (why the first minutes matter).
- Verified: two unit tests (the credit wording with no quote marks; plain ASCII only) failed first (no export, then the earlier quoted wording), then passed; a new `@no-backend` check in `e2e/judge.spec.ts` failed against the live site (no such line) and passed on a local build with the other 3 judge checks; a 390 px screenshot reads in one block under the purpose line.

### feat(command): a sighting saved at the command post records where its reading came from
- What: `buildSightingEvent` writes the event's `route` instead of null. When a model read filled the form, it is that read's RouteRecord (on the laptop or in the cloud), passed by `SightingForm` as `readFilled`; a read that reported no route is stored as null (not reported), never as hand entry. When command typed it by hand, it is `handEntryRoute(writeTime)`: platform web, path rules, stage picklist, model none, reason on_device_default, the same record the iPhone writes for a picked report. Command placing a family sighting gets the hand-entry route, since command picks the point. Other command events keep a null route.
- Source: the drill run's replay needs each report's provenance; every command-typed sighting so far was stored with a null route.
- Verified: four new unit tests in `src/data/sightings.test.ts` (hand entry, a read's route, a read with no route, a placed family sighting) failed first and pass, with a confirmation still null; three new harness checks in `e2e/harness/sighting.spec.ts` (a cloud read's route reaches the save; hand entry hands no read; a read with no route hands `{"route":null}`) failed first where they could, then passed with the other 10 sighting harness checks; 814/814 web unit tests; typecheck clean. The hand-entry route meets every field of the rules' `schema_RouteRecord`.

### fix(command): editing the note after a read clears that read's status, receipt and quote
- What: in `SightingForm`, any change to the note after a read sets the read state back to none and clears the What ran receipt and the From the note words. The fields the read filled keep their values, since they may already have been checked by hand, and the saved sighting still records that read's route, since the fields came from it. Before, "Suggested from the note. Check every field.", the receipt and the quoted words stayed on screen for a note they no longer described.
- Source: review finding (read status outliving the note it read).
- Verified: two new harness checks in `e2e/harness/sighting.spec.ts` (a cloud read, then an edit: status and receipt gone, Top still red; a slow read with a quote, then an edit that keeps the quoted words: the quote line gone) failed first, then passed; a third (an edit after a cloud read still saves the cloud route) guards the route; 16/16 sighting and sightings harness checks; typecheck clean.

### feat(judge): the judge page links to the public source code
- What: the /judge Links nav adds "Source code" (https://github.com/StephenSook/point-last-seen, opens in a new tab with `rel="noopener noreferrer"`) beside Command post, now that the repository is public, and drops the comment that said it would join later. `.judge-links` lays the links out in a row with a gap, since the nav had no spacing rule.
- Source: review finding (no way from the judge page to the code).
- Verified: a new `@no-backend` check in `e2e/judge.spec.ts` failed first (no link), then passed with all 31 placeholder-build checks; typecheck clean; a 390 px screenshot showed both links on one line with space between.

### feat(command): the POA heading spells out what POA means
- What: the ranked list's heading wraps POA in `<abbr title="Probability of area: the engine's estimate for each segment">`, so a reader new to search terms can find out what the column is. The heading's accessible name stays "POA".
- Source: review finding (unexplained abbreviation on the command post).
- Verified: a new harness check in `e2e/harness/rank.spec.ts` failed first (no abbr), then passed with the other rank and change harness checks (9); typecheck clean.

### feat(command): the post says when reports are still being saved and asks before the page closes
- What: while any report the post wrote is still unanswered by the server (pending, or being read back after an error), the right rail shows "Saving one report. Keep this page open." (or the count), and closing or reloading the page asks first (`beforeunload`). New `src/data/pendingWrites.ts`: `pendingCount`, `savingLine` and `guardLeave`. Firestore already keeps unsent writes in this browser (`persistentLocalCache`), so a report survives a close and is sent the next time the post opens here; the line and the prompt cover a person who would not reopen it, and the first moment after Save.
- Source: a live check whose page closed at once after Save lost its report.
- Verified: five unit tests in `src/data/pendingWrites.test.ts` failed first (no module), then passed; the full suite first caught that a plain Event's returnValue cannot be set, so it is set only on a real BeforeUnloadEvent. Two live checks in `e2e/beat.spec.ts` (offline save: the line shows, closing asks, the line clears once online; offline save, page closed after 2 s, reopened online: a separate browser reads the report from the server) failed against the live site (no line) and passed on a local build. On the live site as it is, the same reopen check passed with a 2 s wait and failed once when the page closed within milliseconds of Save. The checks sit in the beat file so they never land a report during its beat; with change, sharedLink and judge alongside, 20/20 passed. 821/821 web unit tests; typecheck clean.

### fix(command): offline, a report stored in this browser says so and the page closes without asking
- What: `writeNotice` replaces the count: online, an unanswered report still shows "Saving one report. Keep this page open." and closing asks first; offline, once Firestore shows the report from this browser's own copy (it raises that only after storing it), the line reads "Saved in this browser. It sends when you're back online." and closing does not ask, so a person offline for a while is not asked on every close and does not learn to ignore it. A report not yet stored still asks, offline too. New `src/data/useOnline.ts` follows the browser's online and offline events.
- Source: review of the first version (an offline person would be asked on every close).
- Verified: four new `writeNotice` unit tests failed first (no export), then passed (9 in the file, 825/825 web unit). The live checks in `e2e/beat.spec.ts` now cover online with Firestore's writes held back (the line, the prompt, then it clears when writes get through), offline (the stored line, and the page closes with no prompt), and the reopen proof waiting for the stored line instead of a fixed pause; with the beat check, 5/5 passed on a local build. Typecheck clean.

### fix(command): the cloud consent and receipt say the web removes phone numbers in US formats only
- What: the consent line before a cloud read of a note now reads "The note goes to Gemini in the cloud. Phone numbers in US formats are removed first.", and the What ran receipt says "the note, with US-format phone numbers removed". The web's scrubber (`removePhoneNumbers` in `src/data/sightings.ts`) handles US formats only, so a number like +44 20 7946 0958 or 404/555/0142 reaches the cloud; the old wording claimed every phone number was removed. The full shared rule follows in its own change.
- Source: review finding (privacy claim wider than the code).
- Verified: the receipt check and a new consent-line check in `e2e/harness/sighting.spec.ts` failed first on the old wording, then passed with the other sighting and sightings harness checks (16/16); typecheck clean. Run against the shared phone-number file, the current scrubber fails five removal cases the file lists as passing on web (spaced digits, spoken digits, a UK and a Mexican international number, 404/555/0142).

### feat(command): the web removes phone numbers by the shared rule, and runs the shared phone-number cases
- What: new `src/data/phoneNumbers.ts` ports the Android family app's phone-number rule line for line (seven or more digits in a row in any script, spoken digit words and repeats, separators and dashes, line breaks kept; dates, times, coordinate pairs, ZIP+4 codes after a state, month-name dates and street ordinals stay unless a short piece of a number sits beside them). `removePhoneNumbers` in `src/data/sightings.ts` now uses it in place of the US-only pattern. New `src/data/phoneVectors.test.ts` runs `shared/test-vectors/phone-numbers.json` against it, honouring `pendingOn` (a case that names "web" is skipped; `PLS_FORCE_PENDING=1` runs it), with a floor that at least one case of each type runs.
- Source: review finding (international, slash-separated and spoken numbers reached the cloud on the web).
- Verified: the runner first failed on the old scrubber (forced: 23 of the 52 shared cases); with the port, all 52 pass forced. 74 of the Android rule's own 91 test assertions, extracted from its test file into a scratch run (not committed), all pass on the port. The existing scrubber unit tests in `src/data/sightings.test.ts` pass unchanged. Typecheck clean.

### test(command): the web port runs the Android phone-number rule's own looped checks
- What: new `src/data/phoneNumbers.test.ts` carries the 17 checks from the Android rule's test file that are lists of inputs rather than single pairs: notes that must come back unchanged (times, dates, coordinates, counts, a ZIP+4 code, street ordinals), numbers whose every piece must be gone (written against dates, times, units, coordinates or a ZIP shape, spoken repeats, indented line breaks), and separators that must still join a number (spacing accents, joiners, marks outside the BMP, NEL and the Unicode line and paragraph separators, wide gaps, an Adlam number with commas).
- Source: parity check of the port against the Android rule beyond the shared cases.
- Verified: 12 tests (17 Android assertions) pass on the port; typecheck clean. With the 74 single-pair assertions run earlier, all 91 of the Android rule's assertions pass on the web port.

### fix(command): with the shared rule in place, the cloud consent and receipt say phone numbers are removed
- What: the consent line reads "The note goes to Gemini in the cloud. Phone numbers are removed first." again, and the receipt "the note, with phone numbers removed": the web now removes phone numbers by the shared rule (every one of the 52 shared cases and all 91 of the Android rule's own assertions pass), so the US-only wording would understate it.
- Source: follows the port above; the US-only wording was right only for the old scrubber.
- Verified: the receipt and consent checks in `e2e/harness/sighting.spec.ts` failed on the US-only wording, then passed (16/16 sighting and sightings harness checks); typecheck clean.

### fix(judge): the laptop check no longer mentions sample photos
- What: `d2Copy` (Get this laptop ready on /judge) says "It cannot read photos on this laptop." for a model that takes text only, and "ready for the sighting note and photos." for one that takes images; it no longer names "sample photos", since the judge page shows none and a practice search has none. The unused `photoButton` field ("Read sample photos on this laptop"), which nothing rendered, is gone.
- Source: review finding (judge-page wording about photos that are not there).
- Verified: the updated `d2Copy` tests and a new one (no line in any state names sample photos) failed first, then passed (19/19 in `src/judge/judge.test.ts`); web unit suite green; typecheck clean.

### feat(map): a cell's dot never spills past the cell, and its code moves or hides rather than sit outside it
- What: new `src/map/labelFit.ts` (`cappedDotRadius`, `codePlace`, `CODE_GAP_PX`). On every camera move `MapView`'s `place()` caps each centre dot at half the smaller side of its cell's on-screen box (a `cap` feature state the circle radius reads) and places each cell's code: left of its own dot with a 3 px gap when it fits there inside the box, else onto the centre, else hidden (`.seg-code.unfit`; the cell is still named in the ranked list and the Place list). Before, every code sat 17 px left of the centre whatever the cell's size, so on a small map codes landed outside the park outline or on a neighbour's dot, and the largest dots spilled past their cells. The rule is written out beside the plate rule in `src/map/plateRule.ts` for the phones to match.
- Source: the judge replay map at 390 px showed codes outside the outline and dots past their cells.
- Verified: seven unit tests in `src/map/labelFit.test.ts` failed first (no module), then passed. Two new map harness checks (on a 300 px map every dot's cap is at most half its cell's smaller side and every shown code sits inside its own cell, with some moved or hidden; zooming in brings codes back left of their dots) and the updated code check (on a roomy map every code sits left of its own dot) failed on the old drawing code, then passed; all 135 harness checks pass; web unit suite green; typecheck clean.

### fix(command): a note read on the laptop gives up after 30 seconds, and Save stays available during a read
- What: `readSightingText` races the laptop model's reply against `NOTE_READ_TIMEOUT_MS` (30 s, the photo read's limit; measured on Chrome's built-in model, a first session took 11.7 s and an image read's 95th percentile was 31 s) and returns `refused: "timeout"` when it is not back in time; the form then says "The read took too long. Fill the fields by hand." In `SightingForm`, saving is tracked apart from reading, so Save stays available while a read runs, and each read takes a number that Save moves past, so a reply that lands after Save fills nothing.
- Source: review finding (the note read had no time limit and Save waited for it).
- Verified: two new unit tests (a reply that never comes is refused as a timeout; the limit is 30 s) failed first, then passed; two new harness checks in `e2e/harness/sighting.spec.ts` (a timed-out read says so and fills nothing; Save works during a slow read and the late reply fills nothing) failed first, then passed with the other sighting and sightings harness checks (18/18); 818/818 web unit tests; typecheck clean.

### fix(command): the note read's time limit sits below the on-device mode line the test matrix cites
- What: `NOTE_READ_TIMEOUT_MS` moves below `sightingTextParams` in `src/ai/sightingText.ts`, so `InferenceMode.ONLY_ON_DEVICE` stays on line 44, the line `docs/TEST-MATRIX.md` cites for the web's on-device sighting-note read.
- Source: CI's matrix check (`scripts/test_test_matrix.py`) failed on the moved line.
- Verified: CI's whole Python gate list (257 tests, `scripts/test_test_matrix.py` among them) and the rules gate (39) pass locally; typecheck clean.

### fix(map): the report pin is a labelled image, so it passes the accessibility check
- What: the pin the beat drops at a new report's position (`MapView`, `.report-pin`) gets `role="img"` beside its `aria-label="Report position"`. A name on an element with no role is not allowed (axe `aria-prohibited-attr`) and is not read out; the pin stays on screen after the beat, so the defect showed whenever a report had arrived.
- Source: the live accessibility check at 390 px failed with `aria-prohibited-attr: [".report-pin"]` once live checks wrote reports during it.
- Verified: a new harness check in `e2e/harness/change.spec.ts` (after a report, the pin is an image named "Report position", and axe with the live check's WCAG tags finds no violation on it) failed first (no such image), then passed with the other change and map harness checks (18/18); typecheck clean.

### fix(extras): the replay reader checks a report's route values as the exporter does
- What: in `src/extras/replay/runSchema.ts`, a public run's route record must have a model id no longer than the shared route schema allows (80 characters, exported from `src/extras/hostApp.ts` as `ROUTE_MODEL_MAX`, the extras folder's one door to outside code) and a `latencyMs` and `decidedAtMs` of zero or more; before, any text and any number passed. The coded fields keep their lists. The exporter (`tools/export-run`) checks the same values, so the reader stays a second wall: no note text can ride in a route.
- Source: the run exporter gained a value check on routes; the reader mirrors it.
- Verified: three new tests in `src/extras/replay/runSchema.test.ts` (a route the exporter would write is taken, an 80-character model id too; an 81-character one, a negative latency and a negative decision time are refused by name) failed first where they should, then passed; the extras import guard passes; 870/870 web unit tests and the exporter's 24 tests pass; typecheck clean.

### fix(ai): a reply's source is typed with the SDK's own InferenceSource
- What: `src/ai/client.ts` exports `ReplySource` (`InferenceSource | undefined`, from `firebase/ai`) and types the text and template models' `inferenceSource` with it instead of any string, so a branch on a misspelt source ("on-device") no longer compiles.
- Source: review finding (the inference source was a plain string).
- Verified: a type test in `src/ai/clientTypes.test.ts` (`@ts-expect-error` on "on-device") failed the typecheck first with the plain string ("Unused '@ts-expect-error'"), then passed with the SDK type; the 141 AI tests and the web unit suite pass; typecheck clean.

### fix(ai): a note read keeps only what the note supports
- What: `checked` in `src/ai/sightingText.ts` passes each validated reading through `groundReading` (`@pls/engine`) before the form sees it, for the laptop read and the consented cloud read alike: a colour, direction, footwear or carried item the note does not support (filled from the missing person's profile, say) is blanked. `InferenceMode.ONLY_ON_DEVICE` stays on line 44, the line `docs/TEST-MATRIX.md` cites.
- Source: the shared grounding rule (a reading's colour, direction, footwear and carried value must come from its note).
- Verified: two new tests in `src/ai/sightingText.test.ts` (a reply claiming "red" for a note that says "blue coat" comes back with the top colour blanked and the direction kept, on the laptop and in the cloud) failed first, then passed (19/19); web unit suite and CI's Python gates (the test-matrix check among them) pass; typecheck clean.

### fix(command): a note read keeps the fields a person changed by hand
- What: `SightingForm` remembers which of Going, Top, Bottom, Footwear and Carrying the person changed by hand, and `fill` sets only the others, so a model's guess never overwrites what a person picked or typed. When a read kept an edit, the status reads "Suggested from the note. Check every field. Your edits were kept."
- Source: review finding (a read overwrote hand edits).
- Verified: a new harness check in `e2e/harness/sighting.spec.ts` (Top set to green and Footwear typed by hand, then a read that answers red: Top stays green, Footwear stays, and the status says the edits were kept) failed first, then passed; a second (no edits: every field fills and the status says nothing about edits) guards the plain case; 20/20 sighting and sightings harness checks; web unit suite and CI's Python gates pass; typecheck clean.

### fix(hosting): pages, version.json and the service worker are revalidated on every load; hashed assets are kept a year
- What: `firebase.json` hosting gets three header rules that never overlap: `no-cache` for everything outside `/assets/` and `/tiles/` (pages, `version.json`, `sw.js`, `sw-takeover.js`, the manifest, the published run), `public, max-age=31536000, immutable` for Vite's hashed `/assets/`, and `public, max-age=3600` for the basemap tiles (unchanged). Before, Hosting served every file with `max-age=3600`, so a judge could keep the old app for an hour after a deploy.
- Source: found on another project with the same hosting; confirmed on this site (every path answered `max-age=3600`).
- Verified: new tests in `scripts/test_firebase_config.py` read each path through the header rules the way Hosting matches its globs (a glob check against known paths; pages, `version.json`, the service worker and evidence get exactly `no-cache`, a hashed asset exactly the year, a tile the hour) and failed first with no headers, then passed; a deployed check in `e2e/smoke.spec.ts` failed against the live site ("max-age=3600") and passes once this is deployed; CI's Python gates pass.

### test(e2e): the offline reopen check marks its note with letters, which the phone-number rule keeps
- What: `e2e/beat.spec.ts` builds each note's unique marker from the timestamp's digits written as letters. With the shared phone-number rule, a run of seven or more digits is removed before the note is stored, so the timestamp marker the reopen check looked for was never in the saved note, and the check failed although the report arrived.
- Source: the full live run after deploying the phone-number rule failed this one check.
- Verified: against the live site at 32d36fec the reopen check failed with the digit marker (the note was not found), and all five checks in `e2e/beat.spec.ts` pass with the letter marker.

### fix(ai): a note that does not look like English is not sent to the cloud
- What: `readSightingTextInCloud` checks the note with `looksEnglish` (`@pls/engine`) exactly as typed, before phone numbers are removed (removing one writes "[number removed]", English words that could let another language pass), and refuses with `not-english` before anything is sent. `SightingForm` then says "This note doesn't look like English, so it isn't sent to the cloud to be read. Fill the fields by hand."; the laptop read and hand entry stay available. `InferenceMode.ONLY_ON_DEVICE` stays on line 44.
- Source: the shared language screen (English-only prompts; a note in another language is filled by hand).
- Verified: a new unit test (a Russian note with a phone number and a Chinese note with numeral digits are both refused, with the cloud never called) failed first, then passed, and an English note is still read; a new harness check (the form shows the sentence and fills nothing) failed first, then passed with the other sighting and sightings checks (19/19); typecheck clean.

### test(e2e): the console error fixture ignores only the placeholder keys' refused App Check and sign-up
- What: `e2e/fixtures.ts` no longer counts the two refusals the no-backend run's placeholder build always gets from Google: the reCAPTCHA Enterprise token request (`k=ci-build-check`) and the anonymous sign-up (`key=ci-build-check`), each refused with HTTP 400, and their URL-less "Failed to load resource" console lines (matched by the console line's location). The match needs the placeholder key in the URL, so the live site's keys never match and every other failure still counts. These refusals arrive at a moment that races a check's last line, which made `e2e/fonts.spec.ts` fail now and then. A new `e2e/consoleErrors.spec.ts` (tagged `@placeholder-build`, which `playwright.config.ts` leaves out because it serves real keys) waits for both refusals, then expects no recorded error, and checks that a sign-up refused for any other key is still recorded.
- Source: an intermittent no-backend failure of `e2e/fonts.spec.ts` on a placeholder build.
- Verified: the new check failed first with the old fixture (both refusals and both console lines recorded), then passed; repeated 15 times with `fonts.spec.ts` (30/30), and the whole no-backend run passes (32/32); against the live site the fixture's users (smoke, fonts, judge) pass 21/21, and the live runner lists the same 71 checks as before.

### fix(command): with cloud reading paused by command, the note form says so and offers no cloud read
- What: `SightingForm` takes `cloudPaused` (the command post passes Remote Config `kill_cloud`). While it is on, the form shows "Cloud reading is paused by command." where the "Read in the cloud" and "I consent for this note" buttons were, and a cloud read refused as `cloud-paused` (command paused after the consent was shown) says "Cloud reading is paused by command. Fill the fields by hand." instead of the generic "The note could not be read.", with no cloud button left.
- Source: review finding (a paused cloud read looked like a failed one, with both cloud buttons still offered).
- Verified: two new harness checks in `e2e/harness/sighting.spec.ts` (paused before the read: the line shows and no cloud button; paused at the consent: the line shows, the consent button goes, and the generic sentence never shows) failed on the old form, then passed with the other sighting and sightings checks (23/23); web unit suite and CI's Python gates pass; typecheck clean.

### feat(command): a confirmed sighting with a place becomes the new last known point
- What: command's Confirm on a sighting that has a place (GPS or a map point) and a time seen now writes the confirmation and a ring prior rebuilt from the sighting's place in one batch (`web/src/prior/sightingPrior.ts`, the camera path's `cameraPriorWrites`), with the direction-of-travel wedge on when the sighting's "Going" is a compass point. The sighting joins the prior's inputs and the version goes up, so the engine never applies it again as a clue. A sighting with no place stays a clue; a family-only confirmation does not rebuild. What changed says "New last known point: the sighting at AU, seen N min before it was confirmed. The map is rebuilt from there." (before, a confirmation that rebuilt the prior read "Map unchanged"). The Direction of travel switch now takes its bearing from the newest prior input, a camera sighting or a confirmed sighting (`travelBearingFromInputs`). The sighting's own event, its route included, is never changed.
- Source: review (a confirmed sighting moved its segment only from 1.0% to 1.3%, as a clue, while a confirmed camera sighting rebuilt the map; in search and rescue a confirmed sighting is the new last known point).
- Verified: new unit tests failed first, then pass: `sightingPrior.test.ts` (the rebuild equals `buildPrior` from the sighting's place, the inputs and version, the wedge from a compass direction, no place throws, not applied again as a clue), `viewState.test.ts` (the new banner; a family-only confirmation keeps the clue line), `cameraSighting.test.ts` (a sighting's direction as the travel bearing; the newest input decides). Web typecheck, 931 unit tests, the build and 33 no-backend browser checks pass.

### fix(command): an older confirmed sighting stays a clue instead of moving the start back
- What: only a sighting seen later than every one of the map's inputs (a confirmed sighting's or a camera's time seen) becomes the new last known point (`sightingNewLkp` and `sightingSeenBeforeStart` in `web/src/prior/sightingPrior.ts`). An older one, or one seen at the same time, is confirmed as a clue, and What changed ends with "It was not seen after the current last known point, so it counts as a clue." While an input is not loaded, Confirm writes nothing and shows "Not saved. Try again."
- Source: review (command confirms in the order reports are reviewed: a sighting seen at 13:30 confirmed after one seen at 14:00 moved the start back, and the banner said "New last known point").
- Verified: new tests failed first, then pass: the 14:00 then 13:30 pair, an equal time, a camera input's time, an unloaded input and an empty input list (`sightingPrior.test.ts`), and the clue line (`viewState.test.ts`); 943 web tests, typecheck, the build and 33 no-backend browser checks pass.
### feat(data): read, check and write the incident's typed conditions
- What: new `web/src/data/conditions.ts`. `parseConditions` turns command's typed temperature and wet answer into `{ tempF, wet, setAtMs }` (an empty temperature is not known; anything else must be a plain number from -80 to 140, the rules' range); `conditionsOf` reads an incident's conditions only when they have the shared shape; `urgencyChip` names the phones' chip in the iPhone's words through the engine's `urgencyFromConditions`; `URGENCY_SOURCE_LINE` cites shared/constants/urgency.json as the iPhone does; `setConditions` writes `incident.conditions`.
- Source: nothing wrote incident.conditions, so the phones' urgency chip never showed.
- Verified: `src/data/conditions.test.ts` (6 tests) failed first (no module), then passed; web unit suite and typecheck pass.

### feat(command): a conditions form shows the urgency chip the phones show
- What: new `ConditionsForm`: air temperature (°F), "Is the person likely wet?" (Yes, No, Not known) and Save conditions. Saved conditions show as "Read at <time>: <temp>, wet: <answer>." with the chip the phones show ("Cold raises urgency", "Cool and wet raises urgency"), the line "A planning cue from a cited source, not a medical judgment." and the CDC source with its link; without a chip it says the phones show no urgency cue. A bad temperature is refused before anything is sent, a refused write says "The conditions were not saved. Try again." and keeps the fields, and a closed incident cannot be saved. New harness page `harness/conditions.html` and styles.
- Source: nothing wrote incident.conditions, so the phones' urgency chip never showed.
- Verified: 6 new harness checks in `e2e/harness/conditions.spec.ts` failed first (no form), then passed; typecheck clean.

### feat(command): the command post writes the incident's conditions
- What: the rail shows `ConditionsForm` for the incident, above the family channel, writing `incident.conditions` through the incident update rule (closed incidents excluded); the phones read it for their urgency chip. New deployed check `e2e/conditions.spec.ts` saves a value on the test drill, waits for the server to take the write, and expects the chip.
- Source: nothing wrote incident.conditions, so the phones' urgency chip never showed.
- Verified: typecheck clean; web unit suite (928) and CI's Python gates pass; the full harness suite passes except the triage measurement, which needs the build env file this worktree lacks and passes where it is present; the deployed check runs after the deploy.

### test(judge): the route-order check goes with the numbered route
- What: `e2e/judge.spec.ts` no longer checks that the numbered route follows the page's sections; the judge page's first screen dropped the route list, and `e2e/judgeRun.spec.ts` now asserts the list is gone.
- Source: merge with main (the judge page opens with the door, the practice card and the replay).
- Verified: the full no-backend browser set and the web unit suite pass.

### feat(web): static privacy and support pages, readable with no script
- What: `web/privacy.html` and `web/support.html` are Vite inputs beside the app (`vite.config.ts` `build.rollupOptions.input`), styled by `src/theme/pages.css` with the app's fonts and colours. Their text is in the HTML the server sends, so a reviewer's fetch, a browser with scripts off and a visitor the service worker already controls (its precache serves `/privacy` as `privacy.html`) read the same words. Support says what the app is, that this version runs practice searches only, and links help on GitHub issues; both carry a DRAFT line until their wording is approved.
- Source: the App Store submission needs public privacy and support pages.
- Verified: `e2e/publicPages.spec.ts` (5 no-backend checks: served HTML with no app shell, scripts off, support content, a service-worker-controlled visit) failed 6 of 6 against a build without the pages, then passed; the full no-backend set (38), web unit suite, typecheck and hygiene guard pass. A deployed-only check fails while either live page still says DRAFT.

### feat(web): the privacy and support pages carry their approved text
- What: `/privacy` publishes the approved privacy policy word for word (`web/legal/privacy-policy.md` is its source; "Last updated: November 20, 2026" is the only fill), and `/support` carries its approved lines: what the app is, that every drill uses made-up information, how to ask for help or a data request on GitHub issues without posting personal details, and a link to the policy. The DRAFT lines are gone.
- Source: the approved texts for the App Store submission.
- Verified: new `src/legalPages.test.ts` checks that the privacy page's main text equals the policy file and that the support page's text is exactly its approved lines; it failed 3 of 3 on the DRAFT pages, then passed. The browser checks in `e2e/publicPages.spec.ts` follow the new headings and links; the no-backend set (41) passes against a fresh build, with the web unit suite (938), CI's Python gates and the hygiene guard.

### fix(command): on a laptop the command post never scrolls the document
- What: `.post` is the window's height (`100dvh`), positioned, with overflow hidden, and each `.rail` is positioned, so absolutely placed children (the visually hidden spoken lines, such as What changed's status) stay inside their rail's scroll instead of making the document taller; phones keep the one-column page that scrolls (`overflow: visible` there). New harness page `harness/post-layout.html` with the real post grid and What changed section.
- Source: UI review (the document was 1040 px in a 900 px window, so focus or scrollIntoView moved the app and hid the header; 7,730 px on the live joined post).
- Verified: `e2e/harness/postLayout.spec.ts` (laptop: no document scroll, focus scrolls the rail, header stays at the top; phone: the page still scrolls) failed first (1,879 px in 900), then passed; the full harness suite passes except the triage measurement (needs the build env file); the no-backend set (35) passes. New deployed check `e2e/postLayout.spec.ts` failed on the live site (7,730 px in 900) and runs again after the deploy.

### test(command): the live What changed check knows the confirmed-sighting banners
- What: `e2e/change.spec.ts` also accepts "New last known point: ..." (a confirmed sighting with a place that rebuilt the map) and the clue line with "It was not seen after the current last known point, so it counts as a clue." added, on screen and in the spoken line, with each banner form named once.
- Source: a confirmed sighting on the test drill now shows these banners, which the check refused.
- Verified: the check failed on the live site with the older-sighting banner, then passed live; the patterns accept each banner form and refuse a truncated one.

### feat(command): the rail leads with what changed, the plan and the top segments
- What: the command post's right rail now opens with What changed, Plan and the POA top 5, then who to look for and the sighting actions (Add sighting, Add camera clip, Sightings). Conditions, Family, Prior model, Prior, Family photos, Debriefs and Reports by team move under one closed "Details" at the foot of the rail (`data-testid="rail-details"`). Each section is unchanged and keeps its data-testids; the live checks that use a moved section open Details first (`openDetails` in `e2e/fixtures.ts`), and the accessibility check scans the post with Details open as well.
- Source: UI review (the rail led with the profile and forms; the three things command reads every minute were below the fold).
- Verified: new deployed check `e2e/railOrder.spec.ts` (lead order, the sections under a closed Details, Family hidden until Details opens) failed on the live site, and runs again after the deploy; typecheck, web unit suite (953), the harness suite (except the triage measurement, which needs the build env file), the no-backend set (41), CI's Python gates and the hygiene guard pass.

### fix(data): the phone rule removes a number spoken in Spanish digit words
- What: `removePhoneNumbers` counts cero, uno, dos, tres, cuatro, cinco, seis, siete, ocho and nueve as spoken digits, matched in any case, as the shared rule now names them; "un" and "una" stay articles. An English note carrying "cuatro cero cuatro cinco cinco cinco cero uno cuatro dos" no longer keeps the number.
- Source: privacy gap (a number spelled in Spanish digit words passed the rule).
- Verified: run against the six new shared cases with their pending platforms forced, the web vector test failed 4 (the two keep cases already passed), then passed all 58; new unit checks in `src/data/phoneNumbers.test.ts` (a Spanish spoken number in any case is removed; un and una are kept) failed on the old rule, then passed; web unit suite, typecheck and the hygiene guard pass.

### feat(command): the sighting form shows when, where, the note and Save first
- What: in Add sighting, Seen at, Place, the Note with Read the note and its status lines, and Save sighting come first; Going, Top, Bottom, Footwear, Carrying, Reported by and the callback wait under a closed "More details". A read that fills the fields opens More details, so every filled field is in view when the form says "Check every field."
- Source: UI review (Save sat about 950 px below the top of the form).
- Verified: two new harness checks in `e2e/harness/sighting.spec.ts` (the first fields and Save in view, Save within 560 px of the form's top, the rest hidden until More details opens; a filling read opens it) failed first, then passed; the checks that pick a field by hand open More details first, and value checks also find a closed field; the sighting and sightings checks (25) and the full harness suite pass (except the triage measurement, which needs the build env file); typecheck, web unit suite (953), CI's Python gates and the hygiene guard pass.

### feat(command): the mass beyond the grid reads "Beyond the drill area", with how far the rings reach
- What: the POA ranking's row for the mass beyond the grid is now "Beyond the drill area" (it stays below the top segments, so the first number read is a segment), and under the table one computed line says how far the search rings reach and how big the drill area is ("The search rings reach 12.8 km; this drill area covers about 1.0 by 1.6 km."): the reach is the outer ring of the incident's engine parameters for its terrain, the size the segments' outer bounds (`web/src/command/reach.ts`). What changed says "beyond the drill area" too, and the live What changed check follows.
- Source: UI review (the largest number, "Outside the mapped area 92%", read as the map missing the person).
- Verified: new `src/command/reach.test.ts` (the area from the segments' bounds, Polygon and MultiPolygon; the line from the outer ring; nothing without rings or segments) failed first (no module), then passed; two harness checks in `e2e/harness/rank.spec.ts` (the new label on the last row; the computed line) failed first, then passed; typecheck pass.

### feat(command): the rail's Details summary counts what needs a person
- What: the Details summary reads, from live data, the conditions once set ("38 °F, wet: no"), the family photos with no reading saved by command ("2 photos to review", from a new live subscription to the photo readings, `subscribePhotoReadingIds`), and the family answers that arrived since this browser last opened Details ("1 family answer"; the time is kept per incident in local storage, and an answer with no time yet counts as new). Nothing to show reads "Details". The conditions stay in view above Details until they are set, then move under it. The counting is `web/src/command/detailsSummary.ts`.
- Source: UI review (photos and answers under a closed Details would go unnoticed; command types the conditions at the start of a drill).
- Verified: new `src/command/detailsSummary.test.ts` (the summary in the singular and plural, with and without conditions; what counts as to review and as new) failed first (no module), then passed; the deployed rail check now also reads the summary, places the conditions by whether they are set, and checks that opening Details clears the answer count; web unit suite (958), the no-backend set (41), typecheck, CI's Python gates and the hygiene guard pass.

### fix(command): What changed reads a line once when the shown and spoken words match
- What: when the banner and the spoken line are the same words (a sighting waiting for command's confirmation), the banner is hidden from assistive technology and the live line speaks it, so a screen reader and the accessibility tree have the line once instead of twice. A banner with different spoken words is unchanged. The change harness gains `?confirm=1`.
- Source: UI review (What changed showed "Sighting saved. Confirm it under Sightings to move the map." twice).
- Verified: a new harness check in `e2e/harness/change.spec.ts` (the line once in the section's accessibility tree, still shown and still the live line) failed first (twice), then passed with the change and beat checks (8); typecheck, web unit suite and the hygiene guard pass.

### fix(web): the privacy policy says how long drill data is kept, as the retention job keeps it
- What: under "How long it is kept", the first line now reads "Drill data is deleted 30 days after the search command closes the drill. The four drills we use for development, judging, testing and our film are deleted on January 1, 2027, or the next day if a step has to be retried." (the policy source `web/legal/privacy-policy.md` and the page). The line about the practice drill is unchanged.
- Source: drill retention is deployed; the earlier line said nothing deleted drill data automatically.
- Verified: a new check in `src/legalPages.test.ts` reads `functions/src/retention.ts` and requires the policy's days to equal `DRILL_RETENTION_MS`, exactly four kept drills, and all four on the one date the policy names (a named constant is resolved); it failed while two drills had no end date and passes on the retention job that deletes all four on January 1, 2027. The page's text still equals the policy file.

### fix(command): the plan card says one thing about where its words came from
- What: the draft line now reads "Draft for the current reports." (it said "from this laptop" while What ran could name the cloud), and a fallback plan no longer adds a notice sentence such as "The cloud step did not answer. The plan below uses fixed wording.": its route mark (Fixed wording) shows it, and What ran says why the model was not used. Each assignment stays one line: the team, its task and its reason, as the team's phone receives them.
- Source: UI review (the card said "Draft from this laptop" and "The cloud step did not answer" together, while What ran said cloud).
- Verified: a new harness check in `e2e/harness/plan.spec.ts` (a fallback shows Fixed wording, no notice sentence, the reason under What ran, no "this laptop") failed first, then passed; a second check pins one line per assignment (it passed before and after); the plan checks (10), web unit suite (983), typecheck and the hygiene guard pass.

### fix(command): the header's match code is labelled Radio check
- What: the command post header labels the match code "Radio check" instead of "MATCH": the code teams read over the radio, where the same code means the same prior version and the same reports. The drill line and the wordmark are unchanged; `data-testid="convergence-code"` stays. The live layout and judge checks look for the new label.
- Source: UI review ("MATCH" did not say what the code is for).
- Verified: the live layout check with the new label failed on the live site ("MATCH"), and runs again after the deploy; typecheck, web unit suite and the hygiene guard pass.

### fix(command): a reopened practice search says it is opening, not show the join form
- What: while the post reconnects to the incident its link names (a reload or a reopened tab), it shows "Opening practice search" (a practice search, `judge-...`) or "Opening incident <id>" instead of a disabled join form; without a linked incident the join form shows as before, and a link that needs a code still reaches the join form once the sign-in answers. The wording is `web/src/command/connecting.ts`.
- Source: UI review (a reload of a practice search showed the join form for 2 to 3 seconds).
- Verified: new `src/command/connecting.test.ts` (practice, other incident, none) failed first (no module), then passed; the live practice check now reloads the practice search and requires that the join form never appears and the opening line does, which failed on the live site (the join form showed) and runs again after the deploy; the no-backend set (42), web unit suite (987), typecheck, CI's Python gates and the hygiene guard pass.

### feat(judge): the Android link opens the latest published judge release
- What: `ANDROID_RELEASE_URL` is GitHub's `/releases/latest` instead of a fixed tag, so a new judge build (android-judge-2 and later) needs no code change. A new browser check asks GitHub for that URL signed out and requires a 200, a final address on an `android-judge` or `android-judge-N` tag, and a `point-last-seen-family-<sha>.apk` asset on the page.
- Source: review (android-judge-2 was published; the link should follow the newest build).
- Verified: the unit test for the URL failed first, then passes; 1000 web unit tests, typecheck, the build and 43 no-backend browser checks pass (the new check resolved /releases/latest to android-judge-2).

### test(command): the shared-link check runs as a visitor who has not joined
- What: `e2e/sharedLink.spec.ts` now opens with no saved sign-in, as a forwarded link reaches someone who has not joined. The live run's saved session is a command member of the test drill, and since the post now says it is opening a linked incident while it reconnects, that session goes straight to the post, so the join form the check reads never appeared.
- Source: the live run after the reopening change.
- Verified: the check failed live with the saved session, then passed live (3) as a fresh visitor, and passes in the no-backend run.

### feat(judge): a Measured block with the stored numbers, refusing an old file
- What: the judge page reads `/evidence/measured.json` (`web/src/judge/measured.ts` `loadMeasured`, `measuredLines`) and shows, under "Stored on our servers", where stored report reads and plan wording ran (on the device, by the cloud model, by fixed rules) with each route's median time, and the cloud model's spend per day. Beside an on-device count of none, a line says why (an iPhone's practice drill keeps its reads on the phone; a plan is worded on the laptop only with Chrome's built-in model). No number is typed in the page; a file older than 30 days or one it cannot read shows a line and no numbers.
- Source: review (a measured block on a judged surface).
- Verified: 6 new unit tests failed first (no module), then pass; a new no-backend browser check reads the served file's counts on the page and refuses a 2020 file; 1010 web unit tests, typecheck, the build and 44 no-backend browser checks pass.

### fix(judge): the Measured block counts reads with no route recorded
- What: when the file counts reads with no route recorded, the block says "n with no route recorded", so the parts add up to the total; a non-integer unknown count makes the file unreadable.
- Source: review (the parts should add up to the total).
- Verified: a new unit test failed first, then passes (7).
### feat(command): on a phone a bottom bar keeps Add sighting and Plan in reach
- What: at phone width the post has a bar fixed to the bottom ("Quick actions") with Add sighting, which opens the sighting form and brings it into view, and Plan, which brings the plan into view; the page leaves room for it so it never covers the end of the rail. It is not shown on a laptop, where the rail holds both.
- Source: UI review (on a 390 px phone Add sighting sat about 1,030 px down the page).
- Verified: a new deployed check in `e2e/phone.spec.ts` (the bar at the bottom of a 390 by 844 window; Plan brings the plan into view; Add sighting opens the form in view) failed on the live site (no bar) and runs again after the deploy; the post layout harness, the no-backend set (43), web unit suite (1000), typecheck and the hygiene guard pass.

### fix(map): on a phone the walker model's sentence spans the foot of the map
- What: at phone width the walker model's sentence under the map ("The walker model is a prior for planning. It does not predict where a person is.") spans the map's width just above the credit line, in one or two lines; it was held to the map's width minus 320 px, a column about 70 px wide that ran down the map's left edge. The laptop layout is unchanged. The map harness gains `?note`.
- Source: UI review (on a phone the walker caption box covered the map's left edge).
- Verified: a new harness check in `e2e/harness/map.spec.ts` (at 390 by 844 the sentence is at most 40 px tall, wider than 60% of the map, and clear of the credit line) failed first (138 px tall), then passed with the other map checks (16); typecheck, web unit suite and the hygiene guard pass.

### fix(map): a change chip never covers another cell's percent or code
- What: a change chip ("+0.2 pts") sat 16 px above its cell's dot whatever was there, so on a dense grid it covered the cell above's percent. Now each chip is placed after the plates and codes, on every camera move: above the dot, else right, else left, else below its own plate, whichever covers nothing. When every place covers something, it takes the one that covers the least (another cell's code before a percent, another chip last) and hides what it covers while it is there; those cells are still named in the ranked list. `chipPlace` in `web/src/map/labelFit.ts`; plates carry their segment id.
- Source: UI review (on a laptop the "+0.2 pts" chip covered BC's percentage).
- Verified: new `chipPlace` unit tests failed first, then passed; a new harness check in `e2e/harness/change.spec.ts` (at 1440 by 900 and 1100 by 700, then zoomed out two steps, every chip inside the map and none over a visible percent or code) failed on main ("+14.7 pts over 7.5%", "3.5%", "1.0%" two steps out), then passed with the change and map checks; typecheck, web unit suite and the hygiene guard pass.

### feat(prior): rebuilds carry the site's elevations for the elevation layer
- What: `rebuildPrior` takes the site's per-segment elevations (`site.elevationM`) and, when the elevation layer is on, gives the engine the start segment's elevation from the rebuild's own start point (`segmentElevations`), so a rebuild from a new last known point measures from that point; it refuses without the file or with the start outside every segment. `cameraPriorWrites` passes them through (camera and sighting confirms). `loadElevationM` reads the site's elevation file (the one the terrain display reads) into a per-segment mean.
- Source: review (terrain layer, approved).
- Verified: new tests failed first, then pass: `rebuild.test.ts` (equals buildPrior with the start's elevation; ROW kept; refusals), `cameraPrior.test.ts` (from the camera's place; refusal without elevations), `elevation.test.ts` (this grid's file; no file, another grid's, broken, offline).

### feat(command): a Downhill and level ground switch where terrain ships
- What: the Prior panel shows a third switch, off by default, only when the site's elevation file loads (the Kennesaw drill grid). Its line gives the ISRID shares from the engine's constants (42% downhill, 39% about level, 19% uphill; p. 164; no n printed) and says the 3 m band is ours. It is disabled on urban terrain ("the source has no urban split") and when the start point's segment has no elevation; choosing the urban table turns it off. Like the other switches it asks before it rebuilds. The command post loads the file once per grid and passes the elevations to every rebuild (layers, the prior model switch, camera and sighting confirms).
- Source: review (terrain layer, approved).
- Verified: 4 new harness checks failed first, then pass (15 in layers.spec.ts); 1031 web unit tests, typecheck, the build and 43 no-backend browser checks pass; the Kennesaw file covers all 338 segments.
### chore(e2e): the harness and extras dev servers take their port from the environment
- What: `e2e/harness.config.ts` reads `PLS_HARNESS_PORT` (default 5175) and `e2e/extras.config.ts` reads `PLS_EXTRAS_PORT` (default 5176) through `e2e/harnessPort.ts`, which refuses anything but a whole number from 1024 to 65535. Each server starts with `--strictPort`, so two worktrees running the same suite at once collided on one port; now each can use its own. CI and an unset variable behave as before.
- Source: review (two worktrees' harness runs failed on a busy port 5175).
- Verified: new `src/e2eConfig.test.ts` (defaults 5175 and 5176, the variables move base URL, server command and ready URL, bad values refused) failed first, then passed; the map harness checks pass with `PLS_HARNESS_PORT=5185` (16); typecheck, web unit suite and the hygiene guard pass.

### feat(command): the Teams strip picks a team and outlines its cells
- What: the Teams rail is a narrow strip (160 px, was 200 px), so the map gets the width. Each team is a button: pressing it makes that team the active one (its name in fg-1, the others in fg-4) and outlines its assigned cells on the map in 2 px fg-1 on a bg-0 casing, under the cyan outline of the newest change; pressing it again clears the pick. With no team picked every name reads in fg-2; before, no team could ever be active, so every name was fg-4 grey. The map element names the outlined cells in `data-team-outline`. New harness `web/harness/teams.html`.
- Source: UI review (teams rail as a narrow strip, active team in fg-1; no team was ever active).
- Verified: new harness checks in `e2e/harness/teams.spec.ts` (strip at most 168 px; names fg-2 with none picked; a click and the Enter key pick a team, recolour the names and outline its cells; a second press clears; a team with no task outlines nothing) failed first (rail 200 px, no team buttons), then passed; a screenshot shows Team 2's cells AB and AC outlined; typecheck, web unit suite and the hygiene guard pass.

### fix(prior): the elevation layer never blocks a confirmation
- What: `usableLayers` keeps the elevation layer on only where the site's elevations are loaded and the start point is inside a segment that has one. A camera or sighting confirm whose new start is outside every segment, or one made while the file is missing, now rebuilds and saves the prior with the layer off instead of throwing before the confirmation is written. Turning the prior model back to rings does the same.
- Source: review (cross-family, high).
- Verified: new tests failed first, then pass: `usableLayers` (kept; turned off without the file, outside, or with no start elevation; other layers untouched) and the camera confirm with no file and outside the grid (equal to the ring prior from that point).

### fix(command): elevations bound to their grid; a saved layer can always be turned off
- What: the command post keeps the loaded elevation map with the grid it was loaded for (`elevationFor`) and clears it on a grid change, so a slow load never applies another site's heights (Piedmont's segment ids also exist in the Kennesaw file). The elevation switch now also shows wherever the saved layer is on, even when the site's file did not load, so command can turn it off; it turns on only where the start has an elevation.
- Source: review (cross-family, medium).
- Verified: new tests failed first, then pass: `elevationFor` (own grid; another grid; loading) and the harness check for a saved layer whose file did not load (16 in layers.spec.ts); 1036 web unit tests, typecheck, the build and 43 no-backend browser checks pass.

### fix(prior): no rebuild before the map's segments load
- What: `rebuildPrior` refuses an empty segment list ("The map's segments have not loaded yet."). Segments arrive through their own listener, so a sighting or camera confirm made after the incident and events loaded but before the segments did would have saved the confirmation, the new start and a new prior version with all mass outside the grid, leaving every stored segment's old probability in place. Every rebuild path goes through `rebuildPrior`, so all are covered.
- Source: review (cross-family, high).
- Verified: new tests failed first ("expected [Function] to throw"), then pass: `rebuildPrior([])` and `cameraPriorWrites([])` with the elevation layer off and on; 1038 web unit tests, typecheck, the build and 43 no-backend browser checks pass.

### fix(prior): no rebuild from a partly loaded grid
- What: `rebuildPrior` refuses a segment list in which a segment names a neighbour, upstream or downstream segment that is not in the list ("The map's segments have not all loaded yet."). A cached snapshot can hold only some segments, and the listener drops a document with unreadable geometry; a confirm from either would have saved a new prior version over part of the grid and left the rest on the old prior. Both shipped grids are closed and connected (no dangling names; neighbours symmetric), so any partial set is caught.
- Source: review (cross-family, high).
- Verified: a new test failed first ("expected [Function] to throw"), then passes: a linked 9-segment grid rebuilds, 8 of its 9 are refused, and dangling upstream or downstream names are refused; 1039 web unit tests, typecheck, 179 harness checks, the build and 43 no-backend browser checks pass; closure and connectivity checked on shared/grid/*.grid.json.

### fix(command): the Prior panel says its switches are rings settings under walkers
- What: with the walkers prior in use, the Prior panel adds "These apply when the prior is rebuilt as rings.", since the stored layers (elevation included) are kept for the rings rebuild. The elevation line says "the source prints no sample size" instead of "no n printed"; LIMITS matches.
- Source: review.
- Verified: the new harness check failed first without the line, then passes (17 in layers.spec.ts).
### test(harness): at phone width the map and change harnesses keep the map in the tall row
- What: the phone layout's `.map-wrap { order: -1 }` moved the map ahead of the harness's drill line, into its auto row, so at 900 px and below the harness map was 0 px tall and the drill line sat over the cells; checks run there (the small and crowded map checks at 300 by 420) measured a map with no height. The drill line now has `order: -2` in `web/src/harness/mapHarness.tsx` and `changeHarness.tsx`, so the map keeps the tall row, as on the command post.
- Source: found while adding a pointer check to the map harness at 300 by 420 (the pointer landed on the drill line).
- Verified: new checks in `e2e/harness/map.spec.ts` (at 390 by 844 both harness maps are over 500 px tall and the canvas is the top element at their centre) failed first (0 px), then passed with every map and change check (25); typecheck and the hygiene guard pass.

### feat(map): one mark per cell: small dots, and codes with zoom or the pointer
- What: a cell's dot is now at most 35% as wide as the smaller side of the cell on screen (it could be the whole cell), so on a phone the fills carry the map instead of white dots. A cell's code shows only when the cell is 40 px or more on its smaller side, so codes come with zoom; under that, pointing at a cell shows its code on the centre. Both are decided again on every camera move (`DOT_CAP_SHARE` and `CODE_MIN_CELL_PX` in `web/src/map/labelFit.ts`). The dot keeps its fg-2 colour and bg-0 ring, which hold 3:1 against every probability step. The live phone and accessibility checks wait on a new `mapDrawn` fixture (codes in the page and the map settled), since a phone shows no codes until zoomed in.
- Source: UI review (one mark per cell: dot capped near 35% of the cell; codes only at zoom or hover; on the phone the white dots covered the fills).
- Verified: new `labelFit` unit tests and a new harness check (three steps out, every dot at most 35% of its cell, no code on a cell under 40 px, the pointer shows a cell's code and moving off hides it) failed first (25 dots over the cap), then passed; the crowded map check now states that codes wait and that pointing at AB names it; the full harness suite (173), the extras suite (70), typecheck, web unit suite and the hygiene guard pass. On the deployed post the phone cells were about 26 px and the laptop cells about 57 px.

### fix(data): any punctuation or symbol between digit groups joins a phone number
- What: `removePhoneNumbers` kept a number whose groups were split by a character outside its separator list: a middle dot (U+00B7), a hyphenation point (U+2027), a bullet, an underscore, a star, a bar or a bracket ("Call 404 555·0142" was stored as written). A gap between two parts now joins them unless it holds ":", "%" or "°", which mark a time, a percent and a degree; a gap never holds a letter or a digit, since those are parts. Debrief notes, sighting text and sheet reads all go through this rule.
- Source: review (cross-family, privacy).
- Verified: new tests in `phoneNumbers.test.ts` failed first on the old rule (the 9 split shapes), then pass; spaces of every width, an em dash, full stops and full-width forms still go; a degree-sign GPS pair, degrees-minutes-seconds, a percent list and two times stay. Against the draft shared cases (15 new removals, 4 new keeps) all 77 pass on the web; 1052 web unit tests, the typecheck, the gates, the build and 43 no-backend browser checks pass.

### fix(data): a semicolon, bar, ! or ? never joins a phone number
- What: the marks that never join two digit groups are now : % ° ; | ! and ?. With only the first three, a semicolon or a bar joined, and notes main kept were erased: "GPS 33.7490; -84.3880", "Seen 2026-11-19; 3 searchers", "Radio 155.160 | 154.205", "Check-ins 08:30; 11:45; 14:03". None of the seven sits inside a phone number; a number split by a bar ("404 | 555 | 0142") is kept, as on main.
- Source: review (cross-family).
- Verified: the new keep test failed first ("GPS [number removed]"), then passes, with the same notes after "?" and "!"; 80 draft shared cases pass on the web; 1051 web unit tests and the typecheck pass.
### test(prior): a 30 s timeout on the prior rebuild tests
- What: every describe block in `rebuild.test.ts` and `cameraPrior.test.ts` runs with `{ timeout: 30_000 }`. Each case builds a whole prior, and on a loaded machine two of them passed vitest's 5 s default (5.4 s and 5.7 s) and failed once, then passed alone.
- Source: review.
- Verified: a scratch 6 s test in a block with the option passed and failed without it (deleted after); 52 prior tests and the typecheck pass.
### feat(command): the practice search offers a one-click first report that moves the map
- What: on a practice search, until command has confirmed or rejected any report, the rail opens with "Try a report": "A park worker saw a man in a blue coat at the south end of the park, in segment CD, 10 minutes ago." and one button, "Add and confirm this report". It saves the sighting the way the sighting form does (seen 10 minutes before now, blue top, from park staff, labelled a drill inject), waits until the server has it, then confirms it through the same handler as the Sightings panel's Confirm (`decideSighting`, pulled out of the panel's inline handler unchanged), so the prior is rebuilt from it as the new last known point. The card says which step it is on and why it stopped. Rules in `web/src/command/firstReport.ts`, card in `FirstReportCard.tsx`, harness `web/harness/first-report.html`.
- Why CD: a local simulation on the seed drill (every segment tried as the confirmed place through `sightingConfirmWrites` and `viewState`, local evidence, not in the repo) found confirming at CD changes all three of the top three (BO, BP, BH to CC, CD, CE). The seed's start point is beside the lake, so a report there would barely move the map. The card names the segment, and a test checks CD is in the southern quarter of the practice grid.
- Source: UI review (a seeded one-click first report on the practice search that visibly reorders the top three).
- Verified: new unit tests (`firstReport.test.ts`: when it is offered, the saved sighting, the words against the shipped grid) and harness checks (`e2e/harness/firstReport.spec.ts`: the card's words, the steps, a refused save) failed first, then passed; the live practice check in `e2e/judge.spec.ts` now presses the button and asserts the card closes and none of the old top three is still in the top three; typecheck, web unit suite (1032) and the hygiene guard pass.

### test(evidence): time the command post's photo read on Chrome's built-in model
- What: a dev-server-only measurement page, `web/harness/photo-measure.html` (`src/harness/photoMeasure.tsx`), runs the command post's on-device photo read three times on a synthetic figure (no real person) on a bare Firebase app, and reports each reply's time, its inference source and every request to a Google or Firebase host. The result is `docs/evidence/web/2026-11-21-photo-read-chrome.json`: first read 20,032 ms, then 3,208 and 2,726 ms, all on device, no Google request.
- Source: review (the sheet read's first read took 31 s against a 30 s limit; the photo read had the same limit and had never been timed).
- Verified: typecheck and the hygiene guard pass; the page was run in the desktop Chrome on this Mac (Playwright's Chrome profile has no built-in model and reports it unavailable).

### fix(photos): the command post waits up to 90 s for a photo read on this laptop, and says why
- What: the on-device photo read's limit is `PHOTO_READ_TIMEOUT_MS` (90 s) in `web/src/ai/photoCues.ts`, used by CommandPost's `readPhotoHere`; it was 30 s. While a photo is read on this laptop, the Family photos tray says "Reading on this laptop. The first read can take up to a minute." (before, only the button greyed out). The photos harness gains `?slow=1`.
- Source: review (the photo read had the paper sheet read's 30 s limit; measured, its first read took 20 s on a fast Mac and the sheet's 31 s).
- Verified: a new unit test (the limit is more than twice the slowest measured photo read in `docs/evidence/web/2026-11-21-photo-read-chrome.json`, at least 90 s, and CommandPost passes it) and a new harness check in `e2e/harness/photos.spec.ts` (the waiting line shows during a slow read and goes after) failed first, then passed; typecheck, web unit suite and the hygiene guard pass.

### fix(data): only : % ° stay apart; coordinates and radio frequencies keep their own spans
- What: the never-join set is back to : % and °, so a phone number split by a bar, a semicolon, "!" or "?" is removed ("404 | 555 | 0142", "404;555;0142"). Two spans keep the search information those marks used to protect by accident: a decimal coordinate pair may have a semicolon, bullet, middle dot, bar or slash between its two numbers ("GPS 33.7490; -84.3880"), and a radio frequency (1 to 3 digits, a full stop, exactly 3 digits, not in a dotted chain, no "+" before it) is kept like a date ("Radio 155.160 | 154.205", "155.160-155.175"). Beside a short piece either span goes with the run; beside a whole number of seven or more digits only the number goes. Check-in times or a date and a count joined by a semicolon are removed, as they already were with a comma.
- Source: review (cross-family, privacy ruling).
- Verified: new tests failed first (the four marks kept; the coordinate and frequency notes removed), then pass; "404.555 0142" and "Call 404.555.0142" are still removed; 87 draft shared cases pass on the web; the phone and vector suites pass (121).

### fix(data): a frequency joined to other digits goes; a coordinate across a bar needs a minus
- What: a radio frequency is kept only when nothing but other frequencies joins it, so a phone number never keeps a frequency's shape ("Call 404.555-0142 #123" had kept "404.555"; "Radio 155.160 404 5550142" is now removed whole). Two decimals across a semicolon, bullet, middle dot, bar or slash are a coordinate pair only with a minus after the mark ("GPS 33.7490 | -84.3880"); without one they can be two phone numbers ("020.79460958 / 020.79460959" had been kept whole). The comma rule is unchanged.
- Source: review (cross-family, privacy).
- Verified: both cases failed first, then pass; the coordinate and frequency keeps still pass; 89 draft shared cases and 350 data tests pass on the web.

### fix(data): no zero-led degrees, and frequencies only in a run of frequencies
- What: a coordinate's whole degrees never start with a zero (0.1276 still counts), so a London number written "020.79460958" next to a coordinate is removed, after a comma too. A radio frequency is 25 to 999 MHz with no leading zero, and a run keeps its frequencies only when every digit group in it is one: candidates with a joined neighbour outside the set drop out until none does ("Call 404.555 0.142 1234567" had kept "404.555").
- Source: review (cross-family, privacy).
- Verified: the new tests failed first, then pass; 94 draft shared cases and 1105 web unit tests (with the draft file) pass; the typecheck passes.
### feat(ai): an on-device-only wording builder, for pages that must never build a cloud model
- What: `wordingOnDeviceParams()` in `web/src/ai/replanWording.ts` is the plan wording's own on-device options and JSON constraint with mode ONLY_ON_DEVICE and no cloud params, and `wordingOnDeviceGenerator(ai)` in `web/src/ai/client.ts` builds it with the on-device-only request options. The command post still words plans with PREFER_ON_DEVICE (`wordingGenerator`); this builder is for measurement pages, which a guard keeps from building any cloud model.
- Source: on-device evidence runs (a wording measurement page tripped the harness no-cloud guard).
- Verified: a new unit test (ONLY_ON_DEVICE, the same on-device options as the command post's, no cloud params) failed first, then passed; the harness no-cloud guard and the client tests pass; typecheck passes.

### test(evidence): the sighting-note read and plan wording measured on Chrome's built-in model
- What: two dev-server-only measurement pages run the command post's own code paths on a bare Firebase app: `web/harness/note-measure.html` reads five made-up drill notes (`readSightingText`, ONLY_ON_DEVICE) and `web/harness/wording-measure.html` words one made-up plan three times (`wordPlan`, PREFER_ON_DEVICE), keeping each raw reply and the check's reason. Results in `docs/evidence/web/2026-11-21-note-read-chrome.json` and `2026-11-21-plan-wording-chrome.json`; the two "Not run" rows in `docs/TEST-MATRIX.md` now cite them.
- Found: the first note read took 27,900 ms against the command post's 30 s limit; 14 of 15 note fields right ("grey" read as unknown). Plan wording ran on device every time (3.1 to 12.3 s) but code accepted only 2 of 6 wordings; the one recorded rejection was a reply that repeated the teams up to the schema's 12 items.
- Source: on-device evidence runs for the judge (the two rows had no tracked run).
- Verified: typecheck, the test matrix check and the hygiene guard pass; the pages ran in the desktop Chrome on this Mac (Playwright's Chrome profile has no built-in model).

### fix(ai): a plan's wording is asked for in that plan's own shape
- What: `planWordingJson(teamIds)` in `web/src/ai/replanWording.ts` is the wording's JSON schema for one plan: exactly one assignment per team, `teamId` limited to that plan's teams (the general schema when there are none). `wordingParams(model, teamIds)` gives it to both the cloud (`responseJsonSchema`) and this laptop (`responseConstraint`); CommandPost's `suggest` passes its draft's teams. The cited mode line (`replanWording.ts:47`) does not move.
- Source: on-device evidence (Chrome's model repeated the teams up to the general schema's 12 items, and code rejected 4 of 6 wordings).
- Verified: new unit tests (the schema's count and team list, both routes get it, the command post passes its draft's teams) failed first, then passed; typecheck, web unit suite (1051), the test matrix check and the hygiene guard pass.

### test(evidence): plan wording on Chrome's model with the per-plan schema
- What: `docs/evidence/web/2026-11-21-plan-wording-schema-chrome.json`: the same made-up plan worded six times on the committed measurement page with the per-plan schema; the plan wording row in `docs/TEST-MATRIX.md` cites it beside the earlier run.
- Found: code accepted 6 of 6 (2 of 6 before), all on device, no Google request; the first wording in a new page took 19,773 ms, over the command post's 15 s wording limit, the rest 2.1 to 3.2 s.
- Source: on-device evidence runs for the judge.
- Verified: the test matrix check and the hygiene guard pass; run in the desktop Chrome on this Mac.

### fix(data): a Mexican number in dot form is not a coordinate pair
- What: a decimal pair is a coordinate only with a minus before its second number (after a comma too, now), 4 to 7 decimals in each, and no phone cue just before it (call, tel, phone, cell, mobile, number, #, llame, llamar, teléfono or telefono, celular, número or numero, within the three words before it). "Call 33.12345678, 33.87654321", "55.12345678, 55.87654321", "Call 33.12345678, -103.3496" and "33.12345678 / -81.12345678" had all been kept whole. Every drill site is in the western hemisphere; an eastern pair with no minus is now removed.
- Source: review (cross-family, post-merge, privacy).
- Verified: the four strings and the cue list failed first, then pass; "Ubicación 33.12345, -84.5678" and "GPS 33.7490, -84.3880" stay; 100 draft shared cases and 1118 web unit tests (with the draft file) pass; the typecheck passes.
### fix(command): wait up to 90 s for a note read on this laptop, and say why
- What: `NOTE_READ_TIMEOUT_MS` in `web/src/ai/sightingText.ts` is 90 s (was 30 s), the same as the photo read's. While the note is read on this laptop the sighting form says "Reading the note on this laptop. The first read can take up to a minute."
- Source: on-device evidence (`docs/evidence/web/2026-11-21-note-read-chrome.json`: a page's first note read took 27,900 ms on a fast Mac, within 7% of the 30 s limit).
- Verified: a new unit test (the limit is more than twice the slowest measured note read, and CommandPost passes it) and a new harness check in `e2e/harness/sighting.spec.ts` (the waiting line shows during a slow read and goes after) failed first, then passed; the old "30 seconds" test now says the note and photo limits match at 90 s; typecheck, web unit suite (1049), the test matrix check and the hygiene guard pass.

### feat(data): a segment read from Firestore keeps its prior version
- What: the segment listener reads each document through `segmentFromDoc`, which now keeps the document's `priorVersion` (left unset when missing or not a number). Every prior write stamps it on every segment and ROW, so a rebuild can tell a segment from an older grid.
- Source: review (follow-up, approved).
- Verified: `segmentDoc.test.ts` failed first (no export), then passes: the version kept, unset when missing or a string, null for unreadable geometry.

### fix(prior): no rebuild from a stale grid
- What: `rebuildPrior` takes the incident's `priorVersion` and refuses ("The map's segments have not all loaded yet.") when any segment carries another version or none. After a reseed, a cached snapshot can hold the older grid with the same id; a confirm or layer change on it would have saved a new version over part of the current grid. The command post's layer and model rebuilds and every camera and sighting confirm pass the version. The sighting prior tests run with the 30 s timeout the other prior tests use.
- Source: review (cross-family, follow-up, approved).
- Verified: new tests failed first, then pass: a stale or unversioned segment is refused, and a confirm against a stale grid is refused before anything is built. Every stored incident's segments and ROW (48 of 48) carry their incident's version, read live. 1080 web unit tests and the typecheck pass.

### fix(prior): only an older grid blocks a rebuild; walkers check the grid first
- What: the grid checks move into `assertCurrentGrid` (none loaded, some missing, or a segment older than the incident's version). A segment newer than the incident is now allowed, so an incident copied mid-rebuild can still rebuild instead of refusing forever. A walker run, which writes every segment too, makes the same check before it starts, so it never commits a new version over a stale segment list.
- Source: review (cross-family).
- Verified: new tests failed first, then pass: a newer segment rebuilds; `assertCurrentGrid` passes the whole current grid and refuses empty, partial and older ones; 1082 web unit tests and the typecheck pass.
### fix(data): a phone cue counts only right before a coordinate pair
- What: a cue word voids a coordinate pair only when it sits right before it (spaces or a colon between) or with one connector between (al, a, at, on, to); a "#" before it still counts. A cue further back names a thing, not a number to dial, so a clue's place stays: "Phone found at 33.7866, -84.3733", "Cell ping 33.7866, -84.3733" and "Call came from 33.7866, -84.3733" had been removed. "Call 33.1234, -84.5678" and "Llame al 33.1234, -84.5678" are still removed.
- Source: review.
- Verified: the new keep test failed first, then passes; the cue cases still pass; 103 draft shared cases and 370 data tests pass on the web.
### test(config): the web's Remote Config defaults equal the published template's
- What: a unit test in `web/src/config/rc.test.ts` checks that every key in `RC_DEFAULTS` has the same value as that key's default in `remoteconfig.template.json`. A browser whose fetch is refused or that is offline runs on the built-in defaults, so they must be the published values.
- Why: Remote Config allows 60 fetch requests a minute per project per caller (the project's quota, read from Service Usage); for a web client the caller is its IP. The project's own request counts (Cloud Monitoring, last 24 h) show 90 to 200 fetches an hour from our test runs, with 2 to 34 refused with 429 only in the busiest hours. A judge's browser fetches about twice in 12 hours (the SDK's default minimum fetch interval, which the web keeps), so it should never meet the limit; if one is ever refused, it now provably runs the same configuration.
- Source: review (the 429 seen in live checks).
- Verified: the test passes, and it failed when a default was changed (`kill_cloud: true`), then passed again restored; web unit suite and the hygiene guard pass.

### fix(command): wait up to 60 s for a plan's wording, and say why
- What: CommandPost's `suggest` waits `WORDING_WAIT_MS` (60 s, in `web/src/ai/replanWording.ts`) for the wording before it uses the fixed wording; it waited the cloud request's 15 s. A cloud request keeps its own 15 s limit on the SDK request, so a cloud fallback is no slower. While a plan is worded the plan card says "Wording the plan. The first time on this laptop can take up to a minute."
- Source: on-device evidence (a page's first wording on Chrome's built-in model took 19,773 ms on a fast Mac, so the first plan fell back to fixed wording).
- Verified: a new unit test (the wait is more than twice the slowest wording in both evidence files, the cloud request stays at 15 s, and CommandPost passes the wait) and a new harness check in `e2e/harness/plan.spec.ts` (the waiting line shows while the plan is worded and goes after) failed first, then passed; typecheck, web unit suite, the test matrix check and the hygiene guard pass.

### fix(command): walkers use only the route graph loaded for this grid
- What: the command post keeps the loaded route graph with the grid it was loaded for (`graphFor`) and clears it on a grid change, so after a site change a walker run can never use the old site's routes with the new site's cells; until the new graph loads, walkers wait as on any load.
- Source: review (cross-family).
- Verified: `graphFor` failed first (no export), then passes (own grid; another grid; loading; no grid); 1089 web unit tests and the typecheck pass.
### test(e2e): the live run's saved session keeps Remote Config's cache, so tests stop refetching it
- What: `e2e/auth.setup.ts` waits until Remote Config has stored its fetch (IndexedDB `firebase_remote_config`, a `last_successful_fetch_timestamp_millis` key) and Performance Monitoring its config (localStorage `@firebase/performance/config`) before saving the session every live test reuses. Setup had saved before either was written, so each test fetched both again, about 80 fetches a run against the project's 60 a minute per caller; runs were refused partway with HTTP 429 (seen as console errors, the "(default)" model on the judge page, and a missing trace).
- Source: review (Remote Config 429 in live checks; Cloud Monitoring showed 49 fetches in one minute from one run).
- Verified: the saved session now holds 8 Remote Config records and the Performance key; a full live run on cb464fcb made 4 Remote Config fetches (Cloud Monitoring, per minute) instead of about 80, with no 429, and ran in 46 s instead of 1.8 min; the hygiene guard passes.

### test(e2e): the rail order check waits for the family section before reading Details
- What: `e2e/railOrder.spec.ts` waits for the family section's heading (it draws when the family's questions arrive, which can come after the map's labels) before it lists the headings under Details.
- Source: the faster live run (cached Remote Config) read Details before the questions arrived.
- Verified: the rail order, smoke and judge checks pass live on cb464fcb (23); the hygiene guard passes.

### feat(command): a suggested plan shows beside the approved one, team by team
- What: when a plan is already approved, a suggestion's card shows a table, "The approved plan and this suggestion": each team's segments now and suggested with the share of the probability those segments hold on the current map ("AB, 20.0%"), "Same" where a team's segments do not change, and a last row, "In these segments", with each plan's total (a segment two teams share counts once). `planCompare` in `web/src/command/planCompare.ts`; CommandPost passes the latest approved plan. With no approved plan the suggestion shows on its own. The plan harness gains `?current=1`.
- Source: review (compare a suggested change with the current result side by side before approving).
- Verified: new unit tests (`planCompare.test.ts`: pairs, unchanged and one-sided teams, shared segments counted once) and harness checks in `e2e/harness/plan.spec.ts` (the table's rows and totals; no table without an approved plan) failed first, then passed; plan harness (13), typecheck, web unit suite and the hygiene guard pass.

### feat(data): command can write a retraction of any report
- What: `buildRetraction(target, writer)` in `web/src/data/sightings.ts` is command's retraction: a new event that points at the report (`targetEventId`), changes nothing itself (effect none), and carries the target's training-inject flag. Every device's engine stops counting the report; a retraction from command counts for any author's report, as the rules allow (only command may retract another author's event).
- Source: command-side "Retract report".
- Verified: `web/src/data/retraction.test.ts` (the shape, and that it equals the document the rules suite writes as command, `functions/test/rules/retraction-event.json`) failed first, then passed; the rules suite on the emulator passes (292), with a new block proving command's shape is accepted and a searcher or family seat is refused; web unit suite and the hygiene guard pass.

### feat(command): Reports lists every report, and command can retract one
- What: a "Reports" section under Details lists every clue, sighting, camera sighting, cleared and found report, newest first: who sent it (team, family, caller, camera or command), the kind, the segments it names and the time, then its note. "Retract" asks inline ("Retract this report? It stays in this list, struck through, and stops changing the map.") and writes command's retraction (`buildRetraction`). A retracted report stays, struck through, with "Retracted by command." or "Retracted by its author."; which retractions count is the map's own rule. A report that set the current start point says why it is not retracted there (retracting it would not move the start). A retracted sighting leaves the Sightings list. Ten show at first, then "Show all N". `reportCards` in `web/src/command/reportCards.ts`, `ReportsPanel.tsx`, harness `web/harness/reports.html`.
- Source: command-side "Retract report" (good command practice; reports are user content command can remove).
- Verified: new unit tests (`reportCards.test.ts`: the kinds listed, the map's retraction rule, the start point, one card per report) and harness checks (`e2e/harness/reports.spec.ts`: order and header lines, ask then Keep it or Retract report, author retraction and start point lines, a refused write) failed first, then passed; a live check in `e2e/beat.spec.ts` retracts a report on the test drill and checks it after a reload; full harness suite (196), typecheck, web unit suite and the hygiene guard pass.

### feat(prior): a confirm that drops the elevation layer says why
- What: `elevationDropReason` names why a rebuild turns the elevation layer off (no elevation file loaded for this site; the new start is outside the mapped segments; the new start's segment has no elevation), `usableLayers` uses it, and `elevationDropNote` words it for command. `cameraPriorWrites` (camera, family camera and sighting confirms) returns that line as `layersNote` when it drops the layer; it is shown, never stored.
- Source: review (follow-up).
- Verified: new tests failed first, then pass: each reason, none when the layer stays or is off, the note's wording, and the camera confirm's note with no file and outside the grid (none when kept).

### feat(command): command sees why a confirm rebuilt without downhill and level ground
- What: when a confirm turns the elevation layer off, the line ("Rebuilt without downhill and level ground: the new start is outside the mapped segments.") shows where command confirmed: after the camera clip panel's "Confirmed. Prior rebuilt as vN." and on the Sightings card. The Prior panel shows it under its switches on this seat until the next layer change here. Switching the prior model back to rings with the site's file missing says the same.
- Source: review (follow-up).
- Verified: three new harness checks failed first, then pass (clip, sightings, layers); 1146 web unit tests, the typecheck, 201 harness checks, the build and 43 no-backend browser checks pass. One harness check (firstReport.spec) failed once and passed on rerun; it imports none of these files.
### test(harness): the first report harness waits for the test at each step
- What: `web/harness/first-report.html` no longer moves from saving to confirming to done on 400 ms timers; each step waits for its button ("Server has it", "Confirm done", "Server refuses"), and `e2e/harness/firstReport.spec.ts` presses them. A 400 ms step could pass between two of Playwright's polls (its interval grows to a second), so the check sometimes never saw "Confirming..." and timed out on "Saving the report...".
- Source: review (the check failed about one run in five locally and once in CI).
- Verified: typecheck passes; both checks passed 30 times in a row (`--repeat-each 5`, three runs); the hygiene guard passes.

### fix(command): a join error sits under its field, marks it invalid and takes the focus
- What: the join form showed every error in one line under both fields, with no `aria-invalid`, no `aria-describedby`, and the focus left where it was. Now an error about one field ("Enter the incident id."; "The join code has 8 characters." or "That code did not match this incident.") sits under that field, marks it `aria-invalid`, is its description, and takes the focus there; any other error stays under the form. `joinErrorField` in `web/src/data/join.ts` says which field an error is about.
- Source: UI review (the join error was not beside its field).
- Verified: a new unit test (`join.test.ts`) failed first, then passed; a new deployed check, `e2e/joinErrors.spec.ts` (the form's own checks, so no join is attempted), failed on the live site before the change and runs after deploy (the join form stays disabled off the hosting origin, so it cannot run locally); typecheck, web unit suite and the hygiene guard pass.

### fix(command): the Sightings list shows three at a time, those waiting for a decision first
- What: the Sightings panel listed every sighting, decided or not, so on a phone a busy drill pushed the rest of the rail thousands of pixels down (the test drill's post was 12,579 px tall at 390 px wide). It now lists the sightings waiting for command first, then the decided ones, shows three, and offers "Show all N sightings"; a line under the heading says how many are waiting ("6 waiting for a decision."). The sightings harness gains `?many=1`; the live retraction check now sees the report listed before it checks that it leaves.
- Source: UI review at phone width (too many words on the working screen).
- Verified: new harness checks in `e2e/harness/sightings.spec.ts` (three shown, waiting ones first, Show all reveals all eight with the decided last; no button for three or fewer) failed first, then passed with the existing sightings checks (5); typecheck, web unit suite and the hygiene guard pass.

### fix(command): the offline line sits under the header without shifting the post
- What: the command post was a two-row grid (header, then body), so a status line between them (the offline line "No connection. Showing the last data received.", or the unreadable-plans line) became an extra grid child with a paragraph's margins: it sat 15 px below the header and pushed the map and rails down. The post is now a flex column: the header, any status line at its own height (no margin, a thin rule under it), then the body filling the rest of the window. The post layout harness gains `?offline=1`.
- Source: UI review (the offline banner shifted the whole screen).
- Verified: a new harness check in `e2e/harness/postLayout.spec.ts` (the line sits right under the header, at most two lines tall, the body starts under it and still reaches the bottom of the window, nothing scrolls the document) failed first (15 px gap), then passed; the full harness suite (200), web unit suite and the hygiene guard pass.

### perf(web): the judge page and the command post each load their own code
- What: `web/src/main.tsx` loads `CommandPost` and `JudgePage` with `React.lazy`, so the app was one 2.5 MB `main` script and is now a 223 KB `main`, a 161 KB `CommandPost` chunk and an 18 KB `JudgePage` chunk. On a placeholder build the judge page's unique script bytes fell from 3.94 MB to 3.78 MB: the shared code (Firebase, MapLibre for the replay, reCAPTCHA) still loads, and a deeper cut needs Firestore set up only where it is used and a second look at prefetching the replay.
- Source: UI review (one 2.5 MB script on every page).
- Verified: a new no-backend check, `e2e/routeChunks.spec.ts` (the judge page loads no `CommandPost` chunk and its own `JudgePage` chunk; the command post loads its chunk), failed on the old build and passes on the new one with every no-backend check (45); typecheck, web unit suite and the hygiene guard pass.

### revert(web): the judge page and the command post load as one bundle again
- What: reverts the per-page code split. With `CommandPost` loaded lazily, the stylesheets its modules import (MapLibre's among them) were injected after `base.css` instead of before it, so every rule of equal specificity flipped. `.maplibregl-map { position: relative }` then beat `.map { position: absolute; inset: 0 }`, and the deployed command post drew a map 0 px tall at every width. The deploy was rolled back within four minutes; the split saved about 160 KB, too little to justify auditing every reordered rule before the drill.
- Source: live suite after deploy (the map drew no plates on the test drill, and on a phone it was 0 px tall).
- Verified: `web/src/main.tsx` and the route-chunk check are back to their state before the split; the built page links MapLibre's stylesheet before `base.css` again (checked in the built `index.html`), and every no-backend check passes (45).

### test(web): CI checks that the built stylesheets leave the map filling its frame
- What: a new no-backend check, `web/e2e/mapCascade.spec.ts`, runs at 1440 px and 390 px on the built app. The join page loads the command post's code and every stylesheet it uses; the check puts a `.map-wrap` frame holding a `.map.maplibregl-map` element (the classes the map's container carries) on the page and asserts it is absolutely placed and the full 400 px tall. A build whose stylesheet order lets MapLibre's `position: relative` win fails it.
- Source: live suite after deploy (a 0 px map that no CI check could see).
- Verified: it failed at both widths on the build that drew the 0 px map (`position: relative`), and passes on the build with the split reverted, with every no-backend check (45).

### fix(theme): a disabled outline button reads at 4.5:1 on a raised panel
- What: `.btn.ghost:disabled` used fg-4 text, 4.33:1 on bg-2 (the sighting form and photo panels), a pair the theme never allows. It now uses fg-3 text (well over 4.5:1) with a dashed edge, so it still reads as off.
- Source: UI review (disabled outline buttons on bg-2).
- Verified: a new harness check, `e2e/harness/disabledGhost.spec.ts` (text-to-surface ratio and edge style from computed styles), failed at 4.33 first and now passes with the whole harness (204); typecheck, web unit suite and the hygiene guard pass.

### fix(map): an empty map says it is waiting for the search area
- What: with no segments loaded, the map said "No segments yet. Build the prior to draw the map.", jargon that pointed at no control on the screen. It now says "Waiting for the search area." The map harness gains `?empty` to draw the map with no segments.
- Source: UI review (too many words on the working screen).
- Verified: a new harness check in `e2e/harness/map.spec.ts` failed on the old line first, then passed with the whole harness (207); typecheck, web unit suite and the hygiene guard pass.

### test(web): the live suite's sign-in step no longer waits for caches the join page never writes
- What: `web/e2e/auth.setup.ts` waits for the Remote Config and Performance Monitoring caches before saving the session, but only the joined command post starts either. Run without the drill fixture (no join), the step always failed with "Remote Config's fetch was never stored in this browser". It now waits for them only when it joined, and saves the session at once otherwise.
- Source: a post-deploy dry run (its sign-in step ran without the drill fixture).
- Verified: run against the live site, the sign-in step without the fixture failed before the change and passes after it; with the fixture (drill-test-1) it still waits for both caches and passes; typecheck and the hygiene guard pass.

### feat(data): the write and the line for ending a search
- What: `web/src/data/endSearch.ts` holds the three reasons command can give (person found, search suspended, training ended), the write (`status: "closed"` with `closedReason`), and the line every seat shows once a search has ended ("Search ended: training ended. No new reports are taken.").
- Source: review (an "End this search" control for command).
- Verified: new unit tests in `endSearch.test.ts` (the write's shape; the reasons equal the list in `firestore.rules`, read from the file; the line for each reason, for no reason or an unknown one, and none while open) failed first, then passed; typecheck, web unit suite and the hygiene guard pass.

### feat(command): an End this search control with an inline confirm
- What: `web/src/command/EndSearch.tsx` is one button, "End this search", that opens an inline confirm asking why (person found, search suspended, training ended). End search stays disabled until a reason is picked, shows "Ending the search..." while the write is out, and on a refused write says "Could not end the search. Check the connection and try again." with the confirm still open. Cancel closes it and writes nothing. A new harness page (`web/harness/end-search.html`) renders it with a stand-in write.
- Source: review (an "End this search" control for command).
- Verified: three new harness checks in `e2e/harness/endSearch.spec.ts` (Cancel writes nothing; a picked reason is written once, with the button held while it is out; a refused write keeps the confirm open) failed before the component existed, then passed with the whole harness (211); typecheck, web unit suite and the hygiene guard pass.

### feat(command): command ends the search from the post, and the post shows it ended
- What: the command post puts End this search at the foot of Details. Once the incident is closed, a line under the header says "Search ended: <reason>. No new reports are taken.", the control goes, and Add sighting, Add camera clip and the phone bar's Add sighting are disabled (the rules take no new reports on a closed incident). `IncidentDoc` gains `closedReason`.
- Source: review (an "End this search" control for command).
- Verified: a new deployed check, `e2e/endSearch.spec.ts` (ends a fresh practice copy with Training ended, then checks the line, the disabled buttons, the control gone, and the line after a reload), failed on the live site at the missing control before this change; it runs after deploy, because the join needs the hosting origin. Typecheck, web unit suite (1151), the whole harness (211), the build and every no-backend check (45) pass, with the hygiene guard.

### fix(command): the post says a search ended only once the server has the close
- What: Firestore shows this browser's own pending write to the incident listener at once, so the post said "Search ended" (and dropped the confirm) before the server had accepted the close, and offline it said so while the server still took reports. The incident listener now reads metadata changes and reports `incidentPending`; `endedLine` takes whether the server has the close, and the post shows the ended line only then. Until the server acknowledges, the confirm stays up saying it is ending.
- Source: review (Codex: the post shows a search as ended before the server accepts the close).
- Verified: a new unit test in `endSearch.test.ts` (no ended line for a close the server does not have yet) failed first, then passed; typecheck, web unit suite (1152), the whole harness (212), the build and every no-backend check (45) pass, with the hygiene guard.

### fix(command): ending a search closes any open report form and the first-report card
- What: the add buttons were disabled once a search ended, but a sighting form or camera clip panel already open (or opened in another tab before the close) still offered Save and Confirm, and a practice search ended before its first report still offered "Add and confirm this report". Once the server has the close, the post now closes both forms and hides the first-report card.
- Source: review (Codex: the closed post still offers writes).
- Verified: the deployed check `e2e/endSearch.spec.ts` now opens Add sighting before ending the search and expects the form gone after; it runs after deploy. Typecheck, web unit suite, the whole harness, the build and every no-backend check pass, with the hygiene guard.

### fix(command): the End search confirm stays held after the close, and focus follows it
- What: after the server took the close, the confirm briefly offered End search again until the post removed it; it now stays held with "Ending the search..." until then. Opening the confirm puts the focus on the first reason, and Cancel puts it back on End this search.
- Source: review (Codex: a resubmission gap, and keyboard focus dropped on open and on Cancel).
- Verified: two harness checks in `e2e/harness/endSearch.spec.ts` (the button stays disabled after the server has it; focus on open and on Cancel) failed first, then passed with the whole harness; typecheck and the hygiene guard pass.

### fix(command): a pending edit never makes an ended search look open again
- What: the ended line waited for the incident doc to have no pending write, so after a confirmed close any later offline edit to the incident (a prior rebuild, say, which the rules then refuse) marked the doc pending and brought back the add buttons and End this search until the server answered. The incident listener now keeps `serverStatus`, the status the server last confirmed (`confirmedStatus` in `web/src/data/endSearch.ts`: a snapshot holding this browser's pending write leaves it as it was), and the post shows the search ended from that.
- Source: review (Codex, second round: a pending prior edit makes a closed search look open again).
- Verified: a new unit test in `endSearch.test.ts` failed first, then passed; typecheck, web unit suite (1153), the whole harness, the build and every no-backend check (45) pass, with the hygiene guard.

### fix(command): a close queued on this browser offers no second close
- What: a close written offline stays queued across a reload, but the reloaded post offered End this search again, so command could queue a second close. While this browser holds a close the server has not confirmed, End this search now shows only "Ending the search..." and offers nothing more; it stays mounted, so if the server refuses the close the confirm comes back with the error.
- Source: review (Codex, second round, low: reloading during a pending close allows a second submission).
- Verified: a new harness check (`?queued=1`) failed first, then passed with the whole harness (213); typecheck and the hygiene guard pass.

### fix(command): the post offers no new reports while this browser holds a close
- What: the add buttons and open forms followed the server-confirmed close only, so after a reload with a cached close plus another pending edit (say, a rebuild queued offline), the post showed "Ending the search..." and still offered Add sighting until that edit cleared, though the server had the search closed. `writesOpen` in `web/src/data/endSearch.ts` is false once either the server or this browser has the search closed; the add buttons, the open forms and the first-report card follow it. The ended line still follows the server.
- Source: review (Codex, third round: reloading can make a confirmed closure look pending).
- Verified: a new unit test in `endSearch.test.ts` failed first, then passed; typecheck, web unit suite, the whole harness, the build and every no-backend check pass, with the hygiene guard.

### feat(data): the call and the words for removing a member
- What: `web/src/data/members.ts` calls the `removeMember` callable (incident id and the member's uid) and turns a failure into one sentence: the server's own reason when it gives one (yourself, another command, not command, no longer a member), "Refused by App Check. Try a normal browser window." for a refused token, "No connection. Try again when the link is back." offline, and "Could not remove them. Try again." otherwise.
- Source: review (command removes a searcher or family member from a drill).
- Verified: new unit tests in `members.test.ts` failed first, then passed; typecheck, web unit suite and the hygiene guard pass.

### feat(data): the list of people command can remove
- What: `memberRows` in `web/src/data/members.ts` joins the server's members records with the authors of the incident's events (an account that joined before the records existed is known only by what it wrote). Command is never listed; a members record wins over an event for role and team; searchers read "<team> searcher" and family "Family member"; two people with one label are told apart by the last four characters of their id; removed members come last, marked removed.
- Source: review (command removes a searcher or family member from a drill).
- Verified: four new unit tests in `members.test.ts` failed first, then passed; typecheck, web unit suite and the hygiene guard pass.

### feat(command): a People panel where command removes someone from the drill
- What: `web/src/command/MembersPanel.tsx` lists each searcher and family member with "Remove from this drill". Pressing it asks inline ("Remove <who>? They lose access at once and cannot join again.") with Remove and Cancel; a refused removal gives the server's reason under the row with the confirm still open; a removed person shows "Removed" and no action. A harness page (`web/harness/members.html`) renders it with synthetic members and a stand-in call.
- Source: review (command removes a searcher or family member from a drill).
- Verified: four new harness checks in `e2e/harness/members.spec.ts` (never lists command; Cancel removes nothing and Remove marks the person removed; a refusal says why; someone already removed has no action) failed with the component moved aside, then passed with the whole harness; typecheck, web unit suite and the hygiene guard pass.

### feat(command): the People panel on the command post
- What: the command post lists, under Details, everyone command can remove (the server's members records and the authors of the incident's reports), with Remove from this drill calling the `removeMember` callable; removal records mark a person Removed. `subscribeMembers` in `web/src/data/members.ts` reads both collections, and a refused read (before the rules that let command read them are deployed) reads as empty, so the list falls back to report authors. `memberRows` now takes plain event records.
- Source: review (command removes a searcher or family member from a drill).
- Verified: a new deployed check, `e2e/removeMember.spec.ts` (on a fresh practice copy: the People panel lists the copied reports' authors, never command, and removing one reaches the server and is refused as not a member of that copy, which removes no one), failed on the live site at the missing panel before this change; it runs after deploy. Typecheck, web unit suite (1154), the whole harness (212), the build and every no-backend check (45) pass, with the hygiene guard.

### fix(data): the People list never offers the caller or any account seen as command
- What: `memberRows` kept the first role it saw for an account, so a searcher who later joined as command (or the caller's own earlier reports) still got Remove from this drill while the members records were loading or refused. It now leaves out the caller (the command post passes its own uid) and any account with a command members record or any command event, whichever came first.
- Source: review (Codex: the panel can offer to remove the caller or another command account).
- Verified: a new unit test in `members.test.ts` (the caller, an account with a later command event, and an account with a command record are all left out) failed first, then passed; typecheck and the hygiene guard pass.

### fix(data): two people in the People list never share a label
- What: people with the same label were told apart by the last four characters of their id, so two ids ending alike gave two identical rows (and confirms) that removed different people. The ending now grows, two characters at a time, until every label in the group is distinct.
- Source: review (Codex: two people can have identical labels and confirmations).
- Verified: a new unit test in `members.test.ts` (two ids with the same last four characters get distinct labels) failed first, then passed with the whole file (8); the hygiene guard passes.

### fix(command): a removal shows Removed at once, so it cannot be sent twice
- What: the callable can answer before the removal record reaches the listener, and in that gap the row offered Remove from this drill again for the same person. The People panel now marks a person Removed as soon as the call succeeds on this seat. Each row also carries `data-member` (the account id) so a check can find one person's row.
- Source: review (Codex: a successful removal can be submitted again).
- Verified: a new harness check (`?noecho=1`, where no removal record arrives) failed first, then passed with the People checks (5); typecheck and the hygiene guard pass.

### fix(data): a refused sign-in no longer reads as an App Check refusal on removal
- What: the callable answers "unauthenticated" for a rejected sign-in token as well as for a refused App Check token, so "Refused by App Check. Try a normal browser window." could send command the wrong way. It now reads "Refused: sign-in or App Check. Reload the page and try again."
- Source: review (Codex, low: a rejected sign-in token is reported as an App Check failure).
- Verified: the unit test's expected sentence was changed first and failed, then passed with the whole file (8).

### fix(data): a refused read of the members or removal records keeps what was shown
- What: when the removal records' listener was refused after a good read, it replaced them with an empty set, so a removed person with an old report got Remove from this drill again. A refused read now changes nothing: the lists start empty before any read succeeds, and keep what they showed after one.
- Source: review (Codex: a failed removal listener makes removed people appear eligible again).
- Verified: a new unit test, `membersListen.test.ts` (Firestore's listener mocked: a good read, then a refusal on each collection), failed first, then passed with the members tests (9); typecheck and the hygiene guard pass.

### test(web): the deployed removal check removes a member it made, on the test drill
- What: the deployed check ran on a practice copy, but practice copies carry no reports, so the People panel there had no one to list. It now runs on the test drill: a fresh family member joins over the public APIs (as the family app does, `freshFamilyMember` in `e2e/familyConsent.ts`), command finds that account's row by `data-member` and removes it, and then that account's read of the incident is refused (403) and it cannot join again (403). The member the check makes is the one it removes.
- Source: review (Codex: the end-to-end test cannot reach the callable with practice setup).
- Verified: the check and its fixture compile (`playwright test --list`); it runs after deploy and needs the members records the join function now writes. It was not run against the current site, where it would leave its fresh member unremoved.

### fix(data): a members record decides who is listed, over an old command event
- What: the People list left out any account with a command event, so a command account that later rejoined the same drill as family (its members record then says family, and the server allows its removal) could not be removed. A members record now decides an account's role and team; only an account with no record is kept off the list by a command event of it.
- Source: review (Codex, second round: an old command event hides a member the server can remove).
- Verified: a new unit test in `members.test.ts` (a family record with an earlier command event is listed) failed first, then passed with the file; the hygiene guard passes.

### fix(command): once a People read is refused, the panel says the list may be out of date
- What: Firestore stops a listener after it refuses it, and the members and removal lists then kept their last read with no sign it had stopped, so a person another command seat had removed could still be offered for removal. `subscribeMembers` now reports a refusal; the panel then says "This list may be out of date. Reload the page before removing anyone." and offers no removal, while the last good lists stay shown.
- Source: review (Codex, second round: a refused listener leaves People silently stale).
- Verified: the listener unit test (`membersListen.test.ts`, mocked) now also expects the refusal to be reported, and failed first; a new harness check (`?stale=1`) failed on the panel without the change and passes with it (6 People checks); typecheck and the hygiene guard pass.

### test(web): the removal check cleans up after itself and proves the sessions were revoked
- What: if the deployed removal check failed before removing its fresh family member (the row never showing, say), or the fixture failed after the join, the account stayed joined to the test drill. Both now remove that account through `removeMember` as a command session of their own (`removeAsCommand` in `e2e/familyConsent.ts`). The check also expects the removed account's session refresh to be refused (400), since the removal record alone already refuses reads and rejoins, and only the refresh shows the sessions were revoked.
- Source: review (Codex, second round: a failed test can leave the fresh account active; the test can pass while revocation failed).
- Verified: the check and the fixtures that share `familyConsent.ts` compile (`playwright test --list`, 5 tests); it runs after deploy.

### test(web): the removal check's cleanup fails loudly and waits for the revocation
- What: the cleanup returned removeMember's status and its callers dropped it, so a failed cleanup left the family account joined without a word; it now throws unless the server removed the account. The fixture records the account just before the join is sent, so a join that went through with its answer lost is still cleaned up (an account the server says never joined counts as clean). The check waits for the removed account's session refresh to fail with `TOKEN_EXPIRED` (the server writes the removal record before it revokes the sessions, and any malformed token also gives a 400), and until it has seen that, a failure removes the account again, which retries the revocation. The cleanup's own command account stays joined, since command cannot remove itself; it holds no reports.
- Source: review (Codex, third round: cleanup ignores failed removals, checks revocation too early, accepts any 400, and misses a lost join answer).
- Verified: the check and the fixtures that share `familyConsent.ts` compile (`playwright test --list`, 5 tests); it runs after deploy.

### fix(command): a refused People read with no one listed still says so
- What: with no one to list the People panel showed nothing, so when a read was refused before any rows loaded, command saw neither the list nor the warning. The panel now shows its heading and "This list may be out of date. Reload the page before removing anyone." whenever a read was refused, even with no rows.
- Source: review (Codex, third round, low: a first-load refusal can hide the stale warning).
- Verified: a new harness check (`?stale=1&empty=1`) failed first, then passed with the People checks (7); typecheck passes.

### feat(data): command reads the "Report a problem" flags
- What: `web/src/data/contentReports.ts` holds `ContentReport` (the TypeScript mirror of `shared/schemas/content-report.schema.json`), reads a stored report as a flag (refusing any document not of that shape), words it in one line ("Team 1 searcher flagged a report: personal information that should not be shared."), lists the newest first, and listens to `incidents/{id}/contentReports` for command; a refused read reads as none.
- Source: review (a command-side list of "Report a problem" flags).
- Verified: new unit tests in `contentReports.test.ts` failed first, then passed; with the schema from the branch that adds it, the schema parity gate reports `ContentReport` ok (7 fields, enum values equal); typecheck, web unit suite and the hygiene guard pass.

### feat(command): a Problem reports panel for command
- What: `web/src/command/FlagsPanel.tsx` lists the "Report a problem" flags newest first, one line each ("Family member flagged the family's description: wrong or misleading."), with the time and the reporter's note in quotes. With no flags there is no panel. A harness page (`web/harness/flags.html`) renders it with synthetic flags.
- Source: review (a command-side list of "Report a problem" flags).
- Verified: two new harness checks in `e2e/harness/flags.spec.ts` failed with the component moved aside, then passed with the whole harness; web unit suite and the hygiene guard pass.

### feat(command): the command post shows Problem reports at the top of its right rail
- What: the command post listens to the incident's "Report a problem" flags and shows the Problem reports panel first in the right rail whenever there is one (a flag can be about personal information, so it is not tucked under Details). A searcher is named by the team its reports carry ("Team 1 searcher", or "A searcher" before it has sent one); family reads "Family member"; times are local hours and minutes.
- Source: review (a command-side list of "Report a problem" flags).
- Verified: typecheck, web unit suite (1151), the whole harness (210), the build and every no-backend check (45) pass, with the hygiene guard. No deployed check: command cannot create a flag, and the family's channel is not exercised on the live drill, so the panel's lines are covered by the harness.

### fix(data): a Problem report's note never shows a phone number
- What: the reporter's app removes phone numbers before it stores a note, but the rules only check the note's type and length, so a note could carry one and the panel showed it verbatim. `reportFromDoc` now runs `removePhoneNumbers` (the same remover the sighting notes use) on every note before it is shown.
- Source: review (Codex: private details in notes are shown verbatim).
- Verified: a new unit test in `contentReports.test.ts` failed first, then passed; typecheck passes.

### fix(data): a Problem report with no stored time sorts last, not first
- What: a flag with no server time was sorted first as if it were still being saved, but command writes no flags, so on the command post a missing time only means a malformed document; it now sorts last. The test that assumed the old order now checks plain newest-first order.
- Source: review (Codex, low: a malformed timestamp can move an old flag to the top).
- Verified: a new unit test in `contentReports.test.ts` failed first, then passed; typecheck passes.

### fix(data): a refused Problem reports read keeps the flags and says so
- What: the flags listener replaced the list with nothing on a refusal, so command saw the same screen as with no reports, and Firestore does not restart a listener it has refused. `subscribeFlags` now keeps what was shown and reports the refusal, so the page can say the list may be out of date.
- Source: review (Codex: a failed listener silently removes the panel).
- Verified: a new unit test, `contentReportsListen.test.ts` (Firestore's listener mocked: a good read, then a refusal), failed first, then passed; typecheck passes.

### feat(data): a Problem report names the report or task it flags
- What: a flag read only "flagged a report" or "flagged their task", so with no note command could not tell which of several sightings to open. `flagTarget` in `web/src/data/contentReports.ts` names it when it is on hand: "a report from 04:21 in segment AE" (the report's time and first segment) or "their task in plan v3" (the plan the flagged task came from); otherwise the plain words stay. `flagLine` takes it.
- Source: review (Codex: command cannot identify the flagged report or task).
- Verified: a new unit test in `contentReports.test.ts` failed first, then passed; typecheck passes.

### fix(command): Problem reports names what was flagged, shows three, and says when it is out of date
- What: the panel now names each flagged item ("a report from 04:21 in segment AE", "their task in plan v3") with `flagTarget`; shows the newest three with "Show all N problem reports", so a run of flags never pushes the working rail out of view; lets a long unbroken note wrap instead of pushing the page sideways; marks its list as a list for screen readers; and, once a read is refused, says "These reports may be out of date. Reload the page." (even with no flags shown). The command post passes the incident's reports and plans for the names and the refusal from `subscribeFlags`.
- Source: review (Codex: command cannot identify the flagged item; the list can push working controls out of view; a long note overflows; a refused read hides the panel; Safari can drop list semantics).
- Verified: three new harness checks in `e2e/harness/flags.spec.ts` (the named report; three shown then Show all, with no sideways overflow; the out-of-date line with no flags) failed first, then passed with the flags checks (5); the first check now expects the named report. Typecheck, web unit suite (1161), the whole harness (218), the build and every no-backend check (45) pass, with the hygiene guard.

### fix(command): a flagging searcher is named by the team of its latest report
- What: the flag's author label took the team of the first event the account wrote, so a searcher who rejoined on another team was named by the old one ("Team 1 searcher flagged their task" for a Team 2 task). It now takes the team of the account's latest report.
- Source: review (Codex: a flag can name the wrong team).
- Verified: typecheck passes; the label's lookup is a two-line change in `CommandPost.tsx`, which no harness renders, so it rests on the review and the deployed post.

### fix(data): a flagging searcher's team comes from its latest report by server time
- What: the author label picked the report with the largest phone time, so a phone clock set back between a Team 1 report and a newer Team 2 report kept the old team, and a report with no time stopped every later match. `latestTeamOf` in `web/src/data/contentReports.ts` orders by server time, then the report's own time, and skips reports with neither; the command post uses it.
- Source: review (Codex, second round: the team lookup can keep the old team after a rejoin).
- Verified: a new unit test in `contentReports.test.ts` (a skewed phone clock and a report with no time) failed first, then passed; typecheck and the hygiene guard pass.

### fix(command): a flagged report is named to the second, and never as "Invalid Date"
- What: two reports from one segment in the same minute were both named "a report from 14:03 in segment AE", so with no note command still could not tell which was flagged; the command post now names a flagged report to the second ("14:03:07"). A report time outside the date range now falls back to "a report" instead of "a report from Invalid Date".
- Source: review (Codex, second round: same-minute reports get identical labels; an out-of-range time renders as Invalid Date).
- Verified: a new unit test in `contentReports.test.ts` (an out-of-range time gives the plain words) failed first, then passed with the file (8); typecheck and the hygiene guard pass.

### fix(command): each report's time shows its seconds
- What: a Problem report names a flagged report to the second ("a report from 14:03:42 in segment AE"), but the Reports rows showed only hours and minutes, so two reports from one segment in the same minute still could not be matched to the flag. Report rows now show seconds too.
- Source: review (Codex, third round: command still cannot match a flag to the right report).
- Verified: a new harness check in `e2e/harness/reports.spec.ts` failed first, then passed with the whole harness (219); the existing report checks match on the time's start and still pass; typecheck and the hygiene guard pass.

### fix(data): a report the server timed outranks one it did not, for the flagger's team
- What: `latestTeamOf` compared a report with no server time by its phone time against one the server timed, so a phone set ahead could still pin an old team. Any report with a server time now outranks one without (only older stored reports can lack it; the rules now require it), and within each kind the later wins.
- Source: review (Codex, third round: the team lookup still lets a skewed phone clock win when one report lacks server time).
- Verified: a new unit test in `contentReports.test.ts` failed first, then passed with the file (9); typecheck and the hygiene guard pass.

### test(data): a fixed-seed fuzz holds the run-of-times step to the shared rule
- What: `phoneNumbersFuzz.test.ts` compares `removePhoneNumbers` with the shared rule on its own (`removeByRule`, now exported) over 90,000 generated notes with a fixed seed: noise, focused runs of times, and planted ten-digit numbers in five forms (grouped, bracketed, spoken, written as times, a spoken digit before times) after cues and plain words. It checks that a note with no run, or one NFKC changes, comes out exactly as the shared rule gives it; that outside the runs the README lets stay, no more digits survive; that a planted number survives only where the shared rule leaves it or where it is itself a run that may stay (rising times, no cue); and that every run that may stay does. The rule for which runs may stay is written again in the test from the README, in tokens and gaps, so a slip in either copy shows. Three leaky stand-ins (keep the note as written; keep every run, joined or cued; drop a typed private-use character) must each be flagged.
- Source: review (keep the differential fuzz as a committed test).
- Verified: the five tests pass (37,000+ of the notes hold a run; all four properties at zero); each stand-in is flagged; the web unit suite, typecheck, build, gates and hygiene guard pass.

### test(data): the run-of-times fuzz compares byte for byte with the README written again
- What: the fuzz's digit-count checks could miss a leak by construction: a rejected run the shared rule mostly keeps refilled the count budget, a kept run was found again by text so the wrong copy could be blanked, the exact check covered only notes with no run, and the generator never put a spoken digit after the times, wrote two or four times, used most cue words or put punctuation between a cue and the run. The test now builds the README's output itself (the text between decided runs through the shared rule, each decided run kept or replaced, from tokens and gaps rather than the rule's parts) and requires `removePhoneNumbers` to match it byte for byte on every note. A planted number may survive only wholly inside a kept run or where the shared rule alone leaves it. The generator gains those forms and contexts, half its runs rise, and it uses mulberry32: the old generator's low bits repeated in short cycles and never drew some noise tokens. Floors hold the counts of notes with a run, with a kept run and with a typed private-use character.
- Source: review (Gemini, fourth round on the phone rule's fuzz harness: two critical, two high, two medium findings about the oracle).
- Verified: 90,000 notes agree byte for byte (25,557 hold a run, 4,762 keep one); no planted number gets through; each wrong stand-in is flagged, and a looser README that ignores joins is caught by the planted-number check; the web unit suite and typecheck pass.

### test(data): the fuzz keeps noise off planted numbers and knows street names
- What: at 1,000,000 notes two planted numbers read as getting through, but noise had glued onto a trailing spoken digit ("zerodouble", "nineat"), so it was no longer a digit, and a later digit completed the sequence by chance; the planted text now has a separator on each side. Three notes differed because the test's copy of the README joined a run to a street name's number (`四67th Ave`), which the shared rule never joins; the copy now has the same exception, and the shared README says so.
- Source: review (a 1,000,000-note check before merge).
- Verified: 1,000,000 notes on each of three random seeds (1544260262, 171560246, 1015165312): 0 differing, 0 planted numbers through, 0 isolation breaks, about 274,000 notes with a run and 49,500 keeping one per seed; the fixed-seed test passes (7).
### feat(judge): the Measured block says every count is from our own test runs
- What: under "Stored on our servers", one line says "All counts come from our own test runs and practice drills (<first day> to <file day>); no real search has used the app yet.", with the days taken from the file; the on-device report row says it was measured in our own iPhone test runs. No number is typed in the page.
- Source: review (every judge-facing number says where it came from).
- Verified: `src/judge/measured.test.ts` (the source line and the iPhone row) failed first, then passed (7); `e2e/judgeRun.spec.ts` now checks the served line; typecheck, 225 and 72 no-backend browser checks and the build pass.
### test(e2e): checks never spend the judges' practice searches
- What: the live browser run skips any check tagged `@quota` unless `PLS_ALLOW_QUOTA=1` is set, and the two checks that start a real practice search (judge.spec's first practice start and endSearch.spec) are tagged, so a deploy check spends at most two of the judges' 50 a UTC day and only when asked to. A new guard, `src/practiceQuota.test.ts`, scans every file under `web/e2e`, the workflows and the scripts: a press of the "Try a practice search" button, the button held in a variable, a request to `/startJudgeSession` or a `startJudgeSession` callable must sit in a `@quota` test or behind a `page.route` stub whose every `continue()` is behind a POST check. It proves itself on six planted samples (an untagged start, a tagged one, two good stubs, a stub that lets the start through, a held button, a helper's request) and refuses to pass on a scan of fewer than 80 browser-check files or 40 others.
- Source: review (the day's 50 practice searches ran out at about 20:40 UTC, used by checks; no check may draw from the judges' quota).
- Verified: the guard failed first (no @quota tag; the live config did not skip them), then passed (3 tests); the web unit suite, typecheck and the hygiene guard pass.

### test(data): the web rule gives every stored output in the shared phone corpus
- What: `phoneCorpus.test.ts` requires the committed corpus to be exactly what the generator writes for the current rule (its `rule` field is the SHA-256 of `phoneNumbers.ts`, so a rule change fails the test until the file is written again), at least 9,000 rows with the shared replacement, the stored output for every row with every mismatch listed, and the README to name the file's SHA-256. A planted wrong output in 50 rows is caught exactly once.
- Source: review (one corpus every platform checks).
- Verified: the five tests pass; the web unit suite (1216), typecheck, the gates and the hygiene guard pass.
### fix(command): Problem reports follow the rail's lead instead of preceding it
- What: the Problem reports panel sat first in the right rail, so once the test drill had a flag, the rail no longer led with what changed, the plan and the top segments (the agreed rail order). It now comes straight after the top segments, before the rest of the rail, so the working view stays first and a flag is still above Details.
- Source: live suite after the Problem reports deploy (`e2e/railOrder.spec.ts` failed with a flag present on the test drill).
- Verified: the rail-order check failed on the live site with the panel first; it runs after deploy. Typecheck, web unit suite and the hygiene guard pass.

### fix(ai): the receipt says no text or image left the laptop, not that nothing did
- What: every read sends one timing record with its route (path, reason, platform, stage and latency; `web/src/telemetry/trace.ts`, disclosed in `docs/SECURITY.md`), so "Sent: nothing left this laptop." and, for fixed wording, "Sent: nothing." overclaimed. They now read "Sent: no text or image left this laptop." and "Sent: no text or image.".
- Source: review (the receipt claimed more than the code does).
- Verified: the receipt and whatRan unit tests failed first, then passed; the plan and debrief-paper harness checks pass with the new line; web unit suite and typecheck pass.

### feat(ai): the receipt gives the time each read took
- What: a read that ran on this laptop or in the cloud now shows "Took: 2.6 s." under where it ran, from the route record's latency (the time the SDK call took), so the hybrid path's speed is visible in the receipt; under 0.1 s reads "under 0.1 s", and a route with no time (not reported, fixed wording, or a missing or negative latency) shows no line.
- Source: review (the Android app already shows the time of a cloud read).
- Verified: a new receipt unit test failed first, then passed (formats, both routes, and every case with no line); the existing receipt tests gain the line; the web unit suite and typecheck pass.

### test(web): the live clip check makes a clip no earlier run has made
- What: the check made each run's clip "fresh" from a random height (0 to 199), but neighbouring heights encode to the same bytes, so only 100 distinct clips exist, and 24 of them already had a stored reading on the test drill: about one run in four read a stored answer and called no model, failing "read once in the cloud". `make-moving-box.sh` takes the square's colour as a third argument (default red, so the harness clips are unchanged), and the check picks one of 512 colours (each channel in steps of 32; adjacent colours also encode alike) as well as the height, about 51,000 clips.
- Source: live suite (the clip check failed twice in three runs after the rules deploy).
- Verified: the 200 heights give 100 distinct SHA-256s and 24 match stored readings on drill-test-1 (read-only); 18 colours in steps of 32 give 18 distinct clips; the harness clip, frames and triage checks pass (28); the live check passed twice in a row.

### test(web): the removal check signs in fresh and joins the test drill itself
- What: in the full live suite the removal check used the run's shared signed-in account, which by then could hold a practice search's claims (the judge checks start practice searches on it). Its cached token still showed command of the test drill, so the post offered Remove, but `removeMember` checks the caller's current claims and refused with "Only command can remove someone." The check now starts from an empty browser and joins the test drill as command itself. (Its cleanup removed the fresh member it had made, as designed.)
- Source: live suite after the People panel deploy (the check failed with that refusal; the removal record its cleanup wrote is on the test drill).
- Verified: run alone against the live site, it passes end to end (the fresh member is removed from the People panel; its read is refused, its session refresh fails with TOKEN_EXPIRED, and its rejoin is refused).

### test(web): the retract check finds its report under Sightings whatever else is waiting
- What: the check expected its new report among the three sightings shown, but the test drill keeps undecided test sightings, some seen later than now, so the new one could fall below them and the check failed before it retracted anything. It now presses Show all (when shown) before checking where the report is listed.
- Source: live suite after the Problem reports deploy (the check failed at "listed under Sightings").
- Verified: run alone against the live site, the retract check passes.

### test(data): a phone case pending on the web must still fail there
- What: the shared phone-number cases marked pending on the web were skipped; now they run, and the test fails with "un-pend <name>" for any the web rule already passes, so a stale mark can never hide a fixed case (the iPhone's test does the same). The check uses one `passes` function for each case kind, the same contract as the per-case tests; `PLS_FORCE_PENDING=1` still runs pending cases as ordinary ones.
- Source: review (parity with the iPhone's vector test).
- Verified: a control with a planted passing case, a planted failing one and one pending on another platform returns exactly "un-pend already_fixed"; the vector test passes (106); web unit suite, typecheck and hygiene guard pass.

### fix(command): a post whose sign-in moved to another search says so
- What: a browser's sign-in holds one search and one role. Starting a practice search or joining another drill in another tab moved it, and a command post still open for the first drill then failed every write with a bare refusal. The post now watches the sign-in (any tab) and, when its claims name another incident, shows "You're signed in to another search in this browser. Reopen this drill with its command code to act as command." with a Reopen this drill button (another role on the same drill has its own line); after a refusal it rechecks with fresh claims, and the no-access panel gives the same line. `docs/LIMITS.md` says so.
- Source: review (a command who opens a practice search loses command).
- Verified: new unit tests (the line for each case; the watch reports each change, rechecks with fresh claims and stops) failed first, then passed; web unit suite and typecheck pass.

### fix(command): the sign-in line knows a practice search, a sign-out and a hidden tab
- What: a practice search has no join code, so its post now says "This browser is no longer signed in to this practice search. Open it again from the judge's page." with a button to the judge's page (the no-access panel too), instead of pointing to a code. A signed-out browser, or one whose sign-in holds no search, says it is no longer signed in to this drill rather than "another search". The post asks for fresh claims whenever its tab is shown again and every five minutes, so a refused action whose token predates the move still gets the line. A read that finishes after its watch stopped is dropped.
- Source: review (Codex, first round on the sign-in line: two medium, two low findings).
- Verified: updated unit tests (practice, signed out, no search, a late read after stop) failed first, then passed (7); web unit suite (1192) and typecheck pass.

### fix(command): only the newest sign-in check counts, and checks are spaced
- What: a sign-in check that finished after a newer one could restore an old line (or clear a current one); now only the newest read decides. The post also checks when its window gets focus, so side-by-side windows (no tab switch) still show the line before a refused action; the 5-minute check runs only while the tab is shown, and a forced check runs at most once in 30 seconds and never while one is running. Whether the post is a practice search now comes from the incident's own mode once it has loaded (an id is only the first guess), and the no-access panel's drill button reloads with the drill still in the link ("Reopen this drill") instead of dropping it.
- Source: review (Codex, second round on the sign-in line: three medium, two low findings).
- Verified: new unit tests (a late older read is dropped; forced reads are spaced and never overlap) failed first, then passed (9); web unit suite (1196) and typecheck pass.

### fix(command): a refusal's sign-in check is never dropped, and a stalled one does not block
- What: the check after a refused read is urgent: it skips the 30-second spacing, and one that comes while a forced check is running waits for it and then runs, so the line is right at the moment it matters. A forced check still running after 30 seconds counts as stalled and no longer holds the next one back.
- Source: review (Codex, third round on the sign-in line).
- Verified: two new unit tests (an urgent recheck inside the spacing runs after the running one; a stalled read stops blocking after 30 s) failed first, then passed; the claims tests (11) and typecheck pass.

### fix(command): the no-access panel never traps the browser
- What: the panel is its own component (`NoAccessPanel`). A drill offers "Reopen this drill" (a reload, for a sign-in that is back) and "Join another search" (the join form), so an expired drill whose token still names it no longer reopens into the same denial. A practice search points to the judge's page. When the search's mode has not loaded and only its id suggests a practice search, all three are offered.
- Source: review (Codex, third round on the sign-in line).
- Verified: three new render tests (drill, practice, mode guessed from the id) failed first, then passed; web unit suite and typecheck pass.

### test(e2e): the receipt's Sent line is checked against the request that left
- What: a deployed check, `web/e2e/receiptSent.spec.ts`, types a sighting note with a phone number in it. With no built-in model it reads the note, and no request reaches an AI host. After the consent tap the cloud read sends exactly one request, to the server prompt template, whose whole body is `{"inputs":{"note":...}}` with the number removed and no other field. The receipt counts exactly that note's bytes ("Sent: 94 bytes of the note, with phone numbers removed."), and no digit of the number is in the request.
- Source: review (make the receipt's honesty something a test proves).
- Verified: the check passes twice on the deployed site (build b890674b, the test drill); web typecheck and the hygiene guard pass; the sighting is cancelled, never saved.

### feat(data): command can ask for a new searcher or family join code
- What: `web/src/data/joinCodes.ts` calls the `rotateJoinCode` callable, checks its answer (eight join-code characters for the role asked, and a whole count of replaced codes), and gives a plain sentence for every refusal the server names (not_command, practice_search, not_open, collision, bad_role, bad_incident_id, not_signed_in), a refused sign-in or App Check token, and a dropped link.
- Source: review (command needs a way to replace a code that got out).
- Verified: new unit tests failed first, then passed (4); typecheck passes.

### feat(command): Give searchers or family a new code, beside the People list
- What: on an open drill, a Join codes section under People offers "Give searchers a new code" and "Give family a new code". Each asks first ("Every searcher code given out stops working. People already in the search stay in."), then shows the new code once, large and selectable, with Copy and how many old codes it replaced; Done hides it. A refusal keeps the confirm open with the server's reason. A practice search and an ended search show no codes. The members harness renders the section with a stand-in.
- Source: review (command needs a way to replace a code that got out).
- Verified: three new harness checks (ask, Cancel, Replace, Copy and Done; a refusal; no codes on a practice search) failed first, then passed with the members checks (10); web unit suite (1191) and typecheck pass.

### fix(data): a replacement with no answer says the code may already be replaced
- What: when no answer came back (a deadline, a server error, or an answer that could not be read), the line is now "No answer came back, so the code may already have been replaced. Replacing it again makes the newest code the only one that works." instead of "Try again", since the server may already have made a code a second tap would stop. `parseRotation` also refuses a replaced count JavaScript cannot hold exactly.
- Source: review (Codex, first round on the join-code panel).
- Verified: the new and extended unit tests failed first, then passed (5).

### fix(command): "Copied." names only the code the clipboard took
- What: the panel remembers which code a Copy wrote, so a Copy that finishes after command pressed Done and made another code never marks the new one copied.
- Source: review (Codex, first round on the join-code panel).
- Verified: a new harness test (a slow searcher Copy finishing over a family code) failed first, then passed; the members harness spec (11) passes.

### fix(command): the join-code panel shows only on an open drill
- What: the panel needs the drill's status to be open, as the server does, so an older drill saved as found no longer offers a replacement the server refuses.
- Source: review (Codex, first round on the join-code panel).
- Verified: typecheck and the web unit suite pass.

### fix(data): a dropped link also says the code may already be replaced
- What: "unavailable" now gets the may-already-be-replaced line too, since a reply lost after the server committed (a 503 from the host) reads the same as no connection; a second replacement would stop the code the first one made.
- Source: review (Codex, second round on the join-code panel).
- Verified: the extended unit test failed first, then passed (5).

### feat(command): the Plan section says when its history has come from the server
- What: the Plan section carries `data-plans-loaded` ("true" once the plan history has come from the server, which Approve waits for), so a check that takes the link down can wait for it first.
- Source: live check (the offline-approve check took the link down after the map drew from cache but before the plan history arrived, and Approve rightly refused).
- Verified: a new harness test (false while loading, true once loaded) failed first, then passed; the plan harness spec (14), web unit suite and typecheck pass.

### test(e2e): the offline-approve check waits for the plan history before taking the link down
- What: the deployed check now waits for the Plan section's `data-plans-loaded` before going offline. It used to go offline as soon as the map drew, which on the drill now came from cache before the plan history arrived, so Approve refused with "The plan history is still loading" and the check failed twice in a row.
- Source: live check after the deploy of 9e19f602.
- Verified: an online Approve after a 15-second wait succeeded on the drill (the history does load); the updated check runs after the next deploy.

### feat(command): the sighting form asks before saving a note that reads as a search report
- What: at Save, a note that reads as a team's search report rather than a sighting (`readsAsSearchReport`, shared engine) shows "This reads as a search report, not a sighting." with "Save as a sighting anyway" and, when the place is a cleared segment, "Add it to segment XX's debrief". It never blocks a save; an edited note asks again. The debrief scope guard lists the form and its harness: they hand a note to the debrief form and read no debrief.
- Source: review (a team's search report typed into the sighting form).
- Verified: three new harness tests (warning then save anyway; the debrief button only for a cleared segment, with nothing saved; a sighting saves on the first tap and an edit drops the warning) failed first, then passed; the sighting harness spec (26), web unit suite and typecheck pass.

### feat(command): a debrief can open with a search report from the sighting form
- What: `DebriefSection` takes a `prefill` (segment, note, seq). That segment's row opens its form as Add or Edit would, adds the note after what What worked already says, and puts the cursor there. Nothing saves until command fills the time and saves the debrief.
- Source: review (a team's search report typed into the sighting form).
- Verified: two new harness tests (a row with no debrief opens with the note, focused and unsaved, and saves it under What worked; a row with a debrief keeps its words and time and adds the note after them) failed first, then passed; both debrief harness specs (24) pass.

### feat(command): the post sends a search report to its cleared segment's debrief
- What: the command post gives the sighting form its cleared segments, and "Add it to segment XX's debrief" closes the form, opens Details and opens that segment's debrief with the note. A deployed-only check (`e2e/searchReport.spec.ts`) types a report on the drill, sends it to the first cleared segment's debrief, checks the box holds the note and has the cursor, and cancels, so it writes nothing.
- Source: review (a team's search report typed into the sighting form).
- Verified: typecheck, web unit suite and the harness suite (231) pass; the deployed check runs after the deploy.

### feat(data): which segments stand cleared, with taken-back clears left out
- What: `standingClears(events)` gives each segment with at least one clear that command has not taken back, so a search report is offered a segment's debrief only while that segment stands cleared.
- Source: review (Codex, first round on the search-report guard).
- Verified: a new unit test (an only clear taken back drops the segment; an earlier clear keeps it after a later one is taken back) failed first, then passed; the debrief data tests (15) pass.

### fix(command): a search report sent to a debrief keeps its sighting draft, and a late read fills nothing
- What: "Add it to segment XX's debrief" now leaves the sighting form open with its note and fields and says "The note is in segment XX's debrief, not saved yet. Save it there and cancel this sighting, or save it as a sighting anyway.", so a sighting is never lost when its debrief is not saved or cannot hold the note. A read still running at the first Save tap is dropped there too, so a field cannot change between the warning and "Save as a sighting anyway".
- Source: review (Codex, first round: a real sighting could be lost through the debrief path).
- Verified: the updated handoff test and a new late-read test failed first, then passed; the sighting harness spec (27) passes.

### fix(command): a search report never erases a debrief draft or a team's stored debrief
- What: a report sent to a debrief already being edited keeps every edit and adds the note after What worked (two reports add both); a stored debrief that arrives after a report opened the form empty fills what the form left empty and puts its What worked first, so a save keeps the team's words; and a report that arrives while a debrief is saving keeps the form open with the new note instead of closing with the save.
- Source: review (Codex, first round on the search-report guard).
- Verified: three new harness tests failed first, then passed; both debrief harness specs (27) pass.

### fix(command): the post offers a debrief only for a segment that stands cleared, and keeps the sighting open
- What: the post passes `standingClears` to the sighting form (a taken-back clear offers no debrief), no longer closes the sighting form on the handoff, and opening Details for the handoff no longer counts as reading it, so the new family-answer count stays. The deployed check now tries each debrief row until one stands cleared and cancels both forms.
- Source: review (Codex, first round on the search-report guard).
- Verified: typecheck, web unit suite (1234) and the harness suite (235) pass; the deployed check runs after the deploy.

### fix(data): a debrief links only to a clear that stands
- What: `clearedSegments` leaves out clears command took back, so a segment's debrief links to its latest standing clear and a segment whose every clear was taken back has none; `standingClears` is now its set of segment ids.
- Source: review (Codex, second round on the search-report guard).
- Verified: a new unit test (the latest clear taken back links the earlier one; all taken back lists none) failed first, then passed (16).

### fix(command): a debrief row keeps every search report, draft and stored word
- What: a save that fails before the stored debrief loaded leaves the late merge armed, so the debrief merges when it arrives and a retry keeps the team's words; the merge skips fields command changed by hand (an emptied hazard stays empty) and does not repeat a What worked the team's text already holds; a report sent while the paper sheet is open waits, shown in the row, and opens in the form when the sheet closes; and a report the box already holds is not added again.
- Source: review (Codex, second round on the search-report guard).
- Verified: four new harness tests (failed save then late debrief; an emptied field; the paper sheet; the same report twice) failed first, then passed; both debrief harness specs (31) pass.

### fix(command): the sighting says when its note's debrief was saved, and can send it again
- What: after command saves that segment's debrief, the sighting form says "Segment XX's debrief was saved. Cancel this sighting, or save it as a sighting too." instead of "not saved yet", and the debrief button stays, so a debrief cancelled by mistake can be opened again with the note.
- Source: review (Codex, second round on the search-report guard).
- Verified: a new harness test failed first, then passed; the sighting harness spec (28) passes.

### fix(command): the post reports a saved debrief to the sighting, and nested toggles leave Details' counts alone
- What: a debrief save for the handoff's segment tells the sighting form it was saved; and the Details rail ignores toggles of details inside it (a photo's What ran, say), which reached its handler and marked the family's answers read.
- Source: review (Codex, second round on the search-report guard).
- Verified: typecheck, web unit suite (1235) and the harness suite (240) pass.

### refactor(command): a search report opens its segment's debrief instead of filling it
- What: the sighting form's debrief button is now "Open segment XX's debrief": it opens Details at that segment's debrief and puts the cursor in What worked, as Add or Edit would, unless that form or the paper sheet is already open. The sighting form keeps its draft and says "Segment XX's debrief is open below. Copy what belongs there, then cancel this sighting, or save it as a sighting anyway." No note is carried into the debrief, so the prefill, the late merge, the waiting queue and the "saved" status are gone; the debrief row is back to main's apart from the open request. The rule, its vectors, the Save-time warning, "Save as a sighting anyway", standing clears and the nested-toggle guard stay.
- Source: review (Codex, third round on the search-report guard: one high and five mediums, all in the auto-fill; replaced by design rather than patched).
- Verified: three new debrief harness tests (opens as Add with the cursor in What worked and saves nothing; keeps an open form's edits; leaves an open paper sheet alone) and the rewritten sighting handoff test pass; the two that need the request failed first. Web unit suite (1240), typecheck, harness suite (237) and every gate pass.

### fix(command): a debrief form never overwrites what another screen saved
- What: the form remembers what the stored debrief said when it opened, and a save refuses with "This debrief was saved from another screen while you edited. Cancel and open it again to see it." if another screen has saved it since, instead of writing this form's older copy over it (a hazard another tab added was deleted). This held for a form opened by hand as well as from the sighting form.
- Source: review (Codex, scoped pass on the open-only handoff).
- Verified: a new harness test (another screen saves while the form is open) failed first, then passed; both debrief harness specs pass.

### fix(command): an open request a debrief row already acted on is not acted on again
- What: the debrief section keeps the newest open request a row has acted on, so a row that leaves (its clear taken back) and comes back does not open its form and take the cursor again without a new click.
- Source: review (Codex, scoped pass on the open-only handoff).
- Verified: a new harness test (the row leaves and comes back) failed first, then passed; both debrief harness specs (27), web unit suite and typecheck pass.

### fix(map): a sighting placed from the Place list lands inside its segment
- What: `segmentChoices` gives each segment a point inside it: its centroid when that lies inside, else the middle of the widest stretch of the segment along one of 15 lines of latitude. Five shipped segments had a centroid outside themselves (Kennesaw EN and EQ, Piedmont AJ, AQ and AY), so a sighting placed there from the list was stored outside the segment and the form said "Outside the search area".
- Source: review (Codex, while reviewing the search-report guard).
- Verified: two new unit tests (a U-shaped segment; every segment of both shipped grids is placed inside itself) failed first, then passed; the old test's triangle, whose centroid sat on its edge, is now the square it was meant to be. Web unit suite, typecheck and harness suite pass.

### fix(map): a segment's place point resolves to that segment among all of them
- What: `insidePoint` (now exported) keeps the centroid only when it resolves to its own segment among all segments, since a centroid on an edge a neighbour shares can count as the neighbour first; otherwise it takes the widest stretch inside along 15, then 63, lines of latitude kept off round values, again only where it resolves to its own segment. It finds a ring's latitude range with a loop, so a ring of 150,000 points no longer overflows the stack.
- Source: review (Codex, first round on the Place list fix).
- Verified: two new unit tests (a centroid on a shared edge; a 150,000-point ring) failed first, then passed (13); about 4 ms for the 338-segment Kennesaw grid.

### fix(map): the map's centre dot sits inside its segment
- What: `centreFeatures` puts each dot at `insidePoint`, so on the five segments whose centroid lies outside them, a click on the dot picks the segment it belongs to instead of "Outside the search area". The old test's triangle, whose centroid sat on its edge, is now a square.
- Source: review (Codex, first round on the Place list fix).
- Verified: a new unit test (a U-shaped segment's dot resolves to it) failed first, then passed; map tests (25), web unit suite, typecheck and harness suite pass.

### fix(ai): the AI instance reads its App Check flag once, from Remote Config, never from a caller
- What: `aiClient(app)` no longer takes the limited-use-token flag. The page's one instance reads it once from the activated Remote Config value (`activatedLimitedUseTokens`, the default when nothing is activated or the config cannot be read), so the judge page (which passed the default) and the command post (which passed the live value) can no longer build it with whichever flag asked first; `getAI` refuses a second instance with another flag (ALREADY_INITIALIZED), so a changed value applies on the next load. `WebRc.useLimitedUseTokens` is gone, since nothing reads it now.
- Source: review (the instance kept the first caller's flag).
- Verified: four new unit tests (judge then post share one instance and the activated "false"; an empty value and an unreadable config take the default; no caller passes a flag) failed first, then passed; web unit suite (1249), typecheck, harness suite and every gate pass.

### fix(ai): the web always asks for limited-use App Check tokens
- What: `aiClient` builds the page's one instance with `useLimitedUseAppCheckTokens: true` and reads no Remote Config value for it. Reading the key once per page (the previous commit) could still lock in an early or stale value: Remote Config loads its saved values in the background, so a page that loaded an old `false` before the newly published `true` would have kept `false`, and with replay protection enforced every cloud call on that page would fail. The web's `use_limited_use_tokens` default and `activatedLimitedUseTokens` are gone; the phones still read the key, with `true` as their default.
- Source: review (Codex, scoped pass on the read-once fix).
- Verified: the updated tests (a Remote Config `false` leaves it on; no web file reads the key or passes another flag; client.ts builds with `true`) failed first, then passed, and fail again with the flag set to `false`; web unit suite, typecheck and every gate pass.

### fix(command): the Plan section says, before Suggest plan, where the wording is made and what it sends
- What: one line under "Draft for the current reports." says "Suggest plan words the draft on this laptop's built-in model, or with Gemini in the cloud when it has none. It sends only team ids, segment codes and percents, never a note or a name." (what `planPrompt` holds), or, while command has paused cloud reading, "Cloud reading is paused, so Suggest plan uses fixed wording and sends nothing." Before, the screen said nothing until after the tap, when a Cloud mark and a closed What ran appeared.
- Source: review of the deployed judge door in a fresh browser profile (a practice search's Suggest plan went to the cloud with no word beforehand).
- Verified: a new harness test (both lines, and the cloud one absent while paused) failed first, then passed; the fallback test's no-laptop-notice check now leaves out this line. Plan harness spec (15), web unit suite, typecheck, harness suite and every gate pass.

### test(evidence): the judge door evidence is checked against itself and the Plan section
- What: `judgeDoorEvidence.test.ts` reads docs/evidence/web/2026-11-22-judge-door-what-leaves.json and asserts it holds only methods, query-free addresses and statuses, that its AI calls answered 200 with no Firestore write, and that it quotes the Plan section's line exactly as `WhatChanged.tsx` has it.
- Source: review of the deployed judge door.
- Verified: passes with the file (3) and fails without it.
### fix(command): an older sign-in token never clears the line a newer one set
- What: the sign-in watch keeps the issue time of the newest token it applied and ignores a token issued before it, even when its change event comes last: a refresh that started before another window moved this account to another search could return this drill's older token, which the SDK stores and announces, and that read cleared the "signed in to another search" line. A sign-out starts the count again.
- Source: review (backlog issue #317).
- Verified: a new unit test (the other search's 12:05 token applied, then this drill's 12:00 token ignored, then a 12:10 token applied) failed first, then passed; the claims tests (12) and typecheck pass.

### fix(command): the newest sign-in token wins by when it was issued, per account
- What: the watch now applies a token when it was issued no earlier than the newest one applied, whatever order the reads finish in, so a newer forced refresh is no longer dropped because an older token's read started later; it starts again when the signed-in account changes (another account's older cached token still applies) and drops a token for an account no longer signed in. A reply with no readable issue time still falls back to the newest read.
- Source: review (Codex, first round on the token-order fix).
- Verified: three new unit tests (another account; a newer forced refresh finishing after an older read; a token for an account that left) failed first, then passed; the claims tests (15) and typecheck pass.

### fix(command): within one second, the newer sign-in read wins
- What: issue times count whole seconds, so two tokens can share one; a later token still wins whatever order the reads finish in, but within the same second the newer read now wins, as it did before the issue-time rule, so an earlier read can no longer bring back a line a newer one cleared.
- Source: review (Codex, second round on the token-order fix).
- Verified: a new unit test (two tokens of the same second finishing out of order) failed first, then passed; the claims tests (16) and typecheck pass.

### fix(judge): a browser that fails the security check is told why the practice search cannot start
- What: when the server refuses the practice search for a failed App Check (or sign-in), the judge's page now says "This browser did not pass the site's security check, so a practice search cannot start. Nothing private was sent. Reload and try again; the drill replay on this page plays without it." instead of "This browser could not be checked." A deployed-only check (`e2e/judgeNoAppCheck.spec.ts`) blocks every App Check exchange in a fresh profile and asserts the line within 30 s, a usable button, the replay and no page errors; it answers the start call in the page with the server's own refusal (HTTP 401), so it can never start a practice search.
- Source: review of the deployed judge door with App Check failing (the page answered in 8 s with no crash or hang, but did not say what failed or what still works).
- Verified: the updated unit test failed first, then passed (11); the deployed check fails on the live site's old line, as expected before the deploy.

### test(e2e): Suggest plan sends only what the Plan section says it sends
- What: a deployed-only check (`e2e/planPayload.spec.ts`) removes the built-in model on the test drill, presses Suggest plan and reads the one model request: every line of its text is a fixed heading, a team id with its segment codes, or a segment code with its percents (so no note or name), and the receipt's "Sent: N bytes of plan text." counts exactly that text. Nothing is approved, so nothing is written. With #308's note check, both cloud payloads a judge can send are compared with what the screen says.
- Source: review of the deployed judge door (compare the shown cloud payload with the request).
- Verified: passes on the live site; a copy whose segment-line pattern never matches fails on a real line ("AD 1.1% (was 1.1%)").

### test(e2e): the security-check judge door check names the replay region it shows
- What: with a published run the judge's page names the region "Watch the drill replay" ("Replay the training drill" is the no-run name), so the check now looks for that; its other assertions (the plain line within 30 s, a usable button, no page errors) were already passing on the live site.
- Source: live suite after the deploy of 4c9587de.
- Verified: the check passes in the full live suite (96 of 96).

### test(e2e): the plan payload check presses again when other checks change the draft
- What: other live checks write reports to the test drill at the same time, and a reply for a draft that changed meanwhile is never shown (by design), so the check presses Suggest plan up to three times; it now checks every request those presses sent (one content, one text part, only headings, team lines and segment lines) and compares the receipt with the last one, whose reply is on screen.
- Source: live suite after the deploy of 4c9587de (the check passed alone and timed out in the full suite).
- Verified: passes in the full live suite (96 of 96).

### test(e2e): with no built-in model, the on-device-only reads send nothing to any model
- What: a deployed-only check (`e2e/noModelSendsNothing.spec.ts`) removes `window.LanguageModel` before load and presses each on-device-only path up to its no-model answer, short of any consent or cloud button: Get this laptop ready on the judge's page, Read the note, and the paper debrief sheet read. No request may go to a model host, carry a model method (`:generateContent`, `:countTokens`) or reach the unresolvable fallback host the private reads use, since the SDK sends even an ONLY_ON_DEVICE call to the cloud when the browser has no LanguageModel (firebase-js-sdk #10635) and only the gate stops it.
- Source: review (another team showed the SDK's cloud fallback with no LanguageModel).
- Verified: passes on the live site; against a scratch build of main whose note read skipped the gate (served to the test browser at the live address, nothing deployed), it failed with `POST https://on-device-only.invalid/.../gemini-3.5-flash-lite:generateContent`. The scratch copy was deleted.

### feat(support): the support page gives a contact email
- What: /support now says "Email stevefunds2006@gmail.com about a problem with the app, an abusive post or member, or deleting your data." as a mailto link, above the GitHub issues line, which stays as the second way to get help. Published contact for an app with user content (App Store guideline 1.2); the owner chose the address.
- Source: App Store review requirement.
- Verified: a new unit test (the line, one mailto, no other address) failed first, then passed; the public pages checks (6) pass against a preview build, with one more that the live /support HTML serves the line, run after the deploy.

### fix(command): the sighting form says a debrief was opened, not that it is open
- What: after "Open segment XX's debrief", the line now reads "Segment XX's debrief was opened below. Copy what belongs there, then cancel this sighting, or save it as a sighting anyway.", which stays true if that debrief is cancelled or Details is closed; it used to say "is open below" until the note changed or the form closed.
- Source: review (backlog issue #318).
- Verified: the harness and deployed checks expecting the new line failed first, then the sighting harness spec passed (27); typecheck passes.

### fix(data): the sign-in line drops replies from an earlier session and ranks untimed replies by read order
- What: each sign-in is its own session, so a reply from a read started before a sign-out is dropped even when the same account signs in again; while the line comes from a reply with no readable issue time, a timed reply applies only if its read started later and its token was issued after the newest one applied.
- Source: review (backlog issue #327).
- Verified: three new unit tests (the same account signing out and in again; an earlier read's timed reply landing after a newer untimed one; an older token from a later read after an untimed reply, from review) failed first, then passed with the 16 existing claims tests (19); typecheck passes.

### docs(evidence): describe the clip of the command post removing a member
- What: docs/evidence/web/README.md describes a 20.96 s screen recording (1920 x 1080) of the deployed command post on the App Review drill removing a test searcher ("Removed" on screen, the other searcher kept), then opening the new-code confirm and cancelling it, moment by moment, with the file's SHA-256. The clip is kept outside the repository (it takes no video files); it was made for the App Store review.
- Source: App Store review asks to see an abusive member removed.
- Verified: stills at 0, 25, 50, 75 and 99 percent and one a second were checked by eye (no join code, member id or personal data on screen); a fresh sign-in afterwards read Team 1 searcher active and Team 2 searcher removed.

### fix(command): the rail's Details sections keep their space apart
- What: the sections under the command post rail's Details (conditions, prior, photos, debriefs, People, Join codes and the rest) were drawn touching, 0px apart, so a "Removed" tag sat against the "Join codes" heading. The 20px between them is now set with margins, because Chrome lays an open details' content out in its own box and the flex gap on the details reached only the summary.
- Source: review of the command post recording for App Review.
- Verified: measured 0px between sections on the live page in Chrome 159 first; a new members harness check (People and Join codes inside the rail's Details, with a Removed row) failed at 0px, then passed at 20px; the harness suite, web unit suite, typecheck and gates pass.

### fix(ai): a plan reason may use only its own team's figures, each in its own role
- What: a team's reason, shown beside its task, may now use only the numbers in that team's own rows of the plan the model was given (its segments' current and earlier POA, and its own team id). A value that is only an earlier POA needs a cue such as "was" or "from" just before it (cues are read across the figure's own clause, a colon joining a label to its figure, and an earlier cue wins over "at" or "now" in it), and a current POA may not have one. The team's own id never supplies a number ("T1", in any case, is not a 1), a word saying a POA rose or fell (or "higher" or "lower than before") needs one of the team's segments that did and is refused when negated ("did not rise"), and a minus sign or spaced dash the plan never gave is refused (a dash joined to a word is punctuation). A reason that quotes another team's POA, or gives an earlier POA as the current one, is refused and the plan falls back to the fixed wording, with "its wording failed the checks". The summary is still checked against the whole plan.
- Source: review.
- Verified: new unit tests for another team's POA, an earlier POA given as current, a current POA given as earlier, the template fallback for both refusals, and the summary still reading the whole plan failed first where they should, then passed; eleven more from three review rounds ("was at", a figure from the team id, a wrong direction, a minus sign; a cue across a sentence, a Unicode minus, a negated or other direction word, the id in another case or in brackets; a label's colon, "lower than before", a dash joined to a word) failed first, then passed (49); typecheck passes.

### fix(data): a "[number removed]" already in a note is never a phone cue, so a second scrub keeps its times
- What: before a run of times, the shared rule reads the three words before it for a phone cue, and the "number" inside a "[number removed]" counted as one. So a note scrubbed twice (a paper debrief is scrubbed when the sheet is read and again when it is saved; an AI-read sighting note likewise) lost its times: "Witness 4045550142 at 14:03 14:10" became "Witness [number removed] at 14:03 14:10" and then "Witness [number removed] at [number removed]". The marker's words are now read past like the digits they stand for (web/src/data/phoneNumbers.ts, cuedRun), and, from review, a marker right before or after a run of times with no letter or digit between counts as digits joined to it, so the run goes ("Dial [number removed] 4:04 5:55 12:12" no longer keeps 404-555-1212). New shared cases mustKeep `marker_then_times` and exact `marker_beside_times`, pending on the iPhone (Android ports the rule in the same change); shared/test-vectors/README.md states the rule and a dated "Scrubbing twice" check; docs/LIMITS.md gives 130 cases, Android 119, the iPhone 117, the web 119; the corpus is rewritten (9,129 rows, its SHA-256 in the README).
- Source: review of #284.
- Verified: the new cases and a paper-debrief save test failed first, then passed; a new check that scrubbing every case's output again changes nothing passes on every case the web runs (it passed before the fix too, so no existing case changed); the corpus check, the corpus test, the shared vector test, the web unit suite, typecheck and gates pass.

### test(data): the corpus may only lose rows where a second scrub takes more
- What: the web corpus test counts the notes whose output a second scrub changes and fails above 39, the count on 2026-11-22 with the marker fix (46 before it; the read-past rule brought it to 37, and the rule that a marker beside a run removes the run adds back two runs a first pass leaves beside its own marker). They are notes whose first pass folds characters (NFKC, a carriage return) and so skips the run-of-times step, and runs after a date whose first hour the first pass leaves. A planted row checks the count can fail.
- Source: review.
- Verified: the test passes at 39 and failed with the ceiling at 36 on the 37 rows before the beside-marker rule; the planted row is caught.

### fix(data): a run beside a [number removed] takes the digits joined to it, written or spoken
- What: when a run of times sits right beside a "[number removed]", the replacement now also takes every digit part joined to the run, written or spoken. "Dial [number removed] 4:04 5:55 one two one two" used to leave "one two one two" (the last four digits of a number); it now gives "Dial [number removed] [number removed]". The run loop also skips a later match that starts inside a group already replaced.
- Source: second review of #342.
- Verified: new phoneNumbers tests (joined spoken digits after the run, joined digits before it, the plain case, and times with a word between them and the marker) failed first where they should, then passed; the corpus regenerated with only its rule hash changed; web unit, typecheck and gates pass with the shared-file changes applied.

### fix(data): only a run with nothing joined to it goes with a [number removed] beside it
- What: the rule that a run of times right beside a "[number removed]" is removed now applies only to a run with no digits joined to it; a run with digits joined to it, written or spoken, is left to the shared rule, as it was before the marker rule. The earlier widening over joined digits is gone: it split a later time ("Dial [number removed] 4:04 5:55 one two 12:34 15:56 [number removed]" left ":34 15:56"), dropped a line break and changed what a second pass removed. "Dial [number removed] 4:04 5:55 12:12" still gives "Dial [number removed] [number removed]".
- Source: third review of #342.
- Verified: the beside-marker tests (an unjoined run goes; a joined group leaves no spoken run or two-digit group and keeps its line break; a word between keeps the times) failed first where they should, then passed; on eight inputs from the last review the web gives exactly the pre-marker output on both passes for seven, and the eighth differs only on a second pass, which settling every note on its first scrub resolves; corpus, vector and debrief tests pass.
### fix(command): an App Check refusal at join offers "Reload page"
- What: when App Check refuses a join, the form now says "This browser did not pass the site's security check. Reload the page and try again; if it fails again, try a normal browser window." with a "Reload page" button beside it. No other join error offers one. A reload often clears the refusal: the App Check SDK backs off after a failed check and reads a stored token only when the page starts, so a tab whose check failed keeps sending joins with no App Check token until it is reloaded.
- Source: review (a join refused with no App Check token 8 s after the same browser's join passed).
- Verified: unit tests for the line and for which errors offer a reload failed first, then passed; the live App Check spec now expects the line, the button and a reload, and failed on the site before this deploy; a new live check that a wrong code offers no reload passes; web unit, typecheck and gates pass.

### fix(command): People lists the members records only, so someone who left is gone
- What: the command post's People list now comes from the incident's members records alone (never the caller, never a command record), with removed members marked and last. It used to add every searcher or family author of the incident's events, for accounts that joined before members records existed; with Leave and delete this sign-in now deleting the account's members record, that fallback would have kept someone who left in People, with "Remove from this drill". Their reports and flags still name their team from the events. On the live project this hides only seeded authors with no record (10 in each of two test drills); judge practice searches copy no events, so they are unchanged.
- Source: review (the Leave path is changing to delete members records).
- Verified: memberRows tests rewritten for the new rule (an account with no record is not listed, removed records come last, never the caller or command) failed first, then passed; the members harness keeps the same rows from records; web unit, typecheck and gates pass.

### fix(data): a note is scrubbed until it stops changing, so what is shown is what is stored
- What: removePhoneNumbers now runs the shared rule until the text stops changing, at most four passes (MAX_PASSES; every note in the shared corpus settles in two). If it still changes after the fourth, it keeps the fourth pass's text, the most scrubbed, and logs a fixed line with no note text. One pass stays exported as removePhoneNumbersOnce, only for the differential check against the README (a settled scrub can only add markers, never keep a digit one pass removed). A note is scrubbed when it is read and again when it is saved (the paper debrief, the AI-read sighting), so what was shown and what was stored could differ; now they cannot. On the shared corpus, 39 notes come out differently, none with more digits left; 18 lose a date that the first pass kept beside a run of times after it.
- Also, from review: the marker check read back to the start of the note for every word, so a 350,000-character note took about 3 seconds a pass (6 settled); it now reads only a marker's length back (72 ms a pass, 120 ms settled), with the same results.
- Source: review (a scrubbed note scrubbed again took more).
- Verified: new tests for settle (a scrub that never settles runs exactly four times, returns its fourth output and says so once; one that settles stops at the first unchanged pass), for a settled result in one call, for every corpus note settling on its first scrub (the ceiling of 39 is now 0, and a planted non-settling scrubber is caught), and for the paper debrief and sighting saves storing every corpus note exactly as shown, all failed first, then passed; the corpus regenerated; web unit, typecheck and gates pass with the shared-file changes applied.

### fix(ai): plan wording never says what a segment code stands for
- What: the plan wording prompt now says segment codes such as AA or CC are map grid squares, not abbreviations, and never to say what the letters stand for; and checkWording refuses any reason or summary that does: words in brackets right after a code ("AC (the north field)"), a code in brackets after words ("Upper Meadow (AC)"), or capitalized words in a row whose initials spell a code ("Customer Complaints" for CC). Such a plan falls back to the fixed wording.
- Source: review (on Chrome's built-in model, a prompt for reasons with no figures made every reason invent a meaning for the codes).
- Verified: new checkWording tests (each shape refused in a reason and in the summary; a code used as a code, and capitalized words that spell no code, kept; the prompt names grid squares) failed first, then passed (54); replayed on the recorded wordings, the check refuses none of the 8 runs recorded on 2026-11-21 and 3 of the 6 that invented code meanings; 6 runs on Chrome's built-in model with the new prompt line spelled out no code (local evidence, not in the repo); typecheck passes.

### fix(ai): plan wording never says where the person is or that they will be found
- What: the prompt already forbade it; checkWording now refuses it too, in any reason or the summary: an outcome promised ("will be found"), a place given as likely ("probably near the creek", "is located", "must be in"), or the missing person placed somewhere ("she is likely in AC"). The plan then falls back to the fixed wording. A segment in a ranking ("AC is in the top three") is not refused.
- Source: review.
- Verified: new checkWording tests (each claim refused in a reason and in the summary; a plain team reason and a ranking kept) failed first, then passed (57); replayed on the 19 recorded wordings, none is refused for this; typecheck passes.

### fix(ai): plan wording checks: any verb placing the person, a promise to find them, a code defined in words
- What: from review of the two checks above. The person check now refuses the missing person placed near any place word whatever the verb ("remains in AC", "wandered toward the creek"), and an active promise to find them ("Team T1 will find the missing person", "the best chance to find her"). The code check now refuses a code defined in words ("AC stands for access corridor", "short for") and no longer refuses brackets about a code's figures or rank ("AC (up from 20.0%)", "the highest POA (AC)"). Its patterns are built once per plan for all its codes, so a plan of 480 grid squares is checked in a few milliseconds, not 200.
- Source: review.
- Verified: new tests for each case (and for 480 grid squares under 100 ms) failed first, then passed (61); replayed on the 19 recorded wordings, the only refusals are a reason naming another team's segment and the 3 runs that spelled out a code; typecheck passes.

### fix(ai): a plan reason or summary never mentions the missing person
- What: replaces the verb list in the person check with a rule that closes the class. A reason explains why a team searches its segments and never needs to mention who is being searched for, so any reason or summary with a word for the person (person, missing, subject, child, patient, she, her, hers, he, him, his) is refused and the plan falls back to the fixed wording. The plan carries no name for the person, so there is no name to match. The phrases that claim an outcome or a place without naming anyone ("will be found", "Team T1 will find", "likely in AC", "is located", "must be in") are still refused.
- Source: review.
- Verified: a new test (six reasons and one summary that mention the person in different ways) failed first, then passed (62); replayed on the 19 recorded wordings, none falls back for this; typecheck passes.

### fix(ai): plan wording checks: person nouns, they, rescue verbs, "means", and words that look like codes
- What: from the second review of the checks above.
  - Person: the word list adds they, them, someone, anyone and common person nouns (hiker, walker, runner, hunter, climber, camper, man, woman, boy, girl, kid, toddler, elder, victim, survivor). "Their" stays allowed, since models use it for segments.
  - Rescue promises now cover find, locate, rescue, recover and save after a modal, and "bring ... home".
  - Codes: a definition with "means", "refers to" or "denotes" after a code is refused. Brackets beside a code pass only when every word in them is a figure or rank word, so "AC (access corridor, highest POA)" is refused while "the highest-probability segment (AC)" is kept.
  - Initials count only for the codes a text is about (its team's own segments, or codes it names), and Team, Segment and Search split a run of capitals, so "Assign Team T1" is not read as a code.
  - Segment codes are blanked before the person check, so a grid square named HE is not read as "he".
- Source: review.
- Verified: new tests for each case failed first, then passed (67); replayed on the 19 recorded wordings, the same 4 are refused as before and none newly; typecheck passes.

### fix(ai): plan wording checks: a location or rescue as a noun, and "represents"
- What: from the third review of the checks above.
  - The person check refuses a location as a noun ("their current location is", "whereabouts", "the position is") and an outcome promised as a noun ("a successful rescue", "reunite").
  - The code check refuses "represents", "corresponds to", "is called" and "is named" after a code.
  - "previously", "before", "earlier", "since", "start" and "then" count as figure words in brackets, so "AC (31.0%, previously 20.0%)" is kept.
  - Known cost, accepted: a summary using "they" for grid squares falls back to the fixed wording, because "they" is refused to keep the person out.
- Source: review.
- Verified: new tests for each case failed first, then passed (70); replayed on the 19 recorded wordings, the same 4 are refused as before and none newly; typecheck passes.

### feat(ai): plan reason facts and the sentences code writes for them
- What: a new module, web/src/ai/reasonCodes.ts.
  - It lists the facts that hold for each team's own segments: highest POA, in the top three, rose since the starting map, POA now, not searched yet, searched and still in the top three, raised by the newest report, near a trail, road, stream, water or building (the grid's classes within 71 m), and the ISRID distance band from the last-seen point.
  - It writes each fact's sentence from a fixed template and the plan's own values. A reason never passes the 200 characters a plan doc allows: when two facts do not fit, only the first is shown.
  - The summary is written from the same choices.
  - PlanDraft gains an optional facts field. Nothing uses the module yet.
- Source: plan wording review.
- Verified: 13 new tests pass, and breaking any of four rules (top-three cut, the 200-character fit, searched-and-still-high, the ring edge) fails at least one; typecheck passes.

### feat(ai): the model picks each team's reason codes and code writes every sentence
- What: plan wording no longer asks a model for any text.
  - The prompt lists each team's segments and the facts code found for them, with the segments each fact holds for.
  - The model returns, per team, one or two codes from that team's own list (none for a team with no segment), in a closed schema whose codes are the known fact codes.
  - checkChoice refuses a reply whose teams differ from the draft, or that picks no code, more than two, a repeated code, or a code outside the team's own facts; the plan then uses the fixed wording.
  - Code renders each reason and the summary from the codes chosen, and the worded plan keeps the codes.
  - The free-text checks (figures, directions, code meanings, the missing person) are removed with their tests, since no model text reaches the page.
  - The measurement page checks a reply with checkChoice.
- Source: plan wording review.
- Verified: new tests for the prompt, the schema, the rendering and checkChoice failed first, then passed (45 with the fact tests); a reply carrying extra text renders only code's sentences; typecheck passes.

### feat(command): the plan draft carries each segment's facts, and a suggestion follows them
- What: the command post fills the draft's facts with web/src/command/draftFacts.ts. Each segment gets:
  - its grid features;
  - whether a team has searched it (cumulative POD above 0);
  - whether the newest report raised it;
  - its distance band from the last-seen point, from the ring model's radii for the incident's terrain column (flat when unset), and only when the map uses the ring model.
  - A suggestion's key (draftKeyOf) now includes the facts, so a reason written from old facts is withdrawn when a search or a report changes them.
- Source: plan wording review.
- Verified: new draftFacts and draftKeyOf tests failed first (missing module), then passed (4); typecheck passes.

### test(harness): the wording measurement page records reason codes and checks the sentences
- What: the measurement page's made-up plan now has made-up facts for its segments. Each run records the codes the model chose, whether every reason shown is exactly code's sentence for those codes (each one of that team's own facts), and whether the summary is exactly code's summary for the same choices.
- Source: plan wording review.
- Verified: typecheck passes; the page is a dev-server page, measured in Chrome.

### fix(ai): a plan reason never offers "top three" for the segment with the highest POA
- What: teamFacts no longer lists top_three for the segment that holds highest_poa, so a team's two reasons cannot say one thing twice ("CC has the highest POA, 1.4%. CC is in the top three by POA."), as every measured run did.
- Source: measurement of the reason codes on Chrome's built-in model.
- Verified: new and changed reasonCodes tests failed first, then passed; typecheck passes.

### feat(ai): a team's facts are listed most specific first
- What: FACT_CODES, and so each team's list in the prompt, now runs from the most specific fact to the most general: the newest report, not yet searched, searched and still high, the features, the distance band, then the ranking every segment has. In every measured run the model chose the first ranking facts listed; this order is what the next measurement compares against its reverse.
- Source: measurement of the reason codes on Chrome's built-in model.
- Verified: a new reasonCodes test of the order failed first, then passed (51 with the plan wording tests); typecheck passes.

### test(harness): the wording measurement page compares the facts' order with its reverse
- What: the measurement page runs six wordings per page, alternating each team's facts in the command post's order (most specific first) and in reverse, and starts each page with the order the previous page did not (kept in browser storage). Each run records its order and the fact lists it sent, to show whether the model's choice follows the facts or their place in the list. The reversal is web/src/harness/reverseFacts.ts.
- Source: measurement of the reason codes on Chrome's built-in model.
- Verified: new reverseFacts tests (it reverses each team's facts and nothing else, also on the command post's own prompt) failed first (missing module), then passed (2); typecheck passes.

### feat(ai): the model picks each team's main reason; code adds one supporting fact by a fixed rule
- What: the model now returns one code per team (its main reason), not one or two. supportingFact adds a second fact by a fixed priority: the newest report, search state, features, the distance band, then the ranking. It skips the main code and any fact that repeats it (POA now beside the highest POA or a rise).
  - The worded plan records each team's main and supporting codes. The measurement page checks each reason against both.
  - In the order test, the model's lead pick held whichever order its facts were listed in, but its second pick moved with the order. So the second fact is now code's fixed rule, not a model judgment.
- Source: measurement of the reason codes on Chrome's built-in model.
- Verified: new supportingFact tests and the changed plan wording tests failed first, then passed (50); typecheck passes.

### fix(command): the Plan section says what the model chooses and what code writes
- What: the line shown before Suggest plan is now "Suggest plan asks this laptop's built-in model (Gemini in the cloud when it has none) to choose each team's main reason from that team's own facts. Code adds a second fact and writes every word. It sends only team ids, segment codes and fact codes, never a note or a name."
  - "What ran" names a refused answer as one that named other teams or a fact that team does not have. The failure for a number not in the plan is gone, since no model text is used.
  - The plan harness check and the deployed payload check (planPayload.spec.ts) follow. Every line Suggest plan sends must now be the heading, a team with its segments and known fact codes, or a team with no segment.
  - The judge-door evidence test now pins that record to the commit it read (522d88d2), whose line has since changed.
- Source: plan wording review.
- Verified: plan harness spec 15/15; the payload line patterns accept every line of planPrompt for a plan with facts and a team with no segment, and refuse free text and figures; what-ran and judge-door tests pass; typecheck passes.

### test(ai): the same plan state always gives the model the same input
- What: a guard that planPrompt lists each team's facts in one fixed order (FACT_CODES), whatever order a segment's grid features are stored in, so the model's main pick is never moved by a reshuffled list.
- Source: plan wording review.
- Verified: the test passes, and fails when the facts keep their found order instead of FACT_CODES order.

### fix(command): a segment a team reported clearing counts as searched in plan reasons
- What: the engine credits a clear to one segment only (its first known one), and a sound-only clear to none. A clear naming AA and AB therefore left AB with no POD, so a reason could say "AB has not been searched yet" after a team reported searching it. draftFacts now marks a segment searched when its cumulative POD is above 0, or when a stored, unretracted clear names it or was credited to it (reportedSearched). A retraction counts from command or the clear's own author, as in the engine.
- Source: review.
- Verified: new draftFacts tests (a two-segment clear, an uncredited clear, an unnamed clear credited to a segment, retractions by command, by the author and by someone else) failed first, then passed (26 with the fact tests); typecheck passes.

### fix(ai): a searched segment's reason says it is in the top three now, not still
- What: "AD was searched and is still in the top three" could be false: a segment searched while fourth may enter the top three only after a later clue. The sentence is now "AD was searched and is in the top three now."
- Source: review.
- Verified: the changed reasonCodes test failed first, then passed; typecheck passes.

### fix(ai): the distance-band reason names the segment's centre
- What: the band is measured from the last-seen point to the segment's centre, and a 125 m cell can cross a band's edge (a centre 250 m away puts part of the cell 312 m away). "AA is within 0.3 km of the last-seen point" could be false for part of AA. The sentence is now "AA's centre is within 0.3 km of the last-seen point, in the ISRID first 25% distance band".
- Source: review.
- Verified: the changed reasonCodes tests failed first, then passed, including the 200-character fit; typecheck passes.

### fix(command): the newest report is chosen by each phone's corrected clock
- What: the report list orders reports by each phone's clock corrected by its measured offset, but lastReportChange picked "the newest report" by the phone's own time. A report sent at 10:00 from a phone one minute fast could outrank one sent at 10:00:20, so the change banner and a plan reason ("The newest report raised AA") could name the wrong report. lastReportChange now takes the incident's clock offsets per device and the command post passes them; a phone with no measured offset keeps its own time.
- Source: review.
- Verified: a new viewState test (a fast phone's earlier report against a later one) failed first, then passed (13), and with no offsets the order is unchanged; typecheck passes.

### fix(command): the Plan line says code adds a second fact only when the team has one
- What: supportingFact gives no second fact when a team has no other fact, so the line before Suggest plan now says "Code adds a second fact when the team has one and writes every word", matching LIMITS.
- Source: review.
- Verified: plan harness spec 15/15 with the new line; typecheck passes.

### fix(data): an urgent sign-in recheck queued behind a stalled read runs on its own
- What: in watchClaims, an urgent recheck (after a refusal) that arrived while a forced read was running waited for that read to settle. If the read stalled, the recheck never ran until something else asked, so the sign-in line could stay out of date.
  - A timer now runs the waiting recheck once that read counts as stalled (30 seconds after it started).
  - A new sign-in session is never held back by an older session's read. When another account signs in, a waiting recheck runs at once as that account's forced read. At a sign-out it is dropped, since there is no account to read.
  - The timer is cancelled when the read settles first, and at stop.
- Source: issue #336.
- Verified: new watchClaims tests (a stalled read, a read that settles first, stop, another account, a sign-out) failed first where the behaviour changed, then passed (24); typecheck passes.

### fix(ai): each team's reason code comes from a schema that offers only that team's facts
- What: on the live site, Suggest plan's cloud answer was refused every time: gemini-3.5-flash-lite named "highest_poa" for both teams, while only one team had that fact. The list schema let every team name any known code, so every plan fell back to fixed wording on the cloud path.
  - The schema is now one property per team id, each a single code from an enum of only that team's own facts, every team required (planWordingJson with choiceTeams). So a constrained reply cannot name another team's fact.
  - checkChoice reads that object and refuses a missing or extra team, a code the team does not have, a code that is not text, and a team with segments but no fact to choose.
  - The command post and the measurement page ask with each team's codes.
- Source: deployed stills (the cloud path's What ran said "Not used" on every press).
- Verified:
  - new and changed checkChoice, schema and caller tests failed first, then passed (54 in the plan wording suites);
  - 6 runs on Chrome's built-in model: all on device and used, every code a team fact, reasons and summary matching, the main picks as before;
  - typecheck passes; replanWording.ts lines 47 and 232, which the test matrix cites, are unchanged.

### test(e2e): the live suite fails when the cloud path's plan wording always falls back
- What: a deployed check (e2e/planUsed.spec.ts) presses Suggest plan three times with no built-in model, reads the route mark of each suggestion, and requires at least two to be the model's choice, not fixed wording. Each reply that was not used is recorded in the failure and attached to the report. Nothing is approved.
- Source: deployed stills (the cloud path fell back on every press, and no check noticed).
- Verified: against the live site before the schema fix it fails with 0 of 3 used and records the six "highest_poa" picks; after the fix it is run with the live suite.

### fix(ai): the plan's reply schema is closed, and the cloud-path check tolerates a busy drill
- What: from review of the per-team schema.
  - The per-plan schema adds additionalProperties: false, so a constrained reply cannot add a team or any other field; such a reply would have fitted the schema and then been refused.
  - The live cloud-path check now presses Suggest plan again when a suggestion is withdrawn because another check changed the shared drill meanwhile (up to six presses for three suggestions shown).
  - It now counts a press whose request ended before any reply by its route mark, instead of failing the poll.
  - Accepted: a reply with a team named twice is read with its last value, which must still be one of that team's own facts, so nothing untrue is shown.
- Source: review.
- Verified: the changed schema test failed first, then passed (34); against the live site before the fix the check still fails with 0 of 3 used; typecheck passes; the cited lines 47 and 232 are unchanged.

### fix(command): the Details summary keeps its colon beside the label
- What: the rail's Details summary read "DETAILS : 38 °F, wet: no. 11 photos to review." because the summary row's 6 px gap fell between the label and the text that began with the colon. detailsSummaryParts now gives the label with its colon ("Details:") and the rest with its leading space, which the row drops on screen and keeps in the text, so it reads "DETAILS: 38 °F, ...".
- Source: deployed stills, both widths, Chromium and WebKit.
- Verified: new detailsSummaryParts tests failed first, then passed; the summary's whole text is unchanged for screen readers and for the rail-order check; typecheck passes.
### fix(judge): the Measured block no longer says a model words the plan
- What: the judge page's Measured block ended its plan line with "A plan is worded on the laptop only when its browser has Chrome's built-in model." Since plan reasons became fact codes, a model chooses each team's main reason and code writes every word, so that present-tense sentence was untrue. It now reads "A plan uses the laptop's model only when its browser has Chrome's built-in model.", true before and after that change. The counts and their label describe the stored runs and are unchanged.
- Source: deployed stills.
- Verified: the changed measured test failed first, then passed (7); typecheck passes.
### fix(extras): a replay ruler label hung at an edge never runs into its neighbour
- What: on a phone the judge page's replay ruler drew "05:0010:00": the first clock label sat 3 px from the left edge, so it hung inward (start-anchored), and the 48 px spacing that keeps centred labels apart no longer kept it clear of 10:00.
  - The ruler model now gives each label its anchor, hanging a label only where a centred one would be cut off (within half a label's width of an edge).
  - It drops a hung edge label that would come within 6 px of its neighbour; its tick stays.
  - TimeRuler draws the model's anchor.
- Source: deployed stills, 390 px wide, Chromium and WebKit.
- Verified: a new ruler test (a 21-hour drill on a 205 px ruler, plus 230, 390 and 600 px) failed first, then passed (21); the extras harness specs pass (72); typecheck passes.
### test(e2e): the live suite runs every check on the shared test drill one at a time
- What: the live suite ran all its checks side by side on one shared test drill, so one check's report could become another's "newest report". The beat check failed once that way and then passed 3 of 3 alone, so a red run did not always mean a real failure.
  - The suite's config now finds every spec that joins or names the drill (joinCommand, PLS_SMOKE_INCIDENT) and runs those in a "chrome-drill" project with a single worker. The rest stay parallel in "chrome".
  - Both projects keep the harness and extras specs out, which their own configs run.
- Source: deployed stills (a beat check failure during the parallel live run).
- Verified:
  - a new e2eConfig test (each drill spec only in the serial project, each other spec only in the parallel one, no harness or extras spec in either) failed first, then passed;
  - the listing is 100 tests (46 serial, 53 parallel, setup);
  - the whole live suite passed 100 of 100 against the live site in 2.6 minutes (1.2 minutes before);
  - typecheck passes.
### fix(command): a model's receipt and route mark say this device, not this laptop
- What: the receipt shown under a plan, a sighting note, a photo or a debrief sheet read said "Asked for: this laptop first.", "Ran: on this laptop." and "Sent: no text or image left this laptop.", and the route mark said "On this laptop". The same command post opens in a phone's browser, so they now say "this device". Button labels and other lines are unchanged.
- Source: deployed stills (the receipt at phone width).
- Verified: the receipt, What ran and plan wording tests and the harness specs that quote these lines were changed first and failed, then passed (56 unit; harness 241/241); typecheck passes.

### fix(command): the Plan section says in one line what Suggest plan does; What ran says the rest
- What: the three sentences above Suggest plan (which model it asks, what code writes, and what it sends) were proof, not guidance, on the working screen.
  - The Plan section now says only "Suggests which team searches where, with a reason for each team." The paused line is unchanged.
  - What ran now carries the rest:
    - "Asked for: this device's built-in model first, Gemini in the cloud when it has none.";
    - "Sent: N bytes of plan text: team ids, segment codes and fact codes, never a note or a name.";
    - and, when the model's choice was used, "Chose: each team's main reason, from that team's own facts." and "Code added a second fact when the team had one and wrote every word."
  - The deployed payload check reads the sent-data sentence from What ran.
- Source: the product's few-words rule for working screens, from a review of the deployed stills.
- Verified: the changed What ran tests and plan harness checks failed first, then passed (whatRan 4; harness 241/241); typecheck passes.
### feat(command): the cloud consent shows the exact note it sends
- What: the consent box before a cloud note read said "The note goes to Gemini in the cloud. Phone numbers are removed first." It now shows the note exactly as the read will send it, with phone numbers already replaced by "[number removed]", and a count when any were removed ("1 phone number removed."), so the person approves the real text.
  - The shown text comes from consentPreview, which uses the same removePhoneNumbers call the cloud read sends.
  - A "[number removed]" mark the person typed is not counted.
- Source: review of how consent is asked before a cloud read.
- Verified:
  - new unit tests failed first, then passed: the preview equals the text the cloud read sends; the count; no count when nothing was removed;
  - two harness checks failed first, then passed (harness 242/242);
  - the deployed receipt check now also requires the shown text to equal the note in the request body;
  - typecheck passes; stills at 390 and 1440 px.
### docs(ai): the plan wording wait cites the current on-device timings
- What: the comment on WORDING_WAIT_MS justified the 60 s wait with the retired 2026-11-21 wording evidence (19.8 s first run). It now cites the current plan-reason evidence:
  - first wordings 9.3 s and 9.5 s on the M5 Pro Mac, later ones 0.9 to 2.1 s, all on the device as the SDK reported;
  - sources: 2026-11-22-plan-reason-per-team-schema-chrome.json and 2026-11-22-plan-reason-main-pick-chrome.json.
  - It says the 60 s is headroom for a slower laptop's first wording, which was not measured. The value is unchanged.
- Source: review of the comment against the current evidence.
- Verified: each number was read from the evidence files by script; the cited lines 47 and 232 did not move; comment only.

### fix(web): user-facing copy says this device, not this laptop
- What: every user-visible "this laptop" or "the laptop" now says "this device" or "the device", since judges may open the site on any device and the receipts already say device. This covers:
  - buttons ("Get this device ready", "Read on this device", "Use this device's camera");
  - status lines, the debrief sheet read lines, and the printed debrief sheet line;
  - the judge page heading and lines, and the Measured block;
  - the replay's route ("Read on the command post's device", beside "Read on the phone");
  - the public llms.txt.
  Function names, comments and the dev-only measurement pages are unchanged.
- Source: review of the judge-facing wording.
- Verified:
  - every spec and unit test that quotes these strings was changed first and failed (5 unit tests, 22 harness checks), then passed (unit 1438; harness 242/242);
  - three harness status filters that still said laptop were changed too, so they cannot match nothing;
  - typecheck passes; no user-visible "laptop" remains in web/src outside comments, identifiers and dev pages.
### feat(map): the map says when the next new report will play its beat
- What: the map's wrap gets data-beat-armed="true" once the map is ready and has seen a first report.
  - The post passes no report to the map before the server's first answer. The map plays the beat only for a report after the first one it sees, so a report written before then only shows the final map.
  - The mark lets a check wait for the moment a new report will play, instead of guessing with a fixed wait.
  - A first report seen before the map was ready arms it when the map loads.
- Source: the live beat check failing after a plan approval. Measured on the live site: the check wrote its report about 0.7 s after the post drew from its cache, before the server's first answer, and the beat did not play (0 of 3). With a 3 s wait it played 3 of 3.
- Verified: two new change-harness checks failed first, then passed:
  - not armed before the first report; armed after it, which plays nothing; the next report plays;
  - armed once the map has loaded.
  All 9 change checks and typecheck pass.

### test(e2e): the live beat check writes its report only once the post is armed
- What: the beat check waited only for the post to draw, then wrote its report. The post draws at once from the browser's cache, so the report could land before the server's first answer, and then no beat plays, by design.
  - The check failed that way in full runs, every time right after the approve-offline check (whose plan leaves the run's saved cache behind the server).
  - It now waits for data-beat-armed="true" before writing.
- Source: the live beat check, red in two full runs and 3 of 3 short runs.
- Verified: typecheck; the live run is checked after deploy, since the mark ships with this change.

### fix(command): the cloud consent says "Phone numbers removed." with no count
- What: the consent box said "1 phone number removed." or "N phone numbers removed.". The count came from the marks the scrub left, which need not match the numbers typed (a number split across lines leaves two, two numbers joined by a comma leave one), so it now says "Phone numbers removed." with no number, only when something was removed. A mark already in the note, typed plainly or in full-width brackets that the scrub folds to plain ones, no longer reads as a removal.
- Source: review of the consent preview.
- Verified: the unit tests (including a full-width mark) and the harness and live checks were changed first; the unit tests failed, then passed (24); sighting harness 28/28; typecheck passes. The harness's "no hint" check now matches the exact line, so it cannot pass on a case difference.

### fix(extras): the replay says a browser read was "Read at the command post"
- What: the replay's route for a read on the browser's own model said "Read on the command post's device". It now says "Read at the command post", shorter and clear beside "Read on the phone".
- Source: review of the device wording.
- Verified: the replay unit test and extras check were changed first; the unit test failed, then passed (55); extras replay 18/18.

### fix(judge): the Measured block says iPhone report reads ran "on the phone"
- What: the Measured block's Report reads line said "N on the device, in our own iPhone test runs", and its empty line said "On the device: none stored yet. An iPhone's practice drill ...". On the same page, "the device" now means the viewer's own (the Plan wording line, "Get this device ready"), so the iPhone line says "on the phone" and its empty line "On the phone: none stored yet.". "Device" keeps one meaning on the page.
- Source: review of the device wording.
- Verified: the two Measured tests were changed first and failed, then passed (7); web unit; typecheck.

### test(harness): a page that checks the photo read for invented text
- What: a dev-server-only measurement page, `web/harness/photo-invention.html` (`src/harness/photoInvention.tsx`), draws eight synthetic scenes (four with known sign text, four with none, one a blank sign board), reads each twice with `readPhotoOnDevice` and `photoGenerator` (the same path as CommandPost's `readPhotoHere`) on a bare Firebase app, and reports per read the model's reply, the cues `cleanCues` kept, the sign-text words the drawing never showed and how much of the true sign text was read (`src/harness/photoTruth.ts`), plus every request to a Google or Firebase host. No product change.
- Source: review of the photo read (its timing had been measured, invented text had not).
- Verified: `src/harness/photoTruth.test.ts` (3 tests) failed first (module missing), then passed; the dev-page cloud scan passes on the new page; web unit 1441; typecheck; gates; hygiene.

### test(evidence): the photo read invented no sign text on eight synthetic scenes
- What: `docs/evidence/web/2026-11-22-photo-read-invention-chrome.json`, from the photo-invention page in desktop Chrome 157 on this Mac (built-in model, on device only): 16 reads, 0 sign-text words the drawing did not show; all sign words read on 8 of 8 text reads; empty sign text on 8 of 8 no-text reads, the blank sign board included; 2 of 33 landmarks named something not drawn (Road, Parking lot), both on the first pass; all 16 on device, no Google or Firebase request. `cleanCues` kept the place name only when the sign text showed it; all 8 model place names were in the sign text, so it dropped none here. n = 16 on synthetic drawings, one machine, so not an accuracy rate.
- Source: review of the photo read (its timing had been measured, invented text had not).
- Verified: run in desktop Chrome on this Mac; per-read sign-text words checked by `photoTruth.ts`; landmarks judged by hand against each scene's drawn list; the place-name rule's edge cases checked by a one-off probe against `cleanCues` (not committed).

### fix(ai): a photo's place name is kept only as whole words of its sign text
- What: `cleanCues` kept a place name when the sign text contained it as a substring of upper-cased letters and digits, so "Park" survived on a sign reading "SPARKS RD", "Caf" on "CAFÉ ROUGE", and a name with no letter or digit ("!!!") was always kept. Now the name's words (runs of letters, marks and digits after NFKC, upper-cased) must appear in the sign text as whole words, in the same order; a name with no such word is dropped. Applies to on-device and consented cloud reads alike, since both pass through `cleanCues`.
- Source: review of the photo read invention measurement (2026-11-22-photo-read-invention-chrome.json, code check).
- Verified: two new cleanCues tests (whole words in order, case ignored, accented words kept whole; a name with no letter or digit dropped) failed first, then passed (18); web unit; typecheck; gates; hygiene.

### fix(ai): a sign text cut at its limit never offers a partial word as a whole one
- What: `cleanCues` cuts sign text at 80 UTF-16 code units. A cut inside a word left its first part looking like a whole word, so "River Park" was kept from a sign reading "... RIVER PARKS" past the limit; a cut inside a surrogate pair did the same. The sign's words are now found in the uncut text, and only words that end inside the kept text count. A place name longer than its 60-unit limit is dropped instead of kept cut.
- Source: review (second-model pass on the whole-word place name rule).
- Verified: the new cleanCues test (a cut inside a word, inside a combining sequence and inside a surrogate pair; a word ending exactly at the cut kept; an over-long name dropped) failed first, then passed (19); web unit; typecheck; gates; hygiene.

### fix(ai): a place name's words fold the same on both sides, digits only
- What: `cleanCues` place-name words now run NFKC again after upper-casing, so a letter with no precomposed capital (Greek "Μαΐου") folds the same in the name and on the sign; and a word is letters, marks and decimal digits only, so a lone number symbol such as the Ethiopic ten is not a word and a name made only of one is dropped. A new case checks that the name's words must be next to each other on the sign ("CEDAR COUNTY LAKE" does not keep "Cedar Lake").
- Source: review (second-model pass on the whole-word place name rule, low findings).
- Verified: the Greek case failed first (the number-symbol case was shown kept by the review's run of the earlier code), then all passed (19); web unit; typecheck; gates; hygiene.

### fix(ai): find a cut sign's whole words after folding, not before
- What: the cut-word check found word spans in the raw sign text, but NFKC turns some symbols into letters or digits ("№" to "No", "Ⓐ" to "A", "🄰" to "A"), so the spans disagreed with the folded words: "7 Coffee" was kept from "№7 COFFEE", "North Plaza" from "NORTH Ⓐ PLAZA", and a cut inside "🄰" still left "PARK". Now the kept text and the uncut text fold the same way, and the kept text's last word is dropped only when it differs from the uncut text's word in that place. The combining-mark test now cuts between the letter and its accent, as it meant to.
- Source: review (second-model pass on the cut-word fix).
- Verified: the new cases (number sign, circled letter, a cut inside a squared letter, a word ending exactly before a parenthesized digit) failed first, then passed (19); web unit; typecheck; gates; hygiene.

### test(harness): score a note read against the fields its note states
- What: `src/harness/noteScore.ts`, `scoreNote`: a stated direction or colour is right only on its exact value; stated footwear or a carried item is right ignoring case, outer spaces and a leading article; a field the note does not state counts as filled when the reading gives anything but "unknown" or an empty string; a skipped field counts neither way; a refused read misses every stated field and fills nothing. No product change.
- Source: review (the note-read measurement had no note that describes nobody, and did not score footwear or carried).
- Verified: `src/harness/noteScore.test.ts` (5 tests) failed first (module missing), then passed; web unit; typecheck.

### test(harness): add notes that describe nobody to the note-read page
- What: `web/harness/note-measure.html` (`src/harness/noteMeasure.tsx`) now reads eight made-up notes twice in one newly opened page: the five that describe a person, now also stating footwear and the carried item where the note says them ("with a small dog" scored neither way), and three that describe nobody ("Checked the pavilion, nothing seen.", "Radio check, all teams moving.", "Team two finished the north trail, no sign of anyone."), where every field should come back "unknown" or empty. Each read keeps the model's raw reply beside what the code kept and its `scoreNote` score. Same app code path; no product change.
- Source: review (the note-read measurement had no case where there is nothing to find).
- Verified: the dev-page cloud scan passes on the page; web unit 1449; typecheck; gates; hygiene; run in desktop Chrome on this Mac (next entry).

### test(evidence): note reads with notes that describe nobody, on Chrome's model
- What: `docs/evidence/web/2026-11-22-note-read-chrome.json`, from the note-read page in desktop Chrome 157 on this Mac (built-in model, on device only): 16 reads of eight made-up notes. The five that describe a person: 36 of 36 stated fields right (direction and colours 30 of 30, footwear and carried 6 of 6; "grey" read as gray both times), 0 of 12 unstated fields filled. The three that describe nobody: 28 of 30 fields unknown or empty; "Team two finished the north trail, no sign of anyone." came back with direction north both times, which the code keeps because the note says "north", and which the sighting form shows as a suggestion for Command to check. All 16 on device, no Google or Firebase request; first read 14,011 ms, then 1,735 to 2,882 ms. n = 16 on made-up notes, one machine, so not an accuracy rate. The 2026-11-21 file stays as its own record.
- Source: review (the note-read measurement had no case where there is nothing to find).
- Verified: run in desktop Chrome on this Mac; every score from `noteScore.ts`; the page checked that the code changed only "unknown" free text to empty and that every evidence quote is in its note.

### feat(telemetry): crash reports that carry no message text, loaded on the first error
- What: `web/src/telemetry/errorReport.ts`. `safeErrorReport(reason, origin)` keeps an uncaught error's name, its Firebase code (`firestore/not-found`, `AI/fetch-error`) and HTTP status when present, and the stack frames whose address is on this site (query and fragment removed); the message is always replaced with "message removed", because a third-party message can quote drill text (a JSON parse error quotes its input, a Firestore error quotes a document path). A thrown non-error is reported by its type only. `startErrorReports(deps)` listens for `error` and `unhandledrejection`, loads the Crashlytics SDK only on the first error (a visit with no error sends and downloads nothing), starts it with `captureUnhandledErrors: false` so only these cleaned reports are sent, never starts Firebase itself, and sends at most five distinct reports a page. Not wired into the page yet.
- Source: plan (Crashlytics for the web command post; no user text in a report).
- Verified: `src/telemetry/errorReport.test.ts` (14 tests: a two-line message of user text and a phone number never appears; a message line shaped like a frame from another origin is dropped; Firefox and Safari frames; a join code in a frame's query is removed; code and status kept; odd names and codes dropped; non-error values; frame cap; lazy load; rejections; dedupe and the five-report cap; cross-origin script errors skipped; nothing before Firebase starts; a failed load does not throw and is retried; stop) failed first (module missing), then passed; typecheck.

### fix(telemetry): a crash report cuts the whole message before reading frames
- What: `safeErrorReport` kept any stack line shaped like a frame on this site, so a message whose last line looked like one (`    at x (https://<this site>/a.js:1:2)` or `name@https://<this site>/a.js:1:2`) would have been sent. A V8 stack now has its "Name: message" header cut first (by the exact header, or by the message's line count when the message changed after the stack was taken), only V8 frames are read from a V8 stack and only Firefox or Safari frames from the others, and a frame's function name must look like code (`[\w$.<>[\]]`, Safari's `global code`, `module code`, `eval code`).
- Source: review (automated security review of the previous commit).
- Verified: two new tests in `src/telemetry/errorReport.test.ts` (a frame-shaped message line in either shape, also after the message changed; a Firefox frame whose name is prose) failed first, then all 16 passed; typecheck.

### build(web): the bundle names the same commit as /version.json
- What: `versionFilePlugin` reads the commit once and uses it twice: in `dist/version.json` as before, and as the build constant `__PLS_COMMIT__` (declared in `src/buildinfo/commit.d.ts`, absent in dev and tests). A crash report can then carry the release `/version.json` names. A build without a full SHA now fails before bundling instead of after.
- Source: plan (Crashlytics for the web command post; report version = the served build id).
- Verified: two new tests in `src/buildinfo/versionFile.test.ts` (the define and version.json carry one commit read once; a short SHA fails at config time) failed first, then all 5 passed; typecheck.

### feat(web): uncaught errors on the command post go to Crashlytics, without their message
- What: `web/src/telemetry/crashReports.ts` wires `startErrorReports` to the window, the page origin, the default Firebase app (once started) and a lazy `import("firebase/crashlytics")`, with `__PLS_COMMIT__` as the app version; `main.tsx` starts it before the first render. The SDK is a separate 49 kB chunk (15.5 kB gzip); the main bundle grew 2.7 kB. Nothing is reported to the console until `firebase crashlytics:setup` runs for the web app.
- Source: plan (Crashlytics for the web command post).
- Verified: `src/telemetry/crashReports.test.ts` (3 tests: the default app only once started, the SDK's two calls load on demand, no version outside a build) failed first (module missing), then passed; typecheck; build (the main bundle carries the commit `version.json` names; `clienttelemetry` appears only in the lazy chunk). Local build in Chrome with every Google host blocked except reCAPTCHA and the telemetry endpoint answered locally: no telemetry request and no SDK chunk before an error; after a thrown error and a rejected FirebaseError, each carrying made-up drill text and a phone number, one request to `clienttelemetry.googleapis.com/v1/logs` holding 0 of the planted strings, bodies "message removed" and "message removed; code firestore/not-found", `app.build_id` the commit, a session and an installation id; a TypeError thrown from a same-site script kept its frames (`readSighting`, `planSearch`) and lost its message.

### build(web): no served file names a source map
- What: `build.sourcemap` is `"hidden"` (maps are still written to `web/dist/assets`, for the Crashlytics upload, but no chunk ends with a `sourceMappingURL` comment), the service worker build has `sourcemap: false` (no `sw.js.map` or workbox map), and `src/buildinfo/mapComments.ts` removes the comment the MapLibre worker keeps when it is copied in as-is. Before: 13 built files named a map and every map was served. The predeploy upload with `--clean` and a hosting ignore for `**/*.map` land separately; until both are in, maps would still be deployed, so the deploy waits for them.
- Source: plan (Crashlytics source maps; no map served).
- Verified: `src/buildinfo/mapComments.test.ts` (2 tests: the comment goes from a copied script given as text or bytes; chunks, CSS and scripts without one are untouched) failed first (module missing), then passed; typecheck; build: 0 files in `web/dist` outside the maps contain `sourceMappingURL`, 10 maps written, no `sw.js.map`.

### docs(privacy): say what the command post website's error reports hold
- What: `web/legal/privacy-policy.md` and `web/privacy.html` gain a section, "The command post website", with one entry, "Error reports". It lists what a report holds: the kind of error, where in the code, a Firebase error code or HTTP status, the website's version, the browser's user-agent string, and random session and installation numbers. It says the message is removed in the browser, so no report, note, photo, clip or join code text and no account number is sent, and that a visit with no such error sends no report. The intro gains one sentence pointing to the section, the date is November 23, 2026, and the iPhone text is unchanged. `web/support.html` gains one sentence saying the same in short. How long reports are kept is added once the project's telemetry setup shows its log retention.
- Source: plan (Crashlytics for the web command post; the privacy and support pages updated in the same change).
- Verified: in `src/legalPages.test.ts` the support page's exact text and a new test failed first, then all 6 passed. The new test ties the section's words to the code that sends the reports: the message is always replaced, only the code and the status are added to it, `captureUnhandledErrors: false`, no custom keys, user id or breadcrumbs, and the SDK only imported lazily. Each claim was checked against a request captured from a local build: its body held the type, frames, code, `app.build_id`, `session.id` and `app.installation.id`, and the headers held the user agent.

### docs(privacy): an error report holds none of your text, photos, clips or join codes
- What: the policy's "Error reports" entry (`web/legal/privacy-policy.md`, `web/privacy.html`) said a report "holds no report, note, photo, clip or join code text", which repeats "report" and calls a photo text. It now says "an error report holds none of your text, photos, clips or join codes, and no account number". The rest of the entry, the intro sentence and the support sentence are unchanged.
- Source: review (wording review of the privacy section before merge).
- Verified: `src/legalPages.test.ts` pinned to the new sentence failed first, then all 6 passed; the old phrase is in neither page.

### docs(privacy): the website's error reports are kept for 30 days
- What: the "Error reports" entry in `web/legal/privacy-policy.md` and `web/privacy.html` ends with "Error reports are kept for 30 days."
- Source: plan (the retention line waited for the project's telemetry setup).
- Verified: the telemetry config the setup wrote for the web app (Firebase Telemetry Admin API, `configs/1-593239421521-web-5aeaabe9c07bf3db587e70`) names `logBucket` `_Default`, and `gcloud logging buckets describe _Default` reads `retentionDays` 30. `src/legalPages.test.ts`, pinned to the new sentence, failed first, then all 6 passed.

### fix(ai): a failed clip read carries the HTTP status of a refused call
- What: `readClip` (`src/ai/clipRead.ts`) now returns `{ kind: "failed", recorded, status }` when the SDK error carries `customErrorData.status` (401 or 403 from App Check, 429 over quota), read the same way the plan wording does. Only the number leaves the function; no error text reaches the page. A failure with no status returns the old shape. The `recorded` flag and the retry rule (no consent renewal, no second upload) are unchanged.
- Source: review (a refused clip read and a network failure looked the same to the clip form).
- Verified: `src/ai/clipRead.test.ts`: two new tests (403 and 401; 429) failed first, then passed, each also asserting `recorded: true`; a third asserts no `status` on a plain failure; 43 of 43.

### fix(camera): the clip form names why a refused read failed
- What: `clipOutcomeMessage` (`src/camera/ClipIntake.tsx`) reads the failed read's `status`. 401 or 403: "Cloud step refused by App Check. Try a normal browser window." 429: "The cloud is busy right now. Try again in a minute." Any other failure keeps "The clip was not read. Try again." The retry rule is unchanged: a retry never renews consent and never uploads again.
- Source: review ("Try again" was the wrong next step when App Check refused the call or the quota ran out).
- Verified: `src/camera/clipIntake.test.ts`: the 401/403 and 429 tests failed first, then passed; a third keeps the try-again line for status 500; 5 of 5.

### fix(camera): the clip's cloud consent names that the clip is stored with the search
- What: the clip form's cloud consent read "Cloud reading (the clip goes to Gemini)", but the same press first uploads the clip to the search's storage (`ai/clipRead.ts`, `deps.upload`), where it stays until command deletes it or the bucket lifecycle rule deletes it at 30 days (`storage.lifecycle.json`, prefix `clips/`). It now reads "Cloud reading (the clip is stored with this search for up to 30 days and read by Gemini)", kept as `CLOUD_CONSENT_LABEL` in `camera/ClipIntake.tsx`. The consent record stores only who gave each consent and when (`{byUid, atMs}`, `firestore.rules` exact keys), never the label text or a version, so records written under the old words read the same.
- Source: review (the clip consent named the model but not the storage).
- Verified: `src/camera/clipIntake.test.ts` (the exact words) failed first (constant missing), then passed; `e2e/harness/clip.spec.ts` now ticks the consent by its full label with exact matching and passes; scripts/ci-local.sh --gates --web exit 0 (web unit 1450, harness 244); hygiene guard --public ok.

### fix(camera): the clip card's receipt says the clip stays stored with the search
- What: the camera sighting card's "What ran" receipt now ends with "Stored: the clip, with this search, until command deletes it or for 30 days." (`CLIP_STORED_LINE` in `camera/SightingCard.tsx`), so the receipt states the same storage the clip form's cloud consent names. It shows on a cached reading too, since the clip stored at the first read is the one that reading came from.
- Source: review (the clip consent named the model but not the storage; this is the matching receipt line).
- Verified: `src/camera/sightingCard.test.ts` (the exact words) failed first (constant missing), then passed; `e2e/harness/clip.spec.ts` checks the line in the opened receipt and passes; scripts/ci-local.sh --gates --web exit 0 (web unit 1451, harness 244); hygiene guard --public ok.

### docs(evidence): screenshot of an on-device note read on the deployed site with DevTools Offline
- What: `docs/evidence/web/2026-11-26-note-read-offline-devtools.jpg`, one window capture of the deployed command post (commit 5d59d16d, `drill-test-1`, signed in as command) beside DevTools set to Offline, every listed request "(failed)", and the receipt "Ran: on this device (reported by the SDK)." with "Sent: no text or image left this device."; `2026-11-26-note-read-offline-devtools.json` records the four reads (the same four fields each time), every request in the saved windows (none to an AI host; one CORS preflight to Remote Config's realtime host after read 2, which DevTools' Offline setting does not stop) and the screenshot's SHA-256; the evidence README describes both.
- Source: review (the 2026-11-21 offline record was a JSON log whose screenshot did not show the network was off).
- Verified: Chrome 158.0.8127.38 in an isolated profile with the built-in model (2025.8.8.1141) on the live site; a same-origin `/version.json` fetch failed 1 to 2 ms before each click; the DevTools request logs were saved after reads 1, 2 and 4 and checked for AI hosts (0); the screenshot's DevTools list matches read 4's first 6 requests; the SHA-256 in the JSON and README matches the committed file.

### feat(extras): freeze the clip time machine's shared types
- What: `extras/timemachine/types.ts`, the contract the track math, the clock, the 3D view and the cloud track read are built against: `Box2d` ([yMin, xMin, yMax, xMax] on 0 to 1000), `TrackEntry` (whole second, box, `source: 'cloud' | 'on_device'`), `Track` (`track-v1`, window, entries), `TRACK_RULES` (link IoU 0.3, gaps of 2 s bridged, 1 s agreement, 0.5 s hold), the track math signatures (`Iou`, `LinkTrack`, `BoxAt`, `FootPoint`, `TrackSpan`, `SpanAgrees`), the shared clock (`ClockSource` 'video' | 'scene' | 'tween', `TimeClock`, `CreateClock`, `BindVideo`), `TimeMachineResult` and `TimeMachineProps`. Types and fixed numbers only; nothing imports it yet.
- Source: the clip time machine plan (a shared contract written before the parts that use it).
- Verified: `src/extras/timemachine/types.test.ts` (the plan's numbers and a sample track, tick and result row) failed first (module missing), then passed; the extras import guard passes; scripts/ci-local.sh --gates --web exit 0.

### chore(web): add three and @react-three/fiber for the clip time machine
- What: `three` 0.187.0 and `@react-three/fiber` 9.8.2 as dependencies and `@types/three` 0.187.0 as a dev dependency, all exact pins; 15 packages added to the lockfile. Nothing imports them yet: the time machine view will load them by dynamic import and keep their chunk out of the offline precache.
- Source: the clip time machine plan (three plus react-three-fiber 9 on React 19.3.1, no drei).
- Verified: Socket scores for the three packages and every package they add: supply chain 97 or higher, vulnerability 100, license 100; the 4 moderate npm audit findings are the existing vite-plugin-pwa / workbox-build / glob chain, none from these packages. Measured chunk (esbuild, minified, React left out) for the parts the view will use: three plus fiber 938,069 bytes (249,948 gzip); three alone 550,482 (136,569 gzip). scripts/ci-local.sh --gates --web exit 0.
