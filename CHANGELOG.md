# Changelog

Lane A: shared/, tools/, functions/, root rules and config, scripts/, .github/, docs/.
Newest first. Each entry gives what changed, its source and how it was verified.

## 2026-11-18

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
