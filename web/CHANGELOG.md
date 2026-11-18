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
