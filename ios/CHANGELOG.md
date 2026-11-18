# iOS changelog

Lane B owns `ios/`. Each commit adds one entry here: what changed, its source (plan task or
finding) and how it was verified. Newest first.

## 2026-11-18

### feat(ios): wire the report reader to the models, tools and Remote Config defaults
- What: `ReportReader.read(_:situation:)` builds the three tools, reads the on-device status
  and the token estimate, and runs PLSCore's `ReadOrchestrator` with the real runner; it never
  throws. `RemoteConfigValues.defaults` holds the spec's iOS keys (`cloud_model_ios`
  gemini-3.5-flash-lite, `token_budget_fraction` 0.5, `kill_cloud` false,
  `use_limited_use_tokens` true).
- Source: Task 13 (ReportReader), spec section 14.
- Verified: `ReportReaderTests` (evidence text ends at the protocol with model "none"; outside a
  drill the parser reads "point eight" as 0.8; defaults) red without the types, then green; 12
  app tests pass on the iOS 27.2 simulator.

### feat(ios): route reports between Apple's on-device model and Gemini through AI Logic
- What: `AIClient` builds the one `FirebaseAI.firebaseAI(backend: .googleAI(),
  useLimitedUseAppCheckTokens:)` client. `ModelSessionFactory` is the only file that touches
  `SystemLanguageModel` and `geminiLanguageModel(name:)`: on-device status (availability,
  locale, `contextSize`, variant name), prewarm, token estimate, and the map from thrown errors
  (`LanguageModelError`, `SystemLanguageModel.Error`, `GeminiLanguageModel.Error`,
  cancellation, URL and decoding errors) to `ReadFailure`. `FoundationModelRunner` runs a new
  session per report: guided on either route, permissive string output on the on-device model
  only.
- Source: Task 13 (ModelSessionFactory, AIClient), spike S15 settled names, rules gate allowlist.
- Verified: `ModelFailureMappingTests` red without the factory, then green on the iOS 27.2
  simulator; rules gate clean.

### feat(ios): add the three read-only report tools
- What: `SegmentAtTool` ("segmentHere": the segment under the GPS fix, or "No GPS fix. Do not
  guess a segment."), `TeamAssignmentTool` ("teamAssignment") and `SubjectProfileTool`
  ("subjectDescription", which returns only `ModelProfile.toolText`). All run in our process;
  none returns a health or behaviour field.
- Source: Task 13 (tools), spec section 9; spike S15 (tools must not list every segment id).
- Verified: `ToolsTests` (three cases, including a profile with dementia type and flags that
  must not appear) red without the tools, then green on the iOS 27.2 simulator.

### feat(ios): add the Generable report reading and the neutral prompt
- What: `ReportReadingG`, the `@Generable` twin of `ReportReading` used on both routes (no
  pattern guides, which Gemini rejects; optional coverage so "not stated" stays visible), with a
  total mapping to the core types; `ReportPrompt` (version `pls-report-v1`) with neutral words,
  "point eight is 0.8", "list only ids the report names", and the one-line permissive format.
- Source: Task 13; spike S15 (the model read "point eight" as 1.0 and copied tool ids).
- Verified: `ReportReadingGTests` (field mapping, every core enum value reachable) red without
  the type, then green; app builds for the simulator with only this commit's files.

### feat(ios-core): add the appearance-only profile a model may see
- What: `ModelProfile` takes a `profile/shared` document and keeps exactly six fields
  (clothingLastWorn, appearance, heightFt, heightIn, hair, mobilityAids); `toolText` is what
  `SubjectProfileTool` returns. Names, age, weight, dementia type, flags and approach notes are
  dropped.
- Source: spec section 13.2 (profileForModel), Task 13 (SubjectProfileTool), Task 21b
  (`cloudPromptHoldsOnlyNamedFields`, tool-output half).
- Verified: three `ModelProfileTests` (key set, no health or behaviour words, empty profile)
  red, then green; full suite 149 tests.

### feat(ios-core): classify Gemini route failures, App Check refusal included
- What: `CloudFailure.classify` maps the Gemini error case and HTTP status to a `ReadFailure`:
  401 or 403 is `app_check_refused`, network and 503 are `network`, a bad response is
  `parse_failed`, anything else `other`. The app reads the case from `GeminiLanguageModel.Error`,
  whose initializers are internal, so this pure part is what can be tested.
- Source: Task 13; firebase-ios-sdk 13.2.0 `GeminiErrorMapper.swift`.
- Verified: `CloudFailureTests` red, then green; full suite 146 tests.

### feat(ios-core): add the read orchestrator and the tolerant permissive-line parser
- What: `ReadOrchestrator.read` runs one report end to end behind a `ReadModelRunner`
  protocol: evidence screen and drill/judge gate first, then the route decision, guided
  generation, the permissive string stage, the deterministic parser and the pick-list. An
  invalid model reading falls to the parser; a guardrail block or refusal never reaches the
  cloud; a model that is not ready may reroute. It writes our own route record (never
  SDK-reported). `PermissiveLine` reads "cleared|AC|0.8" and "KIND: cleared, SEGMENTS: AC"
  forms. `ReadFailure` is now an `Error`.
- Source: Task 13 (ReportReader), spike S15 (the permissive stage ignored the fixed format).
- Verified: 11 new tests with a scripted fake runner that records every model call failed
  first, then passed; full suite 146 tests (the commit's own files only).

### build(ios): add the XcodeGen app shell
- What: `ios/project.yml` (bundle `app.pointlastseen.field`, iOS 27.0, firebase-ios-sdk 13.2.0
  exact with FirebaseAILogic, FirebaseAppCheck, FirebaseAuth, FirebaseFirestore,
  FirebaseRemoteConfig; MapLibre 7.0.0 exact; local PLSCore), the location usage string, the
  export flag, the App Attest entitlement; `PLSApp` (App Attest in release, debug provider only in
  debug builds, unlimited Firestore cache, anonymous sign-in); a first Ready check screen; the
  shared constants bundled into the app with a loader; a `PLSTests` target. The generated
  `PLS.xcodeproj`, `Info.plist`, entitlements file and `GoogleService-Info.plist` stay untracked.
- Source: Task 12b step 5.
- Verified: `xcodebuild build` for `generic/platform=iOS Simulator` and (unsigned)
  `generic/platform=iOS` both succeed; `xcodebuild test` on an iPhone 17 Pro simulator (iOS 27.2)
  runs 2 tests, which failed first without the loader and then passed.

### fix(ios-core): drop segment ids the report never names
- What: before validation, a known segment id that the report text does not name (capital
  letters, or after "segment") is dropped; with none left the clear uses the team's assignment.
  An unknown id is kept, so the validator still rejects the reading.
- Source: spike S15 on the Mac (AFM 3 Core Advanced): the on-device model returned
  `["AA","AB","AC"]`, copied from the tool's list, for reports naming one segment or none.
- Verified: three new `ReadOutcomeTests` failed first, then the whole suite passed (134 tests,
  150 vector cases).

### docs(ios): start the iOS changelog
- What: this file, with a summary of the commits pushed before it.
- Source: commit rules (one change per commit, a changelog entry in each).
- Verified: `git show HEAD:ios/CHANGELOG.md` contains this heading.

## 2026-11-17 (pushed before this file)

- `a1ef079` feat(ios-core): PLSCore, the Swift twin of the search engine: search math, posterior,
  ranking, effects, event filter, reading validator, event ids and hashes, point in polygon,
  evidence pre-screen, router policy. Source: Task 9. Verified: `swift test` on macOS and in the
  `swift:latest` (6.4.2) Linux image.
- `dce3985` fix(ios-core): evidence words fail closed (apostrophes split words, accents folded),
  retractions and confirmations checked by role, a stored clear must agree with itself.
  Source: commit security review. Verified: new failing tests, then green.
- `53a090d` feat(ios-core): pack status and clock offset for the Ready check. Source: Task 12b.
  Verified: `PackStatusTests`.
- `17f2f7e` feat(ios-core): six lightness classes and the printed percent for the map.
  Source: Task 14. Verified: `PoaClassTests`.
- `81123f1` feat(ios-core): match the shared vector contract (context shape, stated range,
  latest confirmation, no cap on computed coverage, silent repeats). Source: Task 7 vectors.
  Verified: 148 of 148 vector cases.
- `ddc1150` feat(ios-core): report parser, read plan (drill or judge gate, evidence first),
  outcome builder, Outbox journal, connectivity (`networkOnline`). Source: Task 13 and the
  self-audit item on `networkOnline`. Verified: plan tests plus new ones.
- `82b5e02` test(ios-core): every shared vector case runs through the Swift engine; a missing
  file fails, never skips. Source: Task 9. Verified: 148 of 148.
- `6e317b8` fix(ios-core): phone numbers scrubbed from every stored reading string, in any
  script or spoken as digit words. Source: commit security review. Verified: `PhoneNumbersTests`
  on macOS and Linux.
- `a9c8701` fix(ios-core): a command confirmation outranks the family's. Source: security
  review, adopted by lane A in 861ec6a. Verified: 150 of 150 vector cases.
