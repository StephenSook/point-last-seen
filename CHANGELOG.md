# Changelog

Lane A: shared/, tools/, functions/, root rules and config, scripts/, .github/, docs/.
Newest first. Each entry gives what changed, its source and how it was verified.

## 2026-11-18

- deleteIncidentMedia runs every 5 minutes (still one Cloud Scheduler job), so "a sandbox's media is deleted
  within 15 minutes of its end" (docs/LIMITS.md) holds even when a run starts late; a 15-minute schedule
  could not keep a 15-minute promise. The timeout drops to 240 s so a run ends before the next starts.
  Source: Codex adversarial review of 2bdb778..dc762be, finding M2 (orchestrator preferred 5 minutes).
  Verified: the schedule test (reads the function's own endpoint metadata) failed first with "every 15
  minutes", now passes; emulator suite 108; `bash scripts/ci-local.sh` exit 0.
- deleteIncidentMedia handles each ended sandbox on its own: a failed delete (a Storage hold, a transient
  error) is logged with the incident id, counted in ops/storage (`sweepFailures`, a count only since the doc
  is public) and left unstamped so the next run retries it, and the other sandboxes are still cleaned. Before,
  one throw left every later sandbox's media in place. A sandbox stamped and ended more than 24 hours ago is
  no longer listed, so the work stays flat as sandboxes pile up; inside the 24 hours an upload in flight at the
  end is still caught.
  Source: Codex adversarial review of 2bdb778..dc762be, finding M1 (verified by the orchestrator and against
  the code).
  Verified: 2 new tests (a held sandbox does not stop the next and stays unstamped; a long-stamped sandbox is
  not listed) and the updated ones failed first, now pass; emulator suite 107; functions typecheck exit 0;
  `bash scripts/ci-local.sh` exit 0.
- The lifecycle check behind ops/storage (and so the daily probe) accepts only the exact rule LIMITS promises:
  action Delete, condition keys exactly age and matchesPrefix, age exactly 30, prefixes exactly clips/, photos/
  and packs/ in any order. Before, a bucket-wide or shorter delete, an extra condition such as isLive, or a
  fourth prefix read as OK while deleting drill media early or not at all.
  Source: Codex adversarial review of 2bdb778..dc762be, finding M6 (verified by the orchestrator and against
  the code).
  Verified: the new exact-rule test failed first (the 7-day bucket-wide rule read OK), now passes; emulator
  suite 105; `bash scripts/ci-local.sh` exit 0.
- A stored RouteGraph now carries its own extract `bounds` (or an explicit null for a graph with no exits) and
  its `projection` (metres per degree at the origin). `indexRouteGraph(graph)` takes no outside bounds and
  refuses a graph without either field. Before, a reload without the second argument silently marked every
  node as not a boundary, so walkers that should exit the area into ROW stayed on the graph; and each load
  recomputed the projection with Math.cos, which can differ in the last bit across engines. Schema, TS type
  (the only parity target) and the builder change together.
  Source: merge point 2 review of codex-walkers (fresh code-reviewer agent, medium design finding and a low
  determinism finding); my bounds ruling at merge point 2.
  Verified: 3 graph tests failed first (round trip without the bounds argument, null bounds, refused reload),
  now 24 grid-builder tests pass; both typechecks exit 0; schema parity ok (10 schemas, 26 types);
  `bash scripts/ci-local.sh` exit 0.
- LIMITS: the Android on-device structured-output path (generateObject), whether it fills response.text, and
  whether wire-named enum constants survive ML Kit's on-device schema translation are marked NOT VERIFIED (no
  Gemini Nano phone); a mismatch is refused by the closed-schema check, not used.
  Source: lane D via the orchestrator.
  Verified: docs only; `bash scripts/ci-local.sh` exit 0.
- The `android` job and ci-local also compile the instrumented tests (`compileDebugAndroidTestKotlin`, no
  emulator needed), so a broken androidTest fails at merge instead of only when lane D runs it by hand.
  Source: lane D via the orchestrator.
  Verified: `./gradlew --no-daemon compileDebugAndroidTestKotlin` BUILD SUCCESSFUL on main's android/;
  `bash scripts/ci-local.sh` exit 0.
- Checklist: the judging-window model line now points at the gate's allow-list and asks for a re-read of the
  live models page on or after 2026-11-28, moving any newly retiring id to `banned` and updating `readOn`;
  Remote Config values get the same check before the template is published.
  Source: orchestrator ruling (turn the model line into a test; re-read the page on Nov 28).
  Verified: docs only; `bash scripts/ci-local.sh` exit 0.
- Model allow-list: `shared/constants/models.json` lists the model ids the project may name (today only
  gemini-3.5-flash-lite: Stable, released 2026-07-21, no shutdown date) and the banned ones
  (gemini-3.1-flash-tts-preview, shut down 2026-11-17), read from the live Firebase AI Logic models page on
  2026-11-18, to be re-read by 2026-11-28. The rules gate fails on any model id in source that is not listed,
  and on a banned id anywhere outside docs, tests included; test files may name other ids as data.
  Source: orchestrator (judging-window audit: a model shutting down inside the window would break the cloud
  route; read of the models page 2026-11-18).
  Verified: 2 gate tests failed first, now 25 pass; the gate passes on this tree and on the trees of lane-ios,
  lane-web, lane-android, codex-walkers and lane-extras (each walked with this gate and list);
  `bash scripts/ci-local.sh` exit 0.
- P-12 urgency chip: `shared/constants/urgency.json` (coldF 40, the CDC sentence it rests on, its URL and the
  date it was read), `urgencyLevel(tempF, wet)` in @pls/engine, and shared vectors in
  `shared/test-vectors/urgency.json` from the Python reference so web (lane C) and iOS (lane B) agree: cold at
  or below 40 F, cool_wet above it when typed wet, none otherwise. Clothing does not enter. Ruling: no typed
  temperature gives none (no chip without data) and an unanswered wet question counts as dry. The vectors sit
  in their own file because the Swift vector test refuses unknown sections in search.json.
  Source: coordinator ruling (P-12), PLS-DESIGN Coordinator decisions.
  Verified: the CDC sentence was found word for word on the live page (reviewed 2026-08-25, read 2026-11-18);
  the urgency tests failed first (no constants file), now 183 engine tests pass with the 7 vectors;
  search.json unchanged; 16 generator tests pass; `make_vectors.py --check` covers the file; the
  vectors-parity job diffs it and runs its TS test; `bash scripts/ci-local.sh` exit 0.
- NOTICE credits anime.js 4.5.0 (Julian Garnier, MIT), imported only by web/src/motion/engine.ts (the rules
  gate enforces that); it arrives with lane C's merge (dependency 657d96b, engine cf627b4).
  Source: plan Task 39.3, lane C hand-over.
  Verified: `npm view animejs@4.5.0` reports license MIT, author Julian Garnier, repository
  juliangarnier/anime; `bash scripts/ci-local.sh` exit 0.
- NOTICE lists the three web fonts under the SIL Open Font License 1.1 (DINish v4.007, Ioskeley Mono v2.2.0,
  DSEG7 Classic v0.46) with their repositories and commits; the files arrive with lane C's merge.
  Source: plan Task 39, lane C hand-over.
  Verified: each tag resolves to the stated commit and each repository's license reads OFL-1.1 through the
  GitHub API (2026-11-18); `bash scripts/ci-local.sh` exit 0.
- Rules gate, Task 39: the font names "Berkeley Mono" and "Digital-7" fail outside docs (only the OFL fonts in
  web/public/fonts ship); animejs may be imported only by web/src/motion/engine.ts (dynamic imports and
  require included; package.json may list it); and web/index.html and web CSS may not load a font from a
  remote host (Google Fonts, Typekit, Bunny, fonts.com, cdnfonts, Adobe).
  Source: plan Task 39, lane C hand-over.
  Verified: 3 gate tests failed first, now 23 pass (one test assertion was tightened to file:line, since the
  message itself names engine.ts); the gate walks 420 files with 0 problems; lane-web and lane-extras show no
  match; `bash scripts/ci-local.sh` exit 0.
- docs/LIMITS.md gains "On-device safety (Android)": the family app's on-device path (firebase-ai-ondevice
  16.0.0-beta08 over the ML Kit GenAI Prompt API and AICore), Google's own statements about its safety
  filters and the 4,000-token input window (three quotes, each with its URL), our own checks on every path, the
  byte bound for our largest request, and what was not tested (no Gemini Nano phone; non-English notes).
  Source: lane D hand-over (promotion item F5); the "128K" figure from the talk is left out, as lane D
  found it in no Google doc.
  Verified: a fetch agent found all four quoted passages word for word on the three live pages (2026-11-18);
  no dashes in the file; `bash scripts/ci-local.sh` exit 0.
- The linear-feature layer is neutral (every weight 1) when the grid's mass-weighted near share NEAR is at or
  above 0.75, the ISRID share; below it the spec 10.5 formula is unchanged. `linearWeights` is now a pure
  export of @pls/engine (buildPrior uses it), with a Python reference in tools/vectors/make_vectors.py and
  TypeScript-only vectors in the new `shared/test-vectors/prior.json` (dense grid neutral, exactly 0.75
  neutral, sparse grid on the formula, all far and zero mass unchanged), kept out of search.json because the
  Swift and Kotlin twins only consume priors and refuse unknown sections. The rule is continuous at 0.75 and
  removes the division by zero at NEAR = 1. LIMITS labels it as ours. NEAR stays mass-weighted, as since Task
  10: mass weighting is what makes the target exact when segments are wholly near or far, and the guard must
  use the same NEAR as the formula or the layer jumps at the threshold (the design note says "area-weighted";
  flagged to the orchestrator).
  Source: coordinator ruling 2026-11-18 on the Piedmont Park dev grid (nearFrac at least 0.927 everywhere).
  Verified: 2 engine tests failed first (no function; a dense grid was not neutral), now 174 pass with the 5
  prior vectors; search.json byte-identical (no existing expected value changed); 15 generator tests pass;
  `make_vectors.py --check` covers both files; the vectors-parity job diffs both and runs both TS vector tests;
  `bash scripts/ci-local.sh` exit 0.
- Production checklist, Android: raise the Remote Config key `minimum_version_android` only after the repo is
  public (not before 2026-11-28) and the release APK is a GitHub Release asset, because the family app's
  update screen opens the repo's latest release, a 404 while the repo is private; the line names the two `gh`
  checks to run first. The in-app default stays 0 (lane D's RcValuesTest pins it).
  Source: lane D hand-over (J10), ruled by the orchestrator.
  Verified: text as handed over; no code change.
- `docs/PRODUCTION-CHECKLIST.md`: a Judging window (2026-12-10 to 2026-12-16) section lists every time-based
  value on a judged path (Storage lifecycle, clipReadings TTL, judge sandbox limits, App Check token TTLs and
  enforcement, the published run, the media sweep, the daily probe, GitHub's 60-day cutoff, the Actions and
  Gemini budgets, model shutdown dates, image cleanup), what it does on Dec 10 and Dec 16 and what guards
  it, with pre-submit lines for the ones a test cannot pin (sandbox copies get a fresh expiresAt, the daily
  cap key exists, the Gemini burn rate fits the cap, no model shuts down before Dec 17, the probe workflow is
  active and recent, December's Actions budget). The Firebase project section gains the lifecycle and TTL
  read-back lines.
  Source: orchestrator (HR217 judging-window audit).
  Verified: App Check token TTLs read back 3600 s on all four app configs; the Remote Config server template
  has no parameters; `bash scripts/ci-local.sh` exit 0.
- The clipReadings TTL policy was missing in production although the spec and LIMITS promise it: it is now
  enabled on `clipReadings.expiresAt` and declared in firestore.indexes.json as a field override, so the
  merge point 2 index deploy keeps it. `scripts/test_judging_window.py` (gates and ci-local) pins three
  values judging depends on: the lifecycle age cannot delete anything before 2026-12-16 (project created
  2026-11-17), the TTL is declared and the rules allow at least 30 days, and both probes retire only after
  2026-12-16.
  Source: orchestrator (BYT's stale-data finding; HR217 judging-window audit).
  Verified: the TTL test failed first (no override), now 3 tests pass; `gcloud firestore fields ttls update`
  exit 0, state CREATING (re-checked at merge point 2); `bash scripts/ci-local.sh` exit 0.
- ci-local: when the emulator suite fails, it now prints who holds this worktree's emulator ports
  (`scripts/emulator_config.py --who-holds`, lsof over the 10-port block) and still fails with exit 1.
  Lane B saw one WebChannel bind failure ("Address already in use") on its websocketPort right after the
  port wait said the block was free; the cause is not known yet, so this records evidence instead of
  hiding the flake with a retry or a longer timeout. A new test shows the wait already counts a socket held
  on the 0.0.0.0 wildcard as busy, so the wildcard is ruled out.
  Source: lane B flake report via the orchestrator (ledgered as a flake).
  Verified: the who-holds test failed first, now 10 emulator_config tests pass (the wildcard test passed at
  once, which is its finding); `bash scripts/ci-local.sh` exit 0.
- `scripts/media_probe.py` reads ops/storage with the site's public key and fails if the 30-day lifecycle rule
  is gone or the sweep is more than 2 hours stale (which also catches a dead scheduler).
  `.github/workflows/probe.yml` runs it and the App Check no-token check daily at 13:23 UTC on a pinned
  runner, credential-free; each step runs even if the other fails, and both scripts retire after 2026-12-17.
  Source: orchestrator (daily checks for two security defaults that can change silently).
  Verified: 3 probe tests written with the script pass; the live probe exits 1 today (ops/storage 403, rules
  not deployed yet), as it must until merge point 2; `bash scripts/ci-local.sh` exit 0.
- Storage health record: each 15-minute deleteIncidentMedia run also reads the bucket's lifecycle and writes
  `ops/storage` (lifecycleOk, the rule's age, a server time); a new rules match makes that one doc readable
  without sign-in and no ops doc writable, so a probe can check it with no credential.
  Source: orchestrator (a privacy check that fails if the lifecycle rule ever disappears).
  Verified: 3 emulator tests failed first (the lifecycle check cases, the ops/storage write, the public-read
  rule), now pass; suite 104; `bash scripts/ci-local.sh` exit 0.
- `scripts/appcheck_control.py`: a live App Check control for Firebase AI Logic on the deployed project. A
  raw generateContent call with no App Check token must be refused with 401 "Firebase App Check token is
  invalid."; only then is a debug-token call made, which must answer 200. Evidence goes to
  docs/evidence/appcheck-control/ with every key and token redacted. `--no-token-only` is the credential-free
  daily half (config from the site's /__/firebase/init.json, no model call) and retires itself after
  2026-12-17. Firebase's documented automatic App Check enforcement for AI Logic did not happen on a project
  created 2026-11-17, so this control proves the manual enforcement is still on.
  Source: orchestrator (BYT upstream finding; self-audit gap SA:86).
  Verified: 5 tests failed first (no module), now pass; the live run gave 401 then 200 (evidence
  2026-11-18T08-55-34+00-00.json, 0 key matches in it and in the logs); the App Check API reads
  firebaseml ENFORCED since 2026-11-17T18:32Z; `bash scripts/ci-local.sh` exit 0.
- `deleteIncidentMedia` (scheduled every 15 minutes, us-central1, one instance, no model call) deletes every
  clip, photo and pack of each judge sandbox whose expiresAt has passed and stamps mediaDeletedAt once; it
  re-checks all ended sandboxes each run, so an upload in flight at the end is caught next time. Drills, live
  sandboxes and look-alike prefixes (J1 vs J10) are left alone. Deleting the file is what ends a member's
  no-sign-in download link (docs/LIMITS.md). Not deployed yet: it deploys with the rules at merge point 2,
  and LIMITS stays PLANNED until the deploy is read back.
  Source: rules audit 2026-11-18, finding (c); orchestrator go (build now, not with Task 23).
  Verified: 3 emulator tests failed first (no module), now pass (an ended sandbox loses its 3 files and is
  stamped; J2, D1, D2 and clips/J10 keep theirs; a second run is a no-op; a file added later goes on the next
  run); emulator suite 101 passes; functions typecheck exits 0; rules gate 0 problems;
  `bash scripts/ci-local.sh` exit 0.
- Add `storage.lifecycle.json` (delete clips/, photos/ and packs/ 30 days after upload) and apply it to the
  bucket; the storage.rules header said this was in place, but the bucket had no lifecycle rule at all.
  storage.rules and docs/LIMITS.md now say plainly that any member can create a no-sign-in link to a clip or
  photo that works until the file is deleted: Firebase Storage gives a member a download token on any read
  of the file's details, even after an admin removes it (measured on the live bucket), so stripping tokens
  cannot close this, and deletion is the only end.
  Source: rules audit 2026-11-18, finding (c), confirmed and then measured.
  Verified: `gcloud storage buckets update --lifecycle-file` exit 0; read back: one Delete rule, age 30,
  prefixes clips/, photos/, packs/ (empty before). Live probe 7/7 plus the token experiment (token present
  after upload; removed by admin; present again after the member's metadata read).
  `bash scripts/ci-local.sh` exit 0.
- Two cheap fixes from the same audit: a clip reading's `expiresAt` (it drives the 30-day TTL on the consent
  record and the model's description of the person in the clip) must be in the future and at most 31 days
  away, so a client can no longer keep it forever or delete it at once; and an incident update must leave
  `status` as open, found or closed, so command can no longer remove it (which silently paused events, plans
  and joins) or set a look-alike such as "Closed".
  Source: rules audit 2026-11-18 (two minors folded into the fix, with the orchestrator's go).
  Verified: new shapes cases (a past and a 40-day expiry are refused, 30 days passes; "Closed" and a write
  without status are refused, "found" passes) fail against the previous rules; emulator suite passes;
  `bash scripts/ci-local.sh` exit 0.
- profile/shared types every key it allows (rules audit, moderate), through the generated
  schema_SharedProfile: string lengths (60 or 40 or 200), integer ranges for age, height and weight, the
  dementiaType and mobilityAids enums, the date pattern for photoTakenOn, all 18 flags as booleans, and
  approachNoteIds limited to the ids in shared/constants/approach-notes.json. Before, 15 of the 20 keys took
  any value, so free text (an address, history) could land in a field every searcher reads and every pack
  carries. Keys stay optional so a profile can be written in parts; flags is all 18 or nothing (the web,
  Android and engine writers already send all 18).
  Source: rules audit 2026-11-18, finding (b).
  Verified: new shapes cases (the full profile the apps write passes; free text in dementiaType, an address
  object in mobilityAids, a made-up aid, a bad date, a wrong type, out-of-range numbers, overlong strings,
  partial flags and unknown note ids are refused) fail against the previous rules; the existing profile test
  now sends all 18 flags. Emulator suite passes; `bash scripts/ci-local.sh` exit 0.
- Events take only their schema shapes (rules audit, moderate): `position` must be {lat, lon, accuracyM} in
  range, `reading` a ReportReading (or, for camera_sighting, a CameraSightingReading whose sighting is a
  CameraSighting), `route` a RouteRecord, each bounded in size, using the generated validators. Before, each was
  any map, so a searcher could append about 1 MiB events that nobody can delete and every device syncs. To fit
  the heaviest real events (a cleared report with its effect inputs, a full reading, a route and a GPS
  position; a 64-influence clue; a full camera sighting) under Firestore's 1,000-expression limit per
  request, the role claim is read once, and the event and effect key sets are pinned by size (every key is
  read, and a missing key is an error that denies) instead of by list literals.
  Source: rules audit 2026-11-18, finding (a).
  Verified: new `functions/test/rules/shapes.test.ts` (written with the fix, then run against the previous
  rules, where its three refusal groups fail; the heaviest cases first hit the limit and were cut down): bad positions, oversized or unknown-keyed readings and routes, a fourth carried item and other bad
  camera sightings are refused; the heaviest real events pass; dropping any of the 25 event keys, the 4
  cleared-effect keys or the 5 input keys for a stray key is refused. Emulator suite passes;
  `bash scripts/ci-local.sh` exit 0.
- `tools/rules/gen_rules_validators.py` compiles shared/schemas into Firestore rules validator functions
  (schema_Position, schema_ReportReading, schema_RouteRecord, schema_CameraSighting,
  schema_CameraSightingReading, schema_SharedProfile) and writes them between GENERATED markers in
  firestore.rules. It refuses any unbounded string or list. Event-carried shapes use a shape mode that keeps
  every size bound but spends fewer rules expressions (string enums bounded by length, short string lists by
  joined length, numbers by type, all-required key sets pinned by size). The gates job and ci-local run it with
  `--check`, so the rules can never drift from the schemas. The block is not used yet; the next commits use it.
  Source: rules audit 2026-11-18 (fresh agent with the firebase rules-auditor checklist: events and
  profile/shared values unbounded or untyped).
  Verified: 8 generator tests (each failed first) pass; `--check` exits 0 and fails on a stale block;
  `bash scripts/ci-local.sh` exit 0.
- `tools/seed/seed_segments.py <project> <incidentId> <segments.json> --prior-version N` (admin, gcloud OAuth)
  writes the grid builder's segment docs under incidents/{id}/segments, deletes segment docs the new grid no
  longer has, then updates only gridId, ipp, terrain, priorLayers, gridAttribution and priorVersion on the
  incident (last, so the incident never points at a grid whose segments are missing), in commits of at most
  500 writes, and reads the segment ids back. It refuses a payload whose prior does not sum to 1, has a
  duplicate or malformed id, a negative mass, a non-polygon geometry, or ROW anywhere but last. Its tests join
  the gates job and ci-local.
  Source: orchestrator (development prior for drill-dev-1; the same tool seeds Stephen's site later).
  Verified: 9 tests failed first (no module), now pass; `bash scripts/ci-local.sh` exit 0.
- Grid builder `--prior <grid.json> --ipp <lat,lon> --terrain <...> [--linear] [--bearing <deg>] --out <file>`
  writes the segment docs the apps read under incidents/{id}/segments: one per segment (geometry as a GeoJSON
  string, centroid, area, neighbours, stream links, nearFrac, feature classes) with the engine's own
  `buildPrior` result, ROW last with the mass outside the mapped area, plus the inputs (gridId, ipp, terrain,
  layers, bearing, attribution). A malformed IPP or an unknown terrain prints usage and exits 2.
  Source: orchestrator (seed a development prior so the map, replan and POA beats run against deployed data).
  Verified: 4 new tests failed first (no module), now 18 grid-builder tests pass (one doc per segment and ROW
  last; the prior sums to 1 within 1e-12; cells wholly inside the 300 m first ring have equal mass per m2 and
  the far corner cell less than half); typecheck exits 0; `bash scripts/ci-local.sh` exit 0.
- `ci-local.sh` builds the web app with CI's placeholder config (the same values as web.yml) into a temp folder,
  so every lane can run the web step without a web/.env.local, and no worktree's real web/dist (built from its
  .env.local and deployed from there) is overwritten. Vite lets variables already in the environment beat .env
  files, which is why the output folder moves too.
  Source: lane B's ci-local stopped at "Missing build config" after merging main.
  Verified: `bash scripts/ci-local.sh` exit 0 from a shell with no VITE variables; the build printed
  `vite build --outDir <temp> --emptyOutDir`; web/dist/index.html kept its timestamp.
- Task 10 CLI: `npm run build-grid -w tools/grid-builder -- <site.geojson> <gridId> --osm <overpass.json> --out
  <grid.json>` builds the grid (cells, then near-feature fractions, then stream links) and writes it with a
  trailing newline; `--query <site.geojson>` prints the Overpass QL query for the site's bounding box (ways and
  relations tagged highway, waterway, natural or building, `out geom`). `osmToFeatures` turns closed water and
  buildings into polygons, a multipolygon's closed outer members into polygons, and keeps waterway lines in way
  order (the flow direction). Missing arguments print usage and exit 2.
  Source: plan Task 10 (the CLI half; the drill site, the run and pmtiles wait for Stephen's site, step 5).
  Verified: 4 new tests failed first (no module), now 14 grid-builder tests pass (same inputs give the same
  bytes; the centre cell sees the pond and the stream but not the trail 125 m away); typecheck exits 0; the
  CLI run by hand printed the query (exit 0) and usage (exit 2); `bash scripts/ci-local.sh` exit 0.
- Shared vectors: add the posterior case `walker_prior_then_cleared`, whose prior is the committed golden
  walker table (AA 0.2664, AB 0.1372, ROW 0.5964) and whose one event clears AA at POD 0.5 (expected AA
  0.15367, AB 0.15828, ROW 0.68805). The Swift engine never runs walkers, so this case is how it proves it
  consumes walker output exactly as TypeScript does (PLS-DESIGN 10.6, "Determinism").
  Source: PLS-PLAN Task 37a; built in the Codex build lane, reviewed by the orchestrator.
  Verified: `make_vectors.py --check` reports 161 vectors current; removing the new case gives exact JSON
  equality with all 160 existing cases; TypeScript vector suite 135 passed and Swift core 205 tests passed
  (VectorTests and PosteriorTests run every posterior case, this one included); `bash scripts/ci-local.sh`
  exit 0.
- Grid builder: build the walker route graph (`tools/grid-builder/src/graph.ts`, Task 37a). Stations every
  25 m with x and y in local metres, a unit heading, a unit normal and the segment under each; a junction is
  inserted wherever a road or trail line crosses a stream or meets a water edge (OSM draws them as separate
  lines that often share no point, PLS-DESIGN 10.6), so a walker on a trail is offered the creek. The
  builder writes the stored `RouteGraph` shape from shared/schemas and adapts it to the indexed
  `WalkerRouteGraph` for simulation; the original extract bounds are passed back in on reload to restore
  boundary exits, because the stored schema has no field for them.
  Source: PLS-PLAN Task 37a; built in the Codex build lane, reviewed by the orchestrator.
  Verified: the 3 new tests failed first (missing module), then pass (25 m stations with unit headings; one
  shared junction where a road crosses a stream; a walker can turn onto the stream there, 40.8 percent of
  walkers stopped on a stream station, seed 6) plus a JSON round-trip regression; grid-builder suite 14
  passed; `bash scripts/ci-local.sh` exit 0 on the series head.
- Add the seeded Monte Carlo walker prior (Task 37a, PLS-DESIGN 10.6): `mulberry32` (32-bit state, divide
  by 2^32), `simulateWalkers` (ISRID distance draw, first edge weighted 2.045 inside the 66 degree travel
  wedge and 0.395 outside, turn weights 4/2/1 with no reversal except at a dead end, water edges x2.0,
  attractors x1.5 within 66 degrees, low mobility limited to the first 75 percent of the curve, a path
  cap of 3 times the target, the ISRID track offset, ROW for draws above 0.95, graph exits and points
  outside every segment), the per-segment standard error sqrt(p(1-p)/N) and 300 sampled tracks. Arithmetic
  only (add, subtract, multiply, divide, compare; a fixed Newton square root), so the table is
  bit-identical across JavaScript engines. Constants in `shared/constants/walker-params.json`, each traced
  to PLS-DESIGN:400 and 10.6 and PLS-PLAN:900. Ours, labelled as ours: the offset tail above the 0.95
  quantile is capped at 307 m (the ISRID offset table ends there). A golden toy table is committed.
  Source: PLS-PLAN Task 37a; built in the Codex build lane from the orchestrator's brief, reviewed by the
  orchestrator against the spec line by line.
  Verified: the 10 engine tests failed first (missing API), then pass: straight road 25.33 percent stop
  within 300 m and ROW 4.79 percent (seed 1), fork stream share 0.6641 (seed 2), wedge 0.8360 (seed 3),
  attractor 0.5956 (seed 4), low mobility max 2,400 m and ROW 0 (seed 5), all 10,000 walkers and inside
  the plan's tolerances; engine suite 177 passed; `bash scripts/ci-local.sh` exit 0 on the series head.
- Merge point 1, lane C: merge main into lane-web on `merge/lane-web-1`. The only conflict was
  `package-lock.json` (lane-web added the web workspace, main added tools/grid-builder and moved the functions
  test toolchain to the root). npm's own conflict resolver crashed (arborist "edgesOut"), so the lockfile was
  merged as JSON three ways from the merge base 2bc711c: no key changed on both sides; every entry from both
  parents kept its version.
  Verified: `npm ci` accepts the merged lock; `bash scripts/ci-local.sh` exit 0 in the integration worktree with
  CI's placeholder web config (166 engine, 134 vector, 85 emulator and 211 web tests; web build).
- Widen the platform workflows now that every lane is on main (merge point 1): Swift core also runs when
  shared/test-vectors/**, shared/constants/** or its workflow change; Android when shared/** or its workflow
  change; web when shared/**, the root package files or its workflow change. Still pull requests to main
  and main only.
  Source: plan Global Constraints (widen at the merge points); the comments that held these back are removed.
  Verified: each file keeps exactly two path lists (push and pull_request), both widened; pushed only after
  PRs #2, #3 and #1 merged, so no job runs on main without its tree; `bash scripts/ci-local.sh` exit 0.
- The `ts` job (and `ci-local.sh`) now typecheck and test `tools/grid-builder`: its 10 tests ran in neither
  until now. A multi-line `run:` in Actions uses `bash -e`, so a failing typecheck stops the step.
  Source: own finding while checking what CI covers for Task 10.
  Verified: `bash scripts/ci-local.sh` exit 0 with the grid builder's typecheck and 10 tests in its output.
- Add `storage.cors.json` (GET from the two hosting origins; the headers the web SDK sends) and apply it to the
  bucket: the web photo tray's `getBytes` XHR was blocked with "No 'Access-Control-Allow-Origin' header is
  present". `docs/PRODUCTION-CHECKLIST.md` gains a Firebase project section: the CORS apply and read-back
  commands, and the callable invoker check (firebase-tools grants a callable's public invoker only on create).
  Source: lane C's live command post finding; the joinIncident deploy.
  Verified: `gcloud storage buckets update --cors-file` exit 0; the bucket's cors_config read back equals the
  file (it was empty before). An unauthenticated request cannot prove it (error responses carry `*` for any
  origin), so lane C's authorized live read is the proof. `bash scripts/ci-local.sh` exit 0.
- `scripts/emulator_config.py --wait-ports SECONDS` waits, bounded, until every port in this worktree's emulator
  block can be bound on 127.0.0.1 and ::1, and exits 1 naming the busy ports when the time runs out.
  `ci-local.sh` runs it (180 s) before the emulator suite, because a socket left from the previous run made the
  Firestore WebChannel server fail to bind ("Address already in use"). Local only: a CI runner starts clean.
  Source: lane C's ci-local finding (two failed runs, back to back, on its own block).
  Verified: 3 new tests (free block passes at once; a held port fails and is named; a port released after
  1.5 s passes after waiting) failed first, now 8 of 8 pass; `bash scripts/ci-local.sh` exit 0.
- Every workflow (CI, Engine, web; Swift core, Android and Rules already did) now runs only on pull requests
  to main and on pushes to main, never on lane branch pushes; pushes to one pull request cancel each other.
  Lanes verify each commit with `bash scripts/ci-local.sh` and record its bare exit code in their changelog
  entry; CI verifies once per lane at each merge point through one pull request. This entry's own commit
  and the one before it are pushed together, so CI runs for the head SHA only.
  Source: orchestrator, after the Actions budget was reached (300 runs today); Stephen set the November
  budget to $15, so the remaining $10 is spent only at merge points.
  Verified: no workflow keeps a `branches: ["**"]` push trigger (grep count 0); `bash scripts/ci-local.sh`
  exit 0.
- `functions/package.json` lists only its runtime dependencies (firebase-admin, firebase-functions); the test
  toolchain it used (firebase client 13.4.0, TypeScript 6.0.3, Vitest 5.1.0, @types/node 22.20.5) moves to
  the root devDependencies, still hoisted for the workspace tests. Cloud Build generates a lockfile from the
  functions folder alone, and npm's arborist crashed in peer-set resolution on the dev toolchain
  ("Cannot read properties of null (reading 'edgesOut')"), failing the first joinIncident deploy.
  Source: Cloud Build log of the failed deploy (build f5d65a45, about 55 s).
  Verified: the crash reproduced locally from a copy of the old functions/package.json; production-only it
  resolves (`npm install --package-lock-only` exit 0); the emulator suite still passes 85 and the functions
  typecheck exits 0; `bash scripts/ci-local.sh` exit 0 (paid-usage fallback: CI is budget-limited).
- Add the grid builder workspace (`tools/grid-builder`, Task 10): `buildCells` cuts the site into 125 m cells,
  rows north to south, clipped to the site (slivers under 1 m2 dropped before ids), two-letter row-major ids
  and edge neighbours; `applyFeatures` sets each segment's nearFrac (share within 71 m of a road, trail,
  stream or water edge, from a 20 x 20 sample grid) and featureClasses (structures listed, not counted);
  `applyStreams` links downstream and upstream from OSM way order (flow direction); `classifyOsm` maps OSM
  tags to the grid classes. Pins: @turf along, area, bbox, boolean-point-in-polygon, centroid, helpers,
  intersect, length, point-to-line-distance, polygon-to-line 7.4.0 and tsx 4.23.15 (dev), all exact.
  The CLI and the drill-site data wait for Stephen's site (plan Task 10 step 5).
  Source: plan Task 10; spec section 10.5.
  Verified: the 10 tests failed first (no modules), now pass (16 cells for a 500 m site, AA neighbours AB and
  AE, areas sum to the site, a west-edge trail gives about 71/125 near, a stream east through AA, AB, AC
  links in order); typecheck exits 0; Socket scores 80 to 100; `npm audit --omit=dev` 0; ci-local exits 0.
- The `android` job counts the Android unit tests after the Gradle run (`android/count-tests.py`, lane D's
  standard-library script): it fails on zero tests, on fewer than 150, or on any failure, error or skip, so
  the job log proves the tests ran. Mirrored in `ci-local.sh` inside the android guard. The job only runs
  once android/ is on main or on a pull request that carries it.
  Source: orchestrator request via lane D (lane D measured 181 tests; empty, missing, failing and --min 500
  cases exit 1).
  Verified: script read in full (40 lines, XML from Gradle only); ci-local exits 0 here (android skipped on
  main).
- Task 35a: approach notes and the profile split. `shared/constants/approach-notes.json` holds the spec 13.3
  copy (ours), the display order (may_not_respond and approach_calm first), when each note shows, a source
  role per note and the card footer. `shared/engine-ts/src/approach.ts` exports approachNoteIds,
  profileForSearchers (exactly the 20 profile/shared fields; dementiaType null without the family's
  consent), profileForCommand (the 5 command fields), profileForModel (appearance and clothing only),
  profileWarnings (photo past 60 days, profile past 183 days, or a missing date), detectionProfile (sound
  counts only if the family says they answer; hide or uniform fears ask for a hidden target) and
  placeToCheck (one destination event with a label and position only, effect none/informational).
  Source: plan Task 35a; spec sections 10.4, 13.2 and 13.3. Lane C (web form) and lane B (iOS card) build on it.
  Verified: the 11 new tests failed first (no module), now 166 engine tests pass; typecheck and lint exit 0;
  the shared keys match the rules' profile/shared allowlist; ci-local exits 0. The plan's device check
  (step 5) is lane B's.
- The vectors README's section table lists all three afterFailure result shapes, including
  `{ next: "reroute_without_on_device" }`, matching the rule text below it and the router vectors.
  Source: fresh-context review minor 10.
  Verified: the router vectors contain that shape (`grep -c reroute_without_on_device` on search.json is
  above 0); ci-local exits 0.
- The rules gate's `LanguageModel.availability` rule also catches optional chaining (`LanguageModel?.availability`)
  and bracket access (`LanguageModel["availability"]`), so the call stays confined to web/src/ai/gate.ts.
  Source: fresh-context review minor 11.
  Docs may name the call (this entry tripped the first version).
  Verified: the new tests failed first, now 20 gate tests pass; the gate is clean on main and on archives of
  lane-web, lane-ios and lane-android; ci-local exits 0.
- Cap `joinIncident` at 5 instances (`maxInstances: 5`, us-central1) to bound cost under abuse, alongside the
  per-caller attempt budget. Test reads the function's deploy manifest.
  Source: fresh-context review minor 6.
  Verified: the new test failed first, now 85 emulator tests pass; ci-local exits 0. Not deployed.
- firebase.json builds the functions before every deploy (`predeploy: npm --prefix "$RESOURCE_DIR" run build`),
  so a deploy can never ship a stale `functions/lib` (it is gitignored and only built locally).
  Source: fresh-context review minor 1.
  Verified: the same command run from the root exits 0 and writes lib/index.js and lib/join.js; firebase.json
  parses; ci-local exits 0. Nothing is deployed by this commit.
- Schema parity checks more: for TypeScript, a string-enum property's values must equal the literal union of
  its field type (inline, or a same-file type alias), so a value added to a schema can no longer pass
  silently; and a mapped file that is missing now fails once its platform root (shared/engine-ts,
  ios/PLSCore, android/app) exists, unless the mapping is marked `pending:` (iOS Plan.swift and Profile.swift
  are marked pending until lane B builds them). The check found and this commit fixes a real drift:
  `sdk_fallback` was in route-record.schema.json but not in the TS RouteReason type.
  Source: fresh-context review I5.
  Verified: 4 new parity tests failed first (enum alias, inline union, missing file with root, real repo),
  now 15 pass; dry runs against origin/lane-ios, lane-android and lane-web: 0 failures; ci-local exits 0.
- Clip readings are written before the upload and the model call (ruling I9): `clipReadings/{sha256}` is
  created by command or family with exactly the spec section 7 fields plus `createdByUid`, the three required
  consents (person in clip, footage owner, cloud processing; each `{byUid, atMs}` recorded by the writer),
  `publicUse` null or a consent, `reading` and `route` null, a timestamp `expiresAt` and a server
  `createdAt`; only its creator may then add `reading` and `route`, once, with the consents untouched.
  Storage refuses a clip upload unless the uploader's own clip reading with those consents exists.
  Source: orchestrator ruling I9 (lane D found a clip could be uploaded and never read, with no consent record).
  Verified: 3 new tests (create needs the consents and no reading; one creator-only update; upload needs the
  uploader's own reading) failed first, now 84 emulator tests pass; ci-local exits 0.
- A camera_sighting event carries its clip reference in `reading` (new schema def CameraSightingReading,
  TS type of the same name): the model's CameraSighting, `clipSha256`, `clipStartMs`, `clockConfirmed`
  and `cameraFacingDeg` (one of the 8 compass headings, or null when the family set no facing). The rules
  check that exact shape and that `clipReadings/{clipSha256}` exists. Command places and confirms the
  sighting from it; no extra event field is added.
  Source: orchestrator ruling I10 (lane D found the camera sighting had no link to its clip reading).
  Verified: 2 new tests (valid readings accepted; null reading, unknown clip, bad hash, 10-degree facing,
  text clock flag, extra key, missing parts and a text sighting refused) failed first (1 of 2), now 81
  emulator tests pass; schema parity checks 14 TS types (0 failures); typecheck and ci-local exit 0.
- The App Check test now sends a valid Auth emulator ID token and varies only the App Check header (none,
  and a bad token): both get 401 with the wrapper's "Unauthenticated" message, never the handler's sign-in
  message, and no claims are set. A control sends the same request through a callable built without
  enforcement and gets 200 with the family claims, so the 401 can only come from App Check.
  Source: Codex adversarial review M8 and the fresh-context review I4 (the old test sent no Auth token
  either, so it passed with enforcement off).
  Verified: with `enforceAppCheck: false` in functions/src/index.ts the new test fails (1 of 19 join tests),
  restored it passes; 79 emulator tests pass; ci-local exits 0.
- joinIncident hardening: a code must be 8 Crockford symbols after normalization (refused before any
  read); each caller spends one attempt from an atomic budget of 10 per rolling hour before the lookup
  (`joinAttempts/{uid}`, admin only; the 11th call is refused even with the right code); every failed join,
  including an unknown team, gets the same permission-denied message; an invite may carry `expiresAt` and
  `maxUses`, with uses counted in a transaction. Test fixture codes no longer use I, L, O or U.
  Source: Codex adversarial review M7.
  Verified: 3 new tests (one refusal for unknown team and wrong code, the attempt budget with a second
  caller unaffected, invite expiry and single use) failed first, now 78 emulator tests pass; functions
  typecheck exits 0; ci-local exits 0.
- `docs/LIMITS.md` gains a media retention section: expiry locks a judge sandbox's media at once through
  the rules; deleting the stored objects at expiry (`deleteIncidentMedia`, Task 23) and the 30-day drill
  lifecycle file (Task 18) are marked PLANNED, not built; no app uses Storage download URLs.
  Source: Codex adversarial review round 3, item 2 (the function itself lands with Task 23 and its tests).
  Verified: wording checked against the repo (no deleteIncidentMedia or storage.lifecycle.json yet);
  ci-local exits 0.
- Rules gate bans Storage token URLs (`getDownloadURL`, `downloadURL`, `downloadUrl`) in web/, ios/ and
  android/ code: a download URL carries a token that bypasses Storage rules, so a URL saved before a judge
  sandbox expires would keep serving its clip. Client reads go through getBytes/getBlob, which evaluate the
  rules. Docs may name the calls.
  Source: Codex adversarial review round 3 (MEDIUM), items 1 and 3.
  Verified: the new gate test failed first, now 18 gate tests pass; the gate is clean on main and a grep
  finds 0 uses on origin/lane-ios, lane-web and lane-android; ci-local exits 0.
- Clips and photos are create-only at their hash names: `clips/{incidentId}/{sha256}.mp4` and
  `photos/{incidentId}/{sha256}.jpg` must match a lowercase 64-hex name with the right extension, and no
  object may already exist there (`resource == null`; the emulator allowed an overwrite under the create
  rule alone). A cached reading or consent record tied to a hash can no longer point at replaced bytes.
  Rules cannot hash the bytes, so the reader checks the SHA-256 of what it reads (Task 18). Storage tests
  clear the bucket before each test.
  Source: Codex adversarial review M6.
  Verified: 2 new tests (replacing a clip and a photo refused; four bad clip names and a .png photo
  refused) failed first, then the overwrite case still passed until `resource == null` was added; now 75
  emulator tests pass; ci-local exits 0.
- Packs are per team: the pack record `packs/{teamId}` and the bundle are readable by command and by that
  team only. Bundles move to `packs/{incidentId}/{teamId}/v{n}.bundle` (the spec's `{teamId}-v{n}.bundle`
  file name could not be matched by team in Storage rules); the pack function (Task 12) writes this path.
  Source: Codex adversarial review M5.
  Verified: 2 new tests (another team's record and bundle refused, own team and command allowed, family
  refused) failed first, now 73 emulator tests pass; ci-local exits 0.
- Profile documents take only their own fields: `profile/shared` (readable by every member and carried in
  packs) accepts only the 20 shared fields of spec section 13.2, with the 18 flag names as booleans, free
  text at most 200 characters and at most 40 approach note ids; `profile/command` accepts only its 5 fields.
  A field-mapping slip can no longer put previous addresses, places, past wandering, water, vehicle or
  medication text where searchers read it.
  Source: Codex adversarial review M4; fresh-context review minor 4.
  Verified: 2 new tests (9 leaking writes to shared and 2 to command refused, valid writes accepted) failed
  first, now 71 emulator tests pass; ci-local exits 0.
- Add the `web` CI job (`.github/workflows/web.yml`, lane C's snippet): npm ci, web typecheck, Vitest, and a
  Vite build with placeholder config (no real value in the repo; the build refuses to run without config).
  Runs on every branch push touching web/**; until web/ is on main that is its only trigger (widen to
  shared/**, the lockfile and the workflow at the lane C merge). Mirrored in `ci-local.sh` behind a
  web/package.json guard.
  Source: orchestrator (lane C's 112 unit tests, tsc and build never ran in CI); lane C handover.
  Verified: action SHAs are the ones already pinned in engine.yml; `bash scripts/ci-local.sh` exits 0 here
  (web skipped on main). First run expected on the next lane-web push.
- Give the emulator step a per-worktree TMPDIR (`scripts/emulator_config.py --tmpdir`). The Storage
  emulator keeps uploaded blobs under $TMPDIR/firebase, which was shared by every worktree, so another
  lane's run starting or stopping its Storage emulator deleted blobs mid-upload (ENOENT, 30 s timeouts).
  Source: lane C report of two storage test timeouts during a parallel run.
  Verified: the new test failed first, now 5 emulator-config tests pass; the suite wrote its `firebase`
  folder into the per-worktree temp dir and passed 69; ci-local exits 0.
- README and NOTICE no longer name `shared/grid/`, which does not exist yet: they say the drill-site map
  data, when added with the site grid, is ODbL with its own README. Task 10's data commit adds the folder.
  Source: orchestrator self-audit sweep (a README path that does not exist is a checkable claim).
  Verified: `grep -n shared/grid README.md NOTICE` finds nothing; ci-local exits 0.
- Incident lifecycle is server-owned: no client creates an incident; command may edit an open incident but
  never `mode` or `expiresAt` (a judge sandbox cannot be extended or a drill relabelled), and closing is final
  (no reopen, no edit). A judge sandbox must carry a timestamp `expiresAt` in the future for every member
  read and write (Firestore and Storage rules) and for joinIncident; other incidents may have none.
  Source: Codex review M3, the fresh-context review I1 and the Codex C1 re-review item 2.
  Verified: 5 new tests (rules: no mode or expiry change, no reopen, judge without a timestamp locked out;
  storage: judge upload needs a future expiry; join: judge needs a future expiry) failed first, now 69
  emulator tests pass; ci-local exits 0.
- The seeding tool draws all three role codes and checks they are distinct (drawing again if not) before
  any Keychain entry or Firestore doc is written.
  Source: Codex re-review of the C1 fix.
  Verified: the new test (a forced collision on the first draw) failed first, now 6 seed tests pass;
  ci-local exits 0.
- Run the rules suite under a per-worktree demo project id (`demo-pls-` + 8 hex of the worktree path, from
  `scripts/emulator_config.py --project-id`); test helpers read it from GCLOUD_PROJECT. Separate ports alone
  still let the emulator hub report "running multiple instances of the emulator suite for project demo-pls"
  when two worktrees ran at once.
  Source: lane B report from its ci-local runs.
  Verified: the new test failed first, now 4 emulator-config tests pass; the suite ran as demo-pls-68ccce04
  and passed 63; ci-local exits 0.
- joinIncident tests that fail on the pre-fix handler: a legacy two-role code doc grants neither role, with
  claims checked unchanged after each refusal; the cross-incident test now uses I1's command code with the
  right role against another OPEN incident (I2), so only the incident comparison can refuse it.
  Source: Codex re-review of the C1 fix (only one new test failed on the old code; the cross-incident test
  stopped at the role check).
  Verified: with join.ts from 6c4dc21 (the parent of 406f97f) swapped in, 2 of 14 join tests fail (both
  legacy-doc tests); on HEAD all 63 emulator tests pass; ci-local exits 0.
- Firestore rules recompute every event's id: `eventIdOf(incidentId, request.auth.uid, seq)` with the same
  text framing as the engines (hashing.sha256 over decimal byte length, ":" and value per field) must start
  the document id, and seq must be a whole number of 0 or more. A member can no longer occupy another
  device's future event id, and an id derived from another seq, device or incident is refused. Event tests
  now write every event at its derived id (fixtures compute it independently with node:crypto).
  Source: Codex adversarial review H1 and the fresh-context review I2 (the earlier deviceId binding alone did
  not stop squatting; the 2026-11-18 rules entry above overstated it).
  Verified: the 3 new H1 tests failed first (squatting at a victim's seq-5 id succeeded), now 62 emulator
  tests pass; ci-local exits 0.
- Detection range is measured-first: the team's measured visual range sets the sweep width, and a stated
  (model-read) range is used only when the team has no measurement (`rdBasis` "stated"). Spec 10.4: "Sweep
  width always uses the visual detection range." A model-read number can no longer raise POD above a
  hidden-target measurement. Reference, vectors (160; new cases measured_range_beats_stated and
  stated_range_used_without_measurement replace stated_detection_range_basis_stated), README and the TS
  engine in one commit (vectors alone would turn the Engine job red).
  Source: fresh-context review, ruling sent to the coordinator, reversed on its decision.
  Verified: the new anchor failed first, now 14 generator tests pass; the TS vector case failed first, now
  155 engine tests pass; typecheck and lint exit 0.
- Change the eventId framing so the security rules can recompute it: SHA-256 over the UTF-8 string made of,
  per field (incidentId, deviceId, decimal seq), the decimal UTF-8 byte length, ":" and the value (example:
  ("ab", "c", 1) hashes "2:ab1:c1:1"); first 32 lowercase hex characters. eventSetHash and convergenceCode
  keep their binary framing. Reference generator, regenerated vectors (159; ids now include an epoch-ms seq
  case; the ("ab","c") vs ("a","bc") pair and the UTF-8 byte-length case stay), README and the TS engine
  change in ONE commit, because the vectors alone would turn the Engine job red on their own SHA.
  Source: Codex adversarial review H1 (a member could occupy another device's future event id), option 1
  approved by the orchestrator after an emulator probe showed rules can compute hashing.sha256 over this
  string; recorded in the design's coordinator decisions. The Swift and Kotlin twins follow against this SHA.
  Verified: new anchors (hand-computed hashes of "2:ab1:c1:1", "1:a2:bc1:1", the UTF-8 case and the
  epoch-ms case) failed first, now 13 generator tests pass; the TS suite failed on 7 id-dependent cases, now
  154 pass; typecheck and lint exit 0.
- Run the rules suite on per-worktree emulator ports: `scripts/emulator_config.py` writes a copy of
  firebase.json with absolute paths and a port block derived from the worktree path (20000 to 34999), and
  `npm run test:rules -w functions` passes it with `--config`. Several worktrees on one Mac run ci-local at
  the same time, and the fixed ports collided ("Could not start Authentication Emulator, port taken").
  Tests in `scripts/test_emulator_config.py`, added to the gates job and ci-local.
  Source: a ci-local failure caused by another worktree's emulators during the C1 commit.
  Verified: 3 tests failed first (no script), now pass; the emulator suite ran on ports 23910 to 23918 here
  and passed 59; ci-local exits 0.
- The drill seeding tool issues one join code per role (searcher, family, command), each stored in its own
  Keychain service (`pls-drill-searcher-code`, `pls-drill-family-code`, `pls-drill-command-code`, account =
  incident id), matching the one-role-per-code rule in joinIncident.
  Source: fresh-context review C1.
  Verified: the updated seed test failed first, now 5 pass; ci-local exits 0 (59 emulator tests).
- joinIncident admits exactly one role per code: a code doc must list a single role and the caller must ask
  for that role, so the searcher code can never grant family (read and write on profile/command, confirming
  sightings, clip uploads) or command. Tests use one code per role and add two cases: each code admits only
  its own role, and a code doc listing two roles is refused for both.
  Source: fresh-context review C1 (critical; the team code listed [searcher, family] and the caller chose
  the role).
  Verified: the multi-role test failed first, now the emulator suite passes 59; ci-local exits 0.
- Engines skip a malformed stored effect instead of throwing: the reference (`make_vectors.py`) and the TS
  engine (`isWellFormedEffect`, used by `toEngineEvents`; `malformedEventIds` lists them for a banner at
  command) check the same shape the rules now enforce. Eight new docToEngine vectors (cleared without
  inputs, pod as text, unknown rdBasis, unknown influence, empty influences, null effect, none without a
  reason, and a malformed event beside good ones), README rule added; 158 vectors in total.
  Source: Codex adversarial review H2 (engine side) and the fresh-context review I3; the Swift and Kotlin
  twins must mirror this (relayed through the orchestrator).
  Verified: the TS vector suite failed first on the new cases (6 cases plus the count check; one threw on
  `eff.inputs.coverage`), now 153 engine tests pass; generator anchors 12 pass; typecheck and lint exit 0.
- Firestore rules validate each stored effect variant (spec section 8): cleared needs exactly kind, segmentId
  (1 to 16 chars), pod (0 to 1) and inputs with exactly coverage (>= 0), sweepWidthM and trackLengthM (null or
  >= 0), areaM2 (> 0) and a known rdBasis; clue needs 1 to 64 influences with known values and a known
  authenticity; none needs a known reason and nothing else. Every other device applies a stored effect
  without re-deriving it, so a malformed one must never be stored.
  Source: Codex adversarial review H2 (rules side), verified by the orchestrator.
  Verified: 4 new emulator tests (17 malformed effects rejected, 3 well-formed accepted) failed first (3 of 4),
  now the suite passes 57; `bash scripts/ci-local.sh` exits 0.
- Add the ISRID ring prior (`shared/engine-ts/src/prior.ts`, `buildPrior`): ring layer by annulus area share
  (128-step rings, temperate flat or mountain column), the linear-feature layer (75% of grid mass near
  features, grid mass kept) and the direction wedge (2.045 inside 66 degrees, 0.395 outside, grid mass kept);
  ROW is the rest. Uses @turf circle, intersect, difference, area, bearing, helpers and centroid 7.4.0 (exact).
  Tests in `shared/engine-ts/test/prior.test.ts` with fixtures in `gridFixtures.ts`.
  Source: plan Task 10; spec section 10.5.
  Verified: the 7 prior tests failed first ("buildPrior is not a function"), now pass (engine suite 144);
  a mutation using the far share for near cells failed the linear test, then the restored file passed;
  Socket scores for the turf modules 84 to 100, `npm audit --omit=dev` finds 0; typecheck and lint exit 0.
- Add `docs/evidence/name-search.md`: the 2026-11-17 name search (no GitHub project named "Point Last Seen",
  closest an unrelated game; a site-scoped devpost.com search found no project).
  Source: plan addendum (rival self-audit, name search line); searches run by the orchestrator.
  Verified: text matches the orchestrator's recorded results; `bash scripts/ci-local.sh` exits 0.
- Add `docs/LIMITS.md` and `docs/PRODUCTION-CHECKLIST.md`, starting with the Android release rule: only the
  Play Integrity release APK is published, and `android/scan-apk.sh` must report 0 debug-token, token-resource,
  FIREBASE_APPCHECK_DEBUG_TOKEN and debug-provider hits on the exact signed APK (the debug APK reports 5).
  Source: lane D handover via the orchestrator.
  Verified: text matches the handover; no dashes or curly quotes; `bash scripts/ci-local.sh` exits 0.
- Run the seeding tool's tests in the `gates` job and in `ci-local.sh`.
  Source: CI mirrors every test suite in the repo.
  Verified: `bash scripts/ci-local.sh` exits 0 with the 5 seed tests in the gates pytest run.
- Add `tools/seed/seed_drill.py` (standard library plus the gcloud token): creates one synthetic training-drill
  incident (mode "drill", labelled "Training drill. Nobody is missing.", engine params copied from the
  constants), its teams, and the two admin-only join code docs (team code for searchers and family, separate
  command code). Codes are 8 Crockford symbols from `secrets`, stored only in the macOS Keychain, never
  printed; every write is create-only. Tests in `tools/seed/test_seed_drill.py`.
  Source: orchestrator go for one drill incident (lane D end-to-end test); plan Task 11 join design.
  Verified: 5 tests pass (code alphabet and length, hash equals join.ts normalization, labelled drill with no
  join hashes on the incident doc, role scopes, Firestore value encoding); rules gate clean.
- Storage rules: membership also reads the incident from Firestore (cross-service rules) and refuses an
  incident past its `expiresAt`, matching the Firestore rules. New test: an expired judge sandbox takes no
  clip upload; the storage tests now seed incident I1 first. Deploy note: the first deploy of cross-service
  storage rules grants Cloud Storage read access to Firestore (the CLI asks).
  Source: same commit security review finding (stale access after expiry).
  Verified: the new test failed first; now the full emulator suite passes, 53 tests; `bash scripts/ci-local.sh`
  exits 0. (The previous commit was checked with the emulator subset and ci-local ran after it, also green.)
- Firestore rules: claims outlive an incident, so membership now also needs the incident doc to exist and
  not be past its `expiresAt` (judge sandboxes), and a closed incident takes no new events or plans while
  staying readable to its members. New tests in `functions/test/rules/roles.test.ts`: expired sandbox locks
  members out of reads and writes, an unexpired sandbox works, a closed incident refuses events and plans,
  a member of a missing incident reads nothing.
  Source: automated commit security review of functions/src/join.ts (MEDIUM, stale access after close or
  expiry); fixed in rules rather than by revoking claims, so it holds even if a revocation step is missed.
  Verified: the new tests failed first (3 of 4; the unexpired case already passed); now the full emulator
  suite passes, 53 tests including the storage change in the next commit (Firestore files alone: 37).
- Add the `rules` CI job (`.github/workflows/rules.yml`): Temurin 21, firebase-tools 15.36.0, cached emulator
  jars, functions typecheck, then `npm run test:rules -w functions` (Firestore, Auth and Storage emulators,
  project demo-pls). Runs on pull requests to main and on main when rules, functions, firebase.json or the
  lockfile change; mirrored in `ci-local.sh`.
  Source: plan Task 11 step 4; orchestrator CI-minutes ruling.
  Verified: `bash scripts/ci-local.sh` exits 0 with the emulator suite (48 tests); action SHAs re-read with gh
  (cache v6.1.0 55cc834; checkout, setup-node, setup-java as already pinned).
  Correction to the joinIncident entry above: the join suite has 11 tests, not 14 (37 rules + 11 join = 48).
- Add the `joinIncident` callable (`functions/src/{join,index}.ts`, App Check enforced, us-central1) and its
  tests (`functions/test/join.test.ts`): request {incidentId?, joinCode, role, teamId?}, response
  {ok: true, incidentId}; codes normalized (case, spaces, hyphens) and looked up by SHA-256 in the admin-only
  joinCodes collection; the team code admits searchers and family, command has its own code; a searcher must
  name an existing team; closed or expired incidents and mismatched incident ids are refused with one
  message; claims set to {inc, role, team} (team null for command and family). No model call in any function.
  Source: plan Task 11; spec sections 7 and 14; lane D contract question 1 (code-only join).
  Verified: 14 join tests pass in the emulator, including one that drives the exported HTTP handler with
  no App Check token and gets 401 UNAUTHENTICATED, and a control that gets 400 for a malformed body;
  functions typecheck exits 0; the rules gate finds no model call under functions/.
- Add the Cloud Storage rules (`storage.rules`) and their emulator test (`functions/test/rules/storage.test.ts`):
  clips under clips/{incidentId}/ written by command or family, video only, at most 14,000,000 bytes (inline to
  AI Logic, base64 under the 20 MB request limit); photos JPEG at most 2 MB, read and written by command or
  family; no client writes packs; every path checks the incident claim.
  Source: plan Task 11; spec sections 7 and 12.1.
  Verified: under deny-all the allowed uploads failed; now 4 storage tests pass (13,000,000-byte clip allowed,
  15,000,000-byte clip denied); raising the cap to 16,000,000 failed the cap test, then the restored rule passed.
- Add the Firestore security rules (`firestore.rules`, spec section 7) and their emulator tests
  (`functions/test/rules/{events,roles,profile}.test.ts`, with `helpers.ts`, `fixtures.ts`, `vitest.config.ts`):
  membership from custom claims {inc, role, team}; events create only with the full 25-key EventDoc shape,
  identity binding (authorUid, role, incidentId, searcher team, and deviceId == auth uid so nobody can
  pre-create another device's event ids), serverTime == request.time, closed enums, rawText at most 2000,
  types by role, own-only retractions for non-command; profile split (profile/command for command and
  family only); plans create only by the approving command user; packs and planDrafts read only;
  photoReadings command only; device docs keyed by the device's auth uid under its own team; an admin-only
  `joinCodes` collection, and the incident doc may not carry join code hashes. Indexes file added empty.
  Source: plan Task 11; spec sections 7 and 13.2; red-team pass with the security-rules auditor checklist
  (event-id squatting, sizes, types); join-hash exposure finding (a 40-bit code hash readable by members).
  Verified: under deny-all rules the suite failed (17 denials); now 33 Firestore rules tests pass in the
  emulator; mutating events to allow update/delete failed 2 tests, then the restored rules passed.
## 2026-11-17

- Ignore `functions/lib/` (TypeScript build output of the functions workspace).
  Source: Task 11 build; the rules gate had walked the built JS as untracked files.
  Verified: `git check-ignore functions/lib` matches; `bash scripts/ci-local.sh` exits 0.
- Add the `@pls/functions` workspace (`functions/package.json`, `tsconfig.json`; lockfile updated):
  firebase-functions 7.4.0 and firebase-admin 14.5.1 at runtime; firebase 13.4.0 (client SDK, for rules tests
  with emulator mock tokens), TypeScript 6.0.3 and Vitest 5.1.0 for tests. Node 22 runtime, ESM.
  `@firebase/rules-unit-testing` is not used: 6.0.0 needs Node 24.12 or later and 5.x pins firebase 12.
  Source: plan Task 11.
  Verified: Socket scores (supply chain 94 to 98, vulnerability 100); `npm install` exit 0;
  `npm audit --omit=dev` finds 0; `bash scripts/ci-local.sh` exits 0.
- Add the `Engine` workflow (`.github/workflows/engine.yml`) with jobs `ts` (npm ci, engine typecheck, lint,
  tests) and `vectors-parity` (regenerate `search.json`, fail on `git diff`, run the engine vector suite), on
  every branch push touching shared/, tools/, the root package files or the workflow; mirrored in `ci-local.sh`.
  Source: plan Task 8 step 4.
  Verified: `bash scripts/ci-local.sh` exits 0 (137 engine tests, vectors current, 124 vector tests); action
  SHAs are the ones already pinned in ci.yml (checkout v7.0.1, setup-python v7.1.0) plus setup-node v7.1.0.
- Add `validateReading` (enums, limits and the segment count read from `report-reading.schema.json`, coverage
  normalized first, evidenceQuote must be in the report text, every reason returned) and `assignTeams` (greedy,
  stable, one segment per team, a team keeps its segment while it is in the top 2 x teamCount), with the plan's
  behaviour tests: duplicate ids, ROW through a clear, eventSetHash and priorVersion, validation, coverage
  normalization, sound-only, camera sighting as a prior input, and three assignment cases.
  Source: plan Task 8; spec sections 10.3, 10.7, 11.4; Review Focus items 3, 4 and 5.
  Verified: the tests failed before the modules existed; now 137 passed; typecheck and lint exit 0.
- Add the TypeScript search engine core (`shared/engine-ts/src`: pod and track length, IOC, posterior, ranking,
  effect derivation, `toEngineEvents`, event ids and hashes, evidence pre-screen) and the vector suite that runs
  every non-router case of `shared/test-vectors/search.json` through the one comparer (`test/expectVector.ts`).
  Source: plan Task 8; spec sections 8, 10.1 to 10.4; coordinator byte layouts for eventSetHash and convergenceCode.
  Verified: before the code existed the suite failed ("Cannot find module ../src/index"); now 124 passed
  (122 vectors plus the section-count checks); a mutation (unlisted clue entries as "for" instead of
  "neutral") failed 6 vectors, then the restored file passed; `tsc` typecheck and the unused-symbol lint exit 0.
- Add the shared TypeScript types (`shared/engine-ts/src/types.ts`): every schema document type named in the
  x-parity maps (EventDoc, ReportReading, RouteRecord, CameraSighting, PhotoCues, PlanDoc, Assignment,
  PlanWording, SharedProfile, CommandProfile, Grid, GridSegment, RouteGraph) plus the engine types
  (Effect, EngineEvent, PosteriorResult, RankedSegment, EffectContext, EngineParams, DraftAssignment).
  Source: plan Task 8; spec sections 7, 8, 9, 12, 13.
  Verified: `python3 -I scripts/check_schema_parity.py .` checks 13 TS types, 0 failures; strict `tsc` on the
  file exits 0; `bash scripts/ci-local.sh` exits 0.
- Add the `@pls/engine` workspace (`shared/engine-ts/package.json`, `tsconfig.json`) and the root
  `package-lock.json`. Pins: @noble/hashes 2.4.0 (runtime, synchronous SHA-256), typescript 6.0.3 and vitest
  5.1.0 (same as lane C), @types/node 22.20.5. Strict TypeScript with noUncheckedIndexedAccess.
  Source: plan Task 8 (TypeScript engine).
  Verified: Socket scores for all four (supply chain 98 to 100, vulnerability 100); `npm install` exit 0;
  `npm audit --omit=dev` finds 0; the 5 dev-only highs are one picomatch ReDoS via vite/vitest globs we
  control (accepted, same toolchain as lane C). `bash scripts/ci-local.sh` exits 0.
- Add the `android` CI job (`.github/workflows/android.yml`): lane D's snippet, Temurin 21,
  `./gradlew --no-daemon testDebugUnitTest assembleDebug`, on pull requests to main and on main only,
  triggered by `android/**` until android/ is on main (then widen to shared/**). Mirrored in `ci-local.sh`.
  Source: plan Task 19a; lane D handover; orchestrator CI-minutes ruling.
  Verified: action SHAs re-read with gh (setup-java v6.3.0 d1374f8, setup-gradle v6.4.1 8da46b5, both latest);
  `bash scripts/ci-local.sh` exits 0 (android skipped on main). Lane D reports the gradle command green locally.
- Narrow the `swift-core` trigger to `ios/PLSCore/**` until lane B's package is on main. With the shared
  paths, the next vector or constants change on main would have started a job with no package and failed.
  Widen to shared/test-vectors/** and shared/constants/** after the lane B merge.
  Source: self-review of a695a9c (same trap the workflow's own path had).
  Verified: `git diff` shows only the path list and comment; `bash scripts/ci-local.sh` exits 0.
- Add the `swift-core` CI job (`.github/workflows/swift.yml`): `swift test --package-path ios/PLSCore` in
  `swift:6.4.2-noble` pinned by index digest, on pull requests to main and on main only, path-filtered to
  ios/PLSCore, shared/test-vectors and shared/constants (not its own path, so it cannot run before
  ios/PLSCore lands). `ci-local.sh` runs it when ios/PLSCore exists.
  Source: plan Task 9a; orchestrator CI-minutes ruling (expensive suites on PR to main and main only).
  Verified: tag resolved with `docker buildx imagetools inspect swift:6.4.2-noble`; checkout SHA reused from
  ci.yml; lane B reports the same suite green in swift 6.4.2 on Linux; `bash scripts/ci-local.sh` exits 0 here.
- Point the schema parity map at lane D's Kotlin files: `data/EventDoc.kt` (EventDoc, RouteRecord),
  `core/CameraSighting.kt` (CameraSighting), `data/Profiles.kt` (SharedProfile, CommandProfile); drop the
  Android mapping for ReportReading (no Kotlin type planned).
  Source: lane D contract question 7.
  Verified: parity dry run against origin/lane-android: CameraSighting, RouteRecord and both profiles pass;
  EventDoc reports missing schemaVersion and serverTime (lane D to add). Main has no android/ yet, so
  `bash scripts/ci-local.sh` exits 0.
- Add route reason `sdk_fallback` to `shared/schemas/route-record.schema.json` (PREFER_ON_DEVICE answered from the cloud).
  Source: lane D contract question 3 (Android RouteRecord reasons); lane D maps its other reasons to
  `on_device_unavailable` and `sdk_only_in_cloud`.
  Verified: schema parses; `python3 -I scripts/check_schema_parity.py .` and `bash scripts/ci-local.sh` exit 0.
- Enable anonymous sign-in as code: `firebase.json` gains `auth.providers.anonymous: true`.
  Source: plan Task 0 step 3; spec section 14 (anonymous sign-in, claims set by joinIncident).
  Verified: `firebase deploy --only auth --project buildhybridai-2026-yg3m` printed
  "Auth providers enabled: anonymous"; the Identity Toolkit admin config read back
  `signIn.anonymous.enabled: true` (HTTP 200).

## Before this changelog (2026-11-17)

- bf6e729: repo bootstrap (Apache-2.0, first CI job `gates`, rules gate, gitleaks, freeze hooks).
- e909409: schemas, constants, shared test vectors (148 cases) and the schema parity check.
- 0ff9f27: iOS model builders move to ModelSessionFactory.swift and AIClient.swift in the rules gate.
- 861ec6a: a command confirmation outranks a later family one (two new vectors).
