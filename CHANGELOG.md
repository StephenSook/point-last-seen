# Changelog

Lane A: shared/, tools/, functions/, root rules and config, scripts/, .github/, docs/.
Newest first. Each entry gives what changed, its source and how it was verified.

## 2026-11-18

- Merge point 1, lane C: merge main into lane-web on `merge/lane-web-1`. The only conflict was
  `package-lock.json` (lane-web added the web workspace, main added tools/grid-builder and moved the functions
  test toolchain to the root). npm's own conflict resolver crashed (arborist "edgesOut"), so the lockfile was
  merged as JSON three ways from the merge base 2bc711c: no key changed on both sides; every entry from both
  parents kept its version.
  Verified: `npm ci` accepts the merged lock; `bash scripts/ci-local.sh` exit 0 in the integration worktree with
  CI's placeholder web config (166 engine, 134 vector, 85 emulator and 211 web tests; web build).
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
