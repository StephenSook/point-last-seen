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

### feat(sightings): show each sighting's decision, missing place and out-of-area state
- What: `sightingCards` lists each sighting once (newest seen first) with its status: awaiting, confirmed or rejected. Decisions follow the engine's order (a command decision outranks a family one; the latest within a role wins; a searcher's confirmation is ignored). Retracted sightings drop out. A card says when the sighting has no place yet and when it fell outside the search area.
- Source: plan Task 36 (confirm and reject at command; the out-of-area banner), lane D's family sightings that arrive with no place.
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
- Source: orchestrator (merge main when lane A's engine framing lands, then re-run the tests).
- Verified: `scripts/ci-local.sh` exit 0 on the merged tree (engine 155, vectors 134, rules and joinIncident 63 in the emulators on this worktree's ports); web typecheck exit 0 and 153 unit tests pass, including the sighting tests that compare ids with the engine's `eventId`.

### fix(web): stop parsing clip_model until the clip read exists
- What: `rc.ts` no longer parses `clip_model` (wired-or-cut: no web code read it). The clip read is Task 18; it brings the key back together with a test that the value picks the clip model.
- Source: orchestrator self-audit sweep (5 of 8 parsed Remote Config values had no reader).
- Verified: `src/config/rc.test.ts` changed first to expect no `clip_model` (2 tests failed), then passed after the removal; `grep -c clip web/src/config/rc.ts` is 0.

### fix(web): stop parsing token_budget_fraction, which only the iOS router uses
- What: `rc.ts` no longer parses `token_budget_fraction` (wired-or-cut: the web has no router that budgets tokens; the iOS router reads it). The key stays in the Remote Config template for iOS.
- Source: orchestrator self-audit sweep.
- Verified: `src/config/rc.test.ts` changed first to expect no `token_budget_fraction` (2 tests failed), then passed after the removal.

### fix(web): stop parsing replan_use_tools; web plan wording calls no tools
- What: `rc.ts` no longer parses `replan_use_tools` (wired-or-cut: `wordPlan` sends the engine's table in the prompt and declares no tools). If cloud function calling (cut rank X3 extras) is ever built, it brings the key back with a test.
- Source: orchestrator self-audit sweep.
- Verified: `src/config/rc.test.ts` changed first to expect no `replan_use_tools` (2 tests failed), then passed after the removal.

### fix(web): stop parsing the judge-door keys, which the server reads
- What: `rc.ts` no longer parses `judge_seed_run_id` and `judge_sessions_per_day` (wired-or-cut: the `startJudgeSession` function reads them; no web code did). The unused number helper and an emptied range test went with them, so no test asserts nothing.
- Source: orchestrator self-audit sweep.
- Verified: `src/config/rc.test.ts` changed first to expect neither key (2 tests failed), then passed after the removal; 10 of 10.

### test(web): require every parsed Remote Config value to have a reader in web code
- What: the web sets in-app defaults only for the three keys it reads (`cloud_model_web`, `kill_cloud`, `use_limited_use_tokens`); the other platforms' keys stay in the shared template. A new test scans every non-test source file under web/src (more than 10 files, so an empty scan cannot pass) and fails when a parsed value has no `rc.<field>` reader.
- Source: orchestrator self-audit sweep ("every template key is parsed and used", applied to the web's own parser).
- Verified: the defaults test failed first (7 keys, wanted 3) and passes now; the reader guard was proved against a planted value `neverReadControl`, which failed it with "rc.neverReadControl", then the plant was removed (0 matches left).

### chore(merge): bring main into lane-web (the web CI job, per-worktree emulator temp folders, rules fixes)
- What: merges origin/main, which adds `.github/workflows/web.yml` (typecheck, unit tests and a placeholder-config build on every push that touches web/) and runs the web checks in `scripts/ci-local.sh`, plus emulator isolation per worktree and rules fixes.
- Source: orchestrator (the web unit tests, typecheck and build belong in CI today).
- Verified: `scripts/ci-local.sh` exit 0 on the merged tree, now including the web step (20 test files, 157 tests, build ok), rules 71 in the emulators.

### feat(photos): read a family photo on this laptop only, behind the private-data gate
- What: `photoCues.ts`. `readPhotoOnDevice` asks the gate with `PHOTO_OPTS` (English text and image in, English text out: the same object the photo model is created with) and makes no SDK call when the answer is no, the check throws, or the browser's model reads text only; it keeps a reply only when the SDK reports `on_device` (a cloud or missing source is refused); a slow reply is given up after a timeout without a second call or any cancel of a running model download. `cleanCues` checks the closed lists of `photo-cues.schema.json`, caps landmarks at three, and keeps a place name only when the sign text shows it. `readPhotoInCloud` throws without a consent record for that photo, refuses while `kill_cloud` is on, makes one cloud call and keeps only an `in_cloud` result.
- Source: plan Task 20 (cut rank X11; S4 step 2 gave GO on the Gemma profile), rival self-audit addendum (no inferenceSource is refused; a reply timeout separate from the download), Codex privacy finding 6 (both boundaries tested at the unit level; the deployed one-request control follows with privacy.spec).
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
- Source: rival self-audit addendum, Task 20 ("if the installed @firebase/ai type files expose a base URL, build the private ONLY_ON_DEVICE instances with an unreachable address"). Grep result: `RequestOptions.baseUrl` exists (ai-public.d.ts line 2431), and the model's request options reach the cloud request URL (dist lines 1489 and 3345 to 3349).
- Verified: the `PRIVATE_REQUEST_OPTIONS` test failed first (not exported), then passed; a mapping test covers `photoGeneratorFor` (written with the builder, not before it). Live, on the spike page with LanguageModel deleted and NO gate: the fallback request went to on-device-only.invalid and failed with `net::ERR_NAME_NOT_RESOLVED`; zero requests reached firebasevertexai.googleapis.com.

### docs(evidence): record the unreachable base URL check in spike S4
- What: a section in `docs/evidence/spikes/S4.md`: with LanguageModel deleted and no gate, the SDK's fallback request for a model built with the unreachable base URL failed with `net::ERR_NAME_NOT_RESOLVED`, and nothing reached firebasevertexai.
- Source: rival self-audit addendum, Task 20 (record the base-URL result).
- Verified: CDP Network log of the run (raw file `~/dev/pls-spikes/s4/r14-nolm-invalid-base.json`, kept outside the repo); rules gate ok.

### feat(photos): hash, store and list family photos through the Storage SDK
- What: `photos.ts`: `sha256Hex`; `photoPath` (only a 64-character hash can name a photo, so no other text can become a path); `photoReadingDoc` (hash, path, cues, route, the family's yes, no or not-sure, and `expiresAt` 30 days on for the TTL policy); `bytesToBase64` in chunks; `loadPhotos` lists `photos/{incident}/` and reads each object with `getBytes` (2 MB cap), so Storage rules apply and no download URL exists; `uploadPhoto` skips an object that already exists, because photos are create-only and named by content; `savePhotoReading` writes `photoReadings/{sha256}` (command only).
- Source: plan Task 20, spec section 7 (`photoReadings`, the 30-day expiry), orchestrator security rule (never `getDownloadURL`), lane A's create-only photo paths (63a65bb).
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
- Source: lane A's Task 35a, which Task 35c builds on.
- Verified: `scripts/ci-local.sh` exit 0 on the merged tree; web typecheck and unit tests pass.

### feat(profile): split the subject profile into the shared and command documents at the command post
- What: `profile.ts`: `emptyProfile` (mayNotRespond on, every other flag off); `profileDocs` uses the engine's `profileForSearchers` (exactly the 20 keys the rules allow; dementia type only with the family's consent) and `profileForCommand` (history, places, water, vehicle); `profileFromDocs` reads both back into the form, with the family-only fields left empty; `approachLines` turns the shared document's note ids into the card's lines from `approach-notes.json` (family text and language filled into their templates, an id without copy skipped, seven lines first and the rest under More) plus the footer; `commandWarnings` shows only the photo-age warning, because the profile update date never leaves the family phone; `writeProfile` and `subscribeProfile` for `profile/shared` and `profile/command`.
- Source: plan Task 35c, spec 13.2 and 13.3, lane A's 35a and the rules allowlist (3feb2a7).
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
- Source: plan Task 35c step 3, spec 13.2 ("Add as a place to check" creates a destination event), lane A's `placeToCheck` contract.
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
- Source: found on the live site: the bucket's missing CORS rule made every photo read fail, and the tray quietly showed an empty list (a silent failure). The CORS rule itself is lane A's root config and was handed over.
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
- Source: UI review D1 (orchestrator P0 item 1).
- Verified: new `e2e/layout.spec.ts` at 390x844 failed first (map height 0), then passed (map over 300 px, both rails below it, no sideways scroll); the smoke suite still passes; still taken at 390 px shows the map at the top. scripts/ci-local.sh exit 0.

### fix(web): keep the match code on one line in the phone header
- What: at 390 px the header squeezed the convergence code until each character wrapped onto its own line. The code block no longer shrinks or wraps.
- Source: still of the joined post at 390x844 taken while fixing UI review D1.
- Verified: new layout test "the match code stays on one line in the header" failed first (56 px tall), then passed (under 40 px); the map layout test still passes. scripts/ci-local.sh exit 0.

### fix(map): credit OpenStreetMap only while OSM-derived data is drawn
- What: `map/credit.ts` `mapCredit` returns "Map data from OpenStreetMap" only when segments from the search grid (built from an OpenStreetMap extract by tools/grid-builder, which stamps every grid with the ODbL attribution) or a basemap are on screen. `MapView` shows the line from it; an empty map shows no credit. No basemap is drawn yet, so today the segments decide.
- Source: UI review D4 (orchestrator P0 item 2): the credit sat on an empty map with no OpenStreetMap layer.
- Verified: `src/map/credit.test.ts` (3 tests) failed first (module missing), then passed. The joined smoke now asserts the credit appears exactly when segments are drawn: it failed against the live site (credit over an empty map), then passed against the local preview. scripts/ci-local.sh exit 0.

### fix(judge): start the model download from the judge button, never point at a missing replay
- What: `getLaptopReady` in `ai/deviceModel.ts` reads the state, and when Chrome can download the model it starts the download from the click with whole percents, then reads the state again; a failed download is reported. The judge page's "Get this laptop ready" now uses it and shows "Downloading the model: N%" (Firebase starts only at that point, not on page load). `d2Copy` takes `{ replay, downloadFailed }`: with no built-in model the line ends at "Nothing private was sent." unless the replay is live (it is not built yet), and a failed download says "This browser could not download its built-in model. Nothing private was sent." instead of looping back to "Press Get this laptop ready".
- Source: UI review D9 (orchestrator P0 item 3).
- Verified: 3 new `getLaptopReady` tests and 2 new `d2Copy` tests failed first, then passed (19 of 19 in the two files). The judge e2e now asserts the exact no-model line and no "replay above" text: it failed against the live site, then passed against the local preview, still with zero AI-host requests. scripts/ci-local.sh exit 0.

### fix(web): give text fields a 3:1 edge with fg-4 borders
- What: join, sighting and profile fields drew their edge in the line colour (1.60:1 on bg-1, 1.45:1 on bg-2). They now use fg-4 (4.79:1 and 4.33:1), meeting WCAG 1.4.11's 3:1 for component boundaries.
- Source: UI review D6 (orchestrator P0 item 4).
- Verified: new `e2e/contrast.spec.ts` measures each field's computed border against the surface behind it; it failed first (1.6 on the join form, 1.45 in the sighting form), then passed. scripts/ci-local.sh exit 0.

### fix(photos): show keyboard focus on the Add photos button
- What: the file input under "Add photos" is invisible (opacity 0), so its focus ring was too. The label now draws the 2 px fg-1 outline while the input has keyboard focus (`:has(input:focus-visible)`), matching every other control.
- Source: UI review D7 (orchestrator P0 item 4).
- Verified: new `e2e/focus.spec.ts` tabs from "Get this laptop ready" onto the input and reads the label's outline; it failed first (outline none), then passed. scripts/ci-local.sh exit 0.

### feat(map): add the centre dot second signal and cased segment edges
- What: each segment centre gets a dot whose radius is 3 + 11 x sqrt(poa / maxPoa) px (spec 22.1 second signal), in fg-2 with a bg-0 ring so it is 3:1 or more against every probability step; the printed percent now hangs just below the dot. Segment edges are a 3 px bg-0 casing under a 1 px fg-4 line instead of one line-colour stroke (1.25:1 on the darkest step). `contrastRatio`, `MAP_INK` and `centreFeatures` live in `map/poaStyle.ts`.
- Source: UI review D5 (orchestrator P0 item 4), spec 22.1 "Second signal". Ruling: the spec gives the dot's radius but not its colour; fg-2 with a bg-0 ring is the only token pair that clears 3:1 on all eight steps.
- Verified: 4 new tests in `src/map/poaStyle.test.ts` failed first (not functions), then passed: the contrast helper reproduces the spec table (fg-4 on bg-0 5.23), radii 14, 8.5 and 3 for the sample, every dot 3:1 or more on every step, the edge inks. The map harness spec (next commit) reads the dot colour at each centre. scripts/ci-local.sh exit 0.

### test(map): add a dev-only map harness that checks the dot at each centre by pixel
- What: `web/harness/map.html` (served only by the Vite dev server; the production build's only entry is index.html) draws `MapView` over a synthetic 6 x 4 grid labelled "Synthetic test grid, not drill data." `e2e/harness.config.ts` runs `e2e/harness/*.spec.ts` against it; the main e2e config now ignores that folder. `e2e/harness/map.spec.ts` reads screen pixels (a 1 x 1 PNG decoded with node:zlib, no image library) and asserts the dot colour sits at each centre with its percent below it. Map visuals (and later the REPORT beat) can now be checked without seeded drill segments.
- Source: UI review D5 follow-up; drill-dev-1 has no segments yet, so the live site cannot show the map layers.
- Verified: the spec passed with the new MapView and failed with the previous one (`#E5B066`, the fill, at the centre); `grep` finds "Synthetic test grid" in no file of `web/dist`. scripts/ci-local.sh exit 0.

### feat(sighting): place a sighting from the keyboard with a Place list of segments
- What: the sighting form has a labelled "Place" select listing every segment (`segmentChoices` in `map/geo.ts`, sorted by id). Choosing one puts the sighting at that segment's centre, the same point a map click there gives, and the status line reads "Place: segment AB." A map click still works and the list follows it ("Outside the search area" when the click is off the grid). New dev-only harness `web/harness/sighting.html` renders the form over the synthetic grid without Firebase; the map harness now renders only on its own page so its grid can be shared.
- Source: UI review D8 (orchestrator P0 item 4): only a map click could place a sighting; section 22 asks for full keyboard use at the command post.
- Verified: new `segmentChoices` test failed first, then passed. New harness spec tabs from "Seen at" to Place, chooses AB, saves with Enter and checks the saved position is AB's centre: it passed with the new form and failed with the previous one (no Place control). Typecheck clean. scripts/ci-local.sh exit 0.

### fix(map): show the grid's own attribution line and make the joined smoke require segments
- What: the incident's `gridAttribution` (the license line tools/grid-builder stamps, "Map data from OpenStreetMap contributors (ODbL)") is read with the incident and shown as the map credit whenever its segments draw; the fixed "Map data from OpenStreetMap" stays only as the fallback. The joined smoke now requires the drill's segments and plates to draw before it checks the credit.
- Source: lane A seeded drill-dev-1 with a 67-segment grid and asked that the stamped attribution show wherever the map draws. The earlier smoke check could pass before segments loaded (an empty map with no credit is consistent), so it passed against the old build; it is no longer vacuous.
- Verified: new `mapCredit` test failed first, then passed (4 of 4). The new smoke failed against the live old build (received "Map data from OpenStreetMap"), then passed against the local preview with segments drawn. Typecheck clean. scripts/ci-local.sh exit 0.

### chore(deps): add vite-plugin-pwa 2.0.0 for the offline command post
- What: `vite-plugin-pwa` 2.0.0, exact pin, web devDependency (the spec's pinned version; brings workbox-build and workbox-window 7.4.1). The root lockfile gains 324 entries; none removed, no version changed (checked by diffing the package sets).
- Source: orchestrator P1 item 5, spec 6.3 "offline PWA" and the pinned stack list.
- Verified: socket depscore vite-plugin-pwa 2.0.0 supply chain 97, workbox-build 7.4.1 98, workbox-window 7.4.1 99, no vulnerability findings on the three; `npm ci` exit 0. npm audit rises from 10 to 18 findings; the 8 new ones are build-time tooling under workbox-build (rollup plugins, glob, minimatch, picomatch) that never ship to the browser. scripts/ci-local.sh exit 0.

### feat(web): load the command post offline after one visit with a Workbox service worker
- What: `VitePWA` in `web/vite.config.ts` generates `sw.js` (autoUpdate, clientsClaim, skipWaiting, old caches cleaned) that precaches the app shell: index.html, the JS and CSS, the MapLibre worker, the icon, the register script and a web manifest (8 entries, about 2.7 MB; the size limit is raised to 3 MiB for the 2.1 MB main bundle). Navigations fall back to index.html except Firebase's reserved `/__/` paths, `/pack/` and `/evidence/`. `version.json` is deliberately not cached, so the online check still has to reach the network. Firestore's persistent local cache (already on) supplies the last data.
- Source: UI review D2, orchestrator P1 item 5, spec 6.3 ("loads with Wi-Fi off") and the section 16 release gate ("an offline reload").
- Verified: new `e2e/offline.spec.ts` (join, wait for the segments and for the service worker to control the page, go offline, reload; expect the drill line, the map idle, Add sighting and the drill's segments drawn from cache) failed first (no service worker ever controlled the page), then passed against the local preview; a probe of the offline page showed the incident title, the match code and all 67 plates. scripts/ci-local.sh exit 0.

### test(e2e): mark the photo-dependent checks deployed-only so a local run fails loudly
- What: `deployedOnly()` in `e2e/fixtures.ts` throws a plain message unless BASE_URL is set. The two privacy tests and the joined smoke (whose console check sees photo reads) call it first. The production bucket's CORS trusts only the two hosting origins, so these checks only mean something on the deployed site; a local run now fails at once with that reason instead of timing out or being mistaken for a pass.
- Source: orchestrator ruling on report 8 (keep the bucket's CORS to the deployed origins; label the photo checks deployed-only).
- Verified: locally the three tests fail in under 0.2 s with the deployed-only message while the other smoke tests pass; with BASE_URL set to the live site the same three pass. scripts/ci-local.sh exit 0.

### feat(theme): add the measured 22.1 colour tokens and the contrast maths in one place
- What: `theme/tokens.ts` holds the spec 22.1 command colours (`COMMAND`), the eight-step `POA_RAMP`, `textPairAllowed` (the three "not allowed" pairs refused) and `dotRadiusPx`; `theme/contrast.ts` holds `contrast`, `hueDeg` and `lightness`. `map/poaStyle.ts` now takes the ramp, the dot size and the map inks from them instead of its own copies.
- Source: plan Task 39.1 (orchestrator: Task 39 starts after P0 and 23c).
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
- Source: extras lane request H3 via the orchestrator.
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
- Source: UI review U4 and orchestrator P1 item 6 (self-hosted PMTiles basemap); lane A's dev extract for drill-dev-1.
- Verified: `src/basemap/load.test.ts` (4 tests) failed first (module missing), then passed. scripts/ci-local.sh exit 0.

### feat(basemap): style the Protomaps basemap in the 22.1 instrument greys
- What: `basemap/style.ts` `basemapLayers(source)`: under the probability fills, parks and green land in bg-1, water shapes in bg-3, buildings in bg-2; over the fills, streams, roads (wider by kind) and dashed paths as fg-4 lines at 0.6 opacity, so the fills keep their measured colours. Reads only Protomaps v4 layers. No label layers: they would need glyphs from a host.
- Source: UI review U4 ("paths, roads and the creek in fg-4, water as a bg-3 shape with no hue") and spec 22.1.
- Verified: `src/basemap/style.test.ts` (4 tests: tokens only, fills under and lines over with no labels, Protomaps v4 layers only, water bg-3 and lines fg-4) failed first (module missing), then passed. scripts/ci-local.sh exit 0.

### feat(map): draw the site's self-hosted basemap under the probability field
- What: MapView takes `basemapUrl`; the post passes `/tiles/<gridId>.pmtiles`. One pmtiles protocol is registered for the page; the loaded file is drawn with `basemapLayers`, shapes inserted under the probability fills and lines between the fills and the segment edges. The credit counts the basemap only once it is drawn, and the map carries `data-basemap` (drawn, absent, invalid, unavailable). The service worker precaches `.pmtiles` files, so the basemap draws offline. The dev extract (lane A, Protomaps build 20261118, Piedmont Park, never for the film or judges) lives in `web/public/tiles/`, which `web/.gitignore` keeps out of git; a real site's extract will be copied in at build.
- Source: UI review U4, orchestrator P1 item 6.
- Verified: new `e2e/basemap.spec.ts` failed against the live site (no basemap), then passed against the local preview: basemap drawn, OpenStreetMap credit, zero tile requests to another host. The offline reload test still passes with the basemap precached (11 entries). Still at 1440 px checked. scripts/ci-local.sh exit 0. Not pushed or deployed yet: merge point 2 is running.

### feat(extras): mount the extras dock in the post header with the map from onReady
- What: the post header renders the extras lane's `ExtrasDock` ("More": print sheets, radio cards, check, export) with the post state, the view state and the MapLibre map, which MapView hands over through `onReady` (hooks H1 and H3).
- Source: extras lane request H1 and H3 via the orchestrator (needed for the Sunday drill's ICS 204 sheet and radio card).
- Verified: new `e2e/extras-dock.spec.ts` failed first (no "More" in the header), then passed against the local preview on the drill (the menu opens with its items); layout, offline and judge e2e still pass. scripts/ci-local.sh exit 0.

### feat(extras): render the judge extras after the replay section
- What: `/judge` renders the extras lane's `JudgeExtras` after the replay section, given the published run when one exists (hook H2). It draws nothing today.
- Source: extras lane request H2.
- Verified: judge e2e (2 tests) pass against the local preview; typecheck and build clean. scripts/ci-local.sh exit 0.

### feat(web): precache the extras lane's json data files for offline use
- What: the Workbox precache adds `extras/**/*.json` (the extras lane's scam.json and terrain files once they ship) beside the existing patterns; `version.json` at the root stays network-only. The lazy extras chunks were already covered by the js pattern (hook H6).
- Source: extras lane request H6.
- Verified: build clean (11 precache entries today; no extras json exists yet, so the pattern matches nothing until it does); offline e2e passes. scripts/ci-local.sh exit 0.
