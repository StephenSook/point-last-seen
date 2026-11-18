# iOS changelog

Lane B owns `ios/`. Each commit adds one entry here: what changed, its source (plan task or
finding) and how it was verified. Newest first.

## 2026-11-18

### fix(ios): settle unresolved reports on reconnect and foreground, never leave them stuck
- What: `EventStore` now talks to an `EventServer` protocol (`FirestoreEventServer` in the app,
  a scripted fake in tests). Unresolved entries are settled at launch, on every offline-to-online
  change and on return to the foreground. An event the server does not hold and Firestore no
  longer queues becomes "Not delivered" and retryable (reason `not-on-server`); our own
  still-queued write and no answer leave an entry as it is. A Retry with no signal keeps the
  entry retryable with its first reason and tells the person to retry in signal. A payload that
  will not encode is rejected as `encode-failed`; a journal write error is shown, not swallowed.
  `AppModel.start()` runs once.
- Source: fresh-eyes review C2 (three stuck paths), I10 and M9.
- Verified: five `EventStoreStateTests` with the fake server. The two that pin the old defects
  (an absent entry after a restart; a retry while offline) failed with the old reconcile and
  retry logic put back, then passed; 21 app tests pass on the iOS 27.2 simulator.

### fix(ios): a read-back that sees our own queued write is not a delivery
- What: new `ServerCopy.stillQueued` and `ServerCopy.fromServerRead(local:exists:hasPendingWrites:server:)`.
  A server-source get in firebase-ios-sdk 13.2.0 answers through the local view, so a snapshot
  with `hasPendingWrites` is our own event still waiting in Firestore's queue; it now leaves the
  Outbox entry as it is instead of marking it "Delivered". `EventStore.readBack` passes the
  snapshot's `exists` and `hasPendingWrites`.
- Source: fresh-eyes review C1 (cec3596..e88bb30), checked against
  `Firestore/core/src/api/document_reference.cc` in the 13.2.0 checkout.
- Verified: two new tests (classification; a still-queued answer leaves the entry pending) red
  without the case, then green; 192 tests; app builds. The restart race itself is device
  acceptance.

### feat(ios-core): add the per-report timing record
- What: `ReadMeasurement` holds `submittedAtMs`, `readDoneAtMs` and `redrawnAtMs` (the spec's
  three fields), the read and redraw durations, and its path
  `incidents/{incidentId}/teams/{teamId}/devices/{uid}/measurements/{eventId}`.
- Source: Task 13 (write the three timings after the redraw), spec section 7, lane A's rules
  contract (device docs under the writer's own uid).
- Verified: `MeasurementTests` red without the type, then green; full suite 190 tests.

### feat(ios-core): build the undo event as a retraction of the searcher's own report
- What: `ReadOutcomeBuilder.retraction(of:authorUid:deviceId:seq:clientTimeMs:)` makes a
  `retraction` event that targets the report (effect none/informational, no text, no reading, no
  route), and refuses another author's event; `canUndo` keeps the echo card's Undo to 5 s. The
  engine then drops the report.
- Source: Task 13 (ReportEchoView: 5-second undo, a retraction), spec section 8, lane A's rules
  (searchers retract own events only).
- Verified: three `RetractionTests` red without the API, then green; full suite 189 tests.

### feat(ios-core): read the pack's segments into the grid and the prior
- What: `PackSegments.parse` turns `pack-segments` documents into the grid (segmentId code-point
  order, `geometryJson` parsed as a GeoJSON Polygon string, `centroid` {lat, lon}) and the
  engine prior (grid segments in that order, then ROW last from its own document). A pack with no
  ROW document, a broken segment (named in the error) or mixed prior versions is refused.
- Source: Task 12b (PackLoader), lane A's pack rulings (ROW never computed as one minus the
  rest, geometryJson string, centroid shape).
- Verified: four `PackSegmentsTests` red without the type, then green; full suite 186 tests.

### feat(ios-core): add the approved plan and its per-team assignment
- What: `PlanDoc` and `Assignment` with the field names of `shared/schemas/plan.schema.json`
  (all keys encoded, nulls written out); `assignment(for:)` gives a team its segments. The phone
  takes its current assignment from the latest approved plan in the pack (lane A's pack ruling).
- Source: Task 12b/16b (phone reads the plan), lane A's parity map (Plan.swift#PlanDoc and
  #Assignment).
- Verified: two `PlanTests` (decode and look up a team; encoded keys equal the schema's required
  list) red without the type, then green; `check_schema_parity.py` passes; full suite 182 tests.

### feat(ios): add the field screen with the Report bar and the echo card
- What: `AppModel` holds the phone's state and its one action, `send`: a location fix (10 s),
  the report read through `ReportReader` with the live gate, the next sequence number, the event
  from `ReadOutcomeBuilder`, then `EventStore.append` (never awaited). `TaskView` shows "Training
  drill. Nobody is missing.", the assignment and "Your assignment changes only when command
  approves.", the 120 pt Report bar (it focuses the field; the keyboard's microphone key does
  dictation, the app calls no speech API), Send, and the sent reports. `ReportEchoView` shows
  the raw text, the effect line, the route line and the delivery badge with Retry;
  `EvidenceProtocolView` shows "Do not touch. Hold the line. Call it in." and "Not sent to any
  model." The Ready check now shows the real pack state, the model state, the location request
  and the cloud consent switch. With no pack loaded the field screen says so and reads nothing.
  `Mission` is what a loaded pack will give the phone (the pack loader is Task 12).
- Source: Task 13 (TaskView, ReportEchoView, EvidenceProtocolView), spec section 6.2.
- Verified: app builds; 16 app tests pass; on the iOS 27.2 simulator the field screen shows the
  no-pack state and the Ready check's accessibility tree lists the real lines. The send path
  needs a pack and is device acceptance (Task 13 step 5).

### fix(ios): never record an empty on-device model name
- What: when Apple's model reports an empty variant name (the iOS 27.2 simulator does), the
  status uses "Apple on-device model", so the route record and the Ready check always name it.
- Source: found on the simulator: the Ready check showed "ready ()".
- Verified: `OnDeviceStatusTests` failed on the simulator before the fix, then passed; 16 app
  tests pass.

### feat(ios): hold the live cloud gate in a lock-protected box
- What: `LiveGateBox` keeps the current `LiveGate` (connectivity, consent, kill switch,
  incident mode) behind a `Mutex`, so PLSCore's orchestrator can read it from any thread at the
  moment of a cloud dispatch while the app updates it on the main actor.
- Source: Codex review H1 follow-through (the app side of the live gate).
- Verified: `LiveGateBoxTests` (latest value read from a detached task) red without the type,
  then green on the iOS 27.2 simulator; app builds with only this commit's files.

### feat(ios-core): add the words on the report echo card
- What: `EchoText` gives the card's lines: "Cleared AC. Coverage 0.8. POD 55%."; a clue's
  segment; what to do for each "none" reason ("Calling alone is not counted for this person.",
  "Ask command."); the delivery badge ("On this phone only", "Delivered", "Not delivered.
  Retry"); and the route ("Suggested by Apple's on-device model on this iPhone", "Read by rules,
  not a model", "Not sent to any model."). The iOS route is never described as SDK-reported.
- Source: Task 13 (ReportEchoView, EvidenceProtocolView), spec sections 9 and 10.4, UI copy
  rules (every model output is "Suggested").
- Verified: four `EchoTextTests` red without the type, then green; full suite 180 tests.

### fix(ios-core): match lane A's regenerated vectors (eventId framing, measured range first)
One commit for two changes: the shared `search.json` carries both, so no tree with only one of
them passes the Swift suite in `scripts/ci-local.sh`.

- eventId text framing. What: `EventID.make` hashes the UTF-8 text
  frame(incidentId) + frame(deviceId) + frame(decimal seq), frame(s) = decimal byte length, ":",
  s, and keeps the first 32 hex characters; ("ab", "c", 1) hashes "2:ab1:c1:1". The Firestore
  rules can recompute this form. `eventSetHash` and `convergenceCode` keep the binary framing.
  Source: lane A ae8446e (coordinator decision). Verified: all 7 eventId vector cases and the
  new `epoch_ms_seq` case failed on the old framing, then passed; unit-test reference values
  recomputed independently in Python.
- Detection range measured first. What: the team's measured `visualDetectionRangeM` (with its
  `rdBasis`) is used when present; a range stated in the report is used only when nothing was
  measured, with basis "stated". Source: lane A 73632e9. Verified: vector
  `measured_range_beats_stated` and the new unit test failed on the old rule, then passed.
- Both: 160 of 160 vector cases, full suite 176 tests.

### feat(ios): get one location fix with a timeout
- What: `LocationProvider` asks Core Location for one fix (`requestLocation`) and returns nil on
  error, without permission, or after the timeout (30 s by default until spike S-GPS measures
  the site). With no fix the report takes its segment from the team's assignment.
- Source: Task 13 (LocationProvider), Review Focus 1, spike S-GPS (timeout to be measured).
- Verified: app builds with only this commit's files. Behaviour in airplane mode is device
  acceptance (spike S-GPS), on the morning list.

### feat(ios): feed the network path into the router's connectivity
- What: `ConnectivityMonitor` starts an `NWPathMonitor` and feeds the path, plus request
  failures and successes, into PLSCore's `Connectivity`. `isOnline` is the router's
  `networkOnline`: a satisfied path and no transport failure in the last minute since the last
  success, so joined Wi-Fi with no internet counts as offline.
- Source: Task 13; self-audit item (record how iOS `networkOnline` is computed).
- Verified: app builds with only this commit's files; the rule itself is `ConnectivityTests`
  in PLSCore (including the failed-request case).

### feat(ios): use the auth uid as device id and epoch-millisecond sequence numbers
- What: `DeviceIdentity` gives the anonymous Firebase Auth uid as the event device id (the
  create rule checks `deviceId == request.auth.uid`) and the next sequence number from
  `SeqAllocator` in Application Support.
- Source: lane A's security-rules contract (points 1 and 2), Task 13 (DeviceIdentity).
- Verified: app builds for the simulator with only this commit's files; the allocator's own tests
  cover the numbering. A reinstall check is on the morning device list.

### feat(ios): write events through the Outbox with a server read-back
- What: `EventStore` journals each event, then calls `setData` with its completion callback and
  never awaits it (the callback does not run while offline). Success marks the entry delivered;
  an error reads `events/{eventId}` back from the server first: same identity is delivered,
  absent is "Not delivered" and retryable, a different identity is an id conflict, no answer
  waits as checking. Retry reads back before writing again. After a restart or reconnect,
  unresolved entries are settled from the server. The payload has all 25 keys, integer `seq`
  and `FieldValue.serverTimestamp()` in `serverTime`.
- Source: Task 13 (EventStore), spec sections 6.2 and 11.1, lane A's rules contract.
- Verified: `EventStorePayloadTests` (25 keys, server timestamp, integer seq, identity from a
  Firestore dictionary) red without the type, then green on the iOS 27.2 simulator. The offline
  and kill-before-callback runs are device acceptance (Task 13 step 5), on the morning list.

### fix(ios-core): check every stored effect against its exact shape before use
- What: `EffectShape.isValid` checks a stored effect exactly as the create rule and the shared
  vectors do (cleared: exact keys, pod 0 to 1, inputs with coverage at least 0, sweep and track
  null or at least 0, area above 0, a known rdBasis; clue: one or more known influences and a
  known authenticity; none: a known reason; null is malformed). `EventFilter.decode` skips and
  flags any event that fails it, and the vector harness now decodes docToEngine events one by
  one, as the app does.
- Source: lane A 6c4dc21 (malformed_* docToEngine vectors), relayed by the orchestrator.
- Verified: 8 malformed vector cases failed before (whole-array decode errors, an empty
  influence map applied), then passed; 158 of 158 vector cases; 3 new `EffectShapeTests`;
  full suite 175 tests.

### feat(ios-core): turn events into Firestore values and read the server identity
- What: `JSONValue.firestoreValue` gives Foundation objects for a write: whole numbers as
  integers (the rules require `seq` to be an int), fractions as doubles, null as `NSNull`.
  `EventIdentity(json:)` reads deviceId, seq, authorUid and clientTimeMs from a server copy, so
  the Outbox can tell "already delivered" from "a different event".
- Source: Task 13 (EventStore read-back), lane A's rules contract (seq int).
- Verified: two `FirestoreValueTests` red, then green; full suite 172 tests.

### feat(ios-core): allocate event sequence numbers from epoch milliseconds
- What: `SeqAllocator` starts a fresh install at the current epoch milliseconds and counts up by
  one, persisting each number before handing it out. A reinstall keeps the anonymous uid (the
  Keychain survives) but loses this file, so starting from the clock means it can never reuse an
  event id that already exists on the server.
- Source: lane A's security-rules contract (deviceId is the auth uid; seq must not repeat after
  a reinstall).
- Verified: three `SeqAllocatorTests` (fresh start, restart continues even with a clock moved
  back, a failed write does not use the number) red, then green; full suite passes.

### feat(ios-core): skip and flag a malformed stored event instead of throwing
- What: `EventFilter.decode` reads stored events one by one; one that does not decode (for
  example a clear with no inputs) is skipped and its id listed in `malformedIds` for command,
  while the rest go on to the engine.
- Source: lane A's security-rules review, relayed by the orchestrator.
- Verified: the new test (a good clear, a clear with no inputs, a document with no id) failed
  without `decode`, then passed; full suite 167 tests.

### test(ios-core): match the shared comparer rule at zero and relative to the expected value
- What: the test comparer uses an absolute 1e-12 when the expected value is 0 and a tolerance
  relative to the expected value otherwise, as `shared/test-vectors/README.md` states. Before,
  it was stricter at zero (relative to the larger operand), which could fail a correct engine.
- Source: found while fixing Codex review M9; shared vectors README.
- Verified: the new test failed on the old comparer (1e-13 against 0), then passed; 150 vector
  cases pass; full suite 166 tests.

### test(ios-core): the vector comparer rejects infinity and NaN
- What: the test comparer now fails any non-finite number. Before, an infinite result matched
  a finite expected value, because the error and the tolerance were both infinite.
- Source: Codex review M9.
- Verified: the new test failed on the old comparer (no error thrown for infinity), then passed;
  all 150 vector cases still pass; full suite 165 tests.

### fix(ios-core): encode all 25 event keys, nulls written out
- What: `EventDoc` has an explicit encoder that always writes the 25 keys of
  `shared/schemas/event.schema.json`, with nil as null. The synthesized encoder left out nil
  fields (`position`, `observedAtMs`, `targetEventId`, `decision`, `planVersion`, ...), which the
  schema and the create rule require.
- Source: Codex review M8; lane A's rules contract (all 25 keys present and nothing else).
- Verified: a test that reads the schema's required list failed on the old code (missing keys,
  no nulls), then passed; a round-trip test; full suite 164 tests.

### fix(ios-core): a sighting records when it was seen, not when it was sent
- What: `observedAtMs` on a sighting comes from the app's time picker (new
  `OutcomeContext.observedAtMs`), else from "N minutes ago" or "an hour ago" in the report
  (`ReportParser.minutesAgo`), else stays nil so the app asks. Before, it copied the send time.
- Source: Codex review M7; spec section 8 ("when the thing was seen; sightings need it").
- Verified: the new test failed on the old code (all five expectations), then passed; full suite
  162 tests.

### fix(ios-core): read "calling only, no visual search" as sound only
- What: in the parser's method check, a method word right after a negation word ("no visual",
  "without looking") does not count, and "only" or "just" next to a sound word makes the method
  sound. So a sound-only clear gets effect none/sound_only instead of about 63% POD as "both".
- Source: Codex review M6; spec section 10.4.
- Verified: new tests failed on the old code (the sentence parsed as both and the clear
  counted), then passed; "no calling, looked everywhere" stays visual; full suite 161 tests.

### fix(ios-core): keep the minus sign so a negative coverage is rejected
- What: the tokenizer keeps a minus sign that starts a number (not one after a letter, as in
  "AC-2"), and the number reader accepts it, so "coverage -0.8" stays -0.8 and normalization
  calls it invalid. Before, it became a valid 0.8 and gave about 55% POD. The permissive line
  ("cleared|AC|-0.8") uses the same tokenizer.
- Source: Codex review M5; spec section 10.3 ("anything else is invalid").
- Verified: three assertions failed on the old code, then passed; a guard that "AC-2" still
  splits as before; full suite 159 tests.

### fix(ios-core): a different event under an existing Outbox id is a conflict
- What: `Outbox.add` throws `Outbox.Conflict` when a different event arrives under an id the
  journal holds, and changes nothing; the identical event stays an idempotent retry. Before, the
  second report was dropped silently and still showed the first one's state.
- Source: Codex review M4.
- Verified: the new test failed on the old code ("an error was expected but none was thrown"),
  then passed; full suite 158 tests.

### fix(ios-core): the Outbox writes to disk before it changes memory
- What: `add` and every state change build the new entry list, write it atomically, and only
  then publish it in memory. Before, a failed journal write left the entry in memory, so the
  next `add` of the same event returned success without writing and the event was lost on
  restart.
- Source: Codex review M3.
- Verified: two new tests (a plain file blocks the journal folder during `add`, then during
  `markAcked`) failed on the old code, then passed; full suite 157 tests.

### fix(ios-core): an unknown named segment is rejected, never cleared as the assignment
- What: the parser keeps an unknown two-letter id that follows "segment" (unless it is a common
  word such as "by" or "in"), and the outcome builder adds such an id back when a model left it
  out, so "cleared segment ZZ, coverage 1" gives effect none/invalid instead of clearing the
  team's assigned segment. The assignment is used only when the report names no segment.
- Source: Codex review H2, verified by the orchestrator; plan Review Focus 3.
- Verified: new parser and builder tests (parser path and model path) failed on the old code,
  then passed; "the segment by the creek" still names nothing; full suite 155 tests.

### fix(ios-core): check the cloud gate live at dispatch, keep the context-limit reason
- What: the orchestrator reads a live gate (connectivity, consent, kill switch, incident mode)
  again when it reroutes and right before any cloud call; if the gate closed during the
  on-device call, the report goes to the parser, not the cloud. A context-limit failure now
  reroutes as `over_token_budget` instead of `on_device_unavailable`. `ReportSituation` gains an
  optional `liveGate` that `ReportReader` passes through.
- Source: Codex review H1 (gpt-6.2-sol, 11664c5..cec3596), verified by the orchestrator.
- Verified: three new tests (kill switch flipped mid-call; signal lost or consent withdrawn
  mid-call; context limit keeps its reason) failed on the old code with the cloud actually
  called, then passed; full suite 152 tests; app builds.

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
