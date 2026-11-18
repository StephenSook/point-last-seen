# Changelog

Lane A: shared/, tools/, functions/, root rules and config, scripts/, .github/, docs/.
Newest first. Each entry gives what changed, its source and how it was verified.

## 2026-11-18

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
