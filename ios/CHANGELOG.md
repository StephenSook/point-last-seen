# iOS changelog

Lane B owns `ios/`. Each commit adds one entry here: what changed, its source (plan task or
finding) and how it was verified. Newest first.

## 2026-11-19

### fix(ios): after sign-in, the mission follows the token's claims read fresh from the server
- What: resuming trusted the cached ID token and ran only when no mission was loaded, so a
  searcher command moved from T1 to T2 kept T1's mission and assignment. After every sign-in (at
  launch, and when signal returns) the claims are now read with a forced refresh, falling back to
  the cached token only when the refresh fails (no signal). The mission follows them: unchanged
  claims change nothing, a new team loads that team's mission, and claims that no longer name a
  searcher's incident drop the mission and stop its plan listener.
- Source: review.
- Verified: two tests (the claims are refreshed after sign-in and the cached token answers when
  the refresh fails; a team change loads the new team and a lost searcher role drops the mission
  and its listener) failed to compile, then passed; 91 app tests pass; the CI mirror
  `bash scripts/ci-local.sh` exit 0.

### fix(ios): a slow earlier mission load never replaces a newer join
- What: a load started at launch for the token's team could finish after a join for another team
  and replace that mission, so reports would go out under the old team. Every join and load now
  takes a generation number; a load installs its mission only if no newer join or load started
  while it read, and a superseded launch load leaves the join's words alone.
- Source: review.
- Verified: a test holds the launch load for T1 open, joins T2, then lets the T1 read finish; T1
  replaced T2 on the old code (failed), T2 stays now (passes); 89 app tests pass; the CI mirror
  `bash scripts/ci-local.sh` exit 0.

## 2026-11-18

### feat(ios): a plan command approves after the mission loads reaches the phone
- What: once a mission loads, the phone listens for the incident's latest approved plan (highest
  version). A plan that changes this team's assignment updates the task and its segments and goes
  through `load`, so the new assignment is spoken once; the same plan again says nothing, and a plan
  with no task for this team clears it without speaking. Loading another mission stops the old
  listener.
- Source: plan task, loading a mission on the iPhone (an approved plan did not reach a loaded phone).
- Verified: two tests (a newer plan changes and speaks the assignment once, a repeat is silent, a
  plan for another team clears it, a plan for another incident is ignored; a second mission stops
  the first listener) failed to compile, then passed; the CI mirror `bash scripts/ci-local.sh`
  exit 0; 88 app tests pass.

### fix(ios): remove phone numbers before a report reaches any model, not only before it is stored
- What: the iPhone removed phone numbers only from what it stored, so the on-device model, the
  cloud model and the token count (also a call into Apple's model) were handed the report with
  the number in it, while SECURITY.md and LIMITS.md say numbers are removed before any prompt.
  `ReadOrchestrator.read` now removes them first, before its first model call on either path, and
  the report reader counts tokens on the scrubbed text.
- Source: the film fact-sheet audit (docs say "before any prompt").
- Verified: two tests (the text every model call receives carries "[number removed]" and no digits
  of the number; the token counter sees the scrubbed text) failed on the old code, then passed;
  274 core tests and 86 app tests pass; the CI mirror `bash scripts/ci-local.sh` exit 0.

### feat(ios): a join section on the Ready check while no mission is loaded
- What: until a mission is loaded, the Ready check opens with "Join your team": the join code,
  the team (for example T1), the incident id folded away for when command gives one, a Join
  button and the result in words. The task screen's empty state now says "No mission loaded" and
  "Join your team at the Ready check before you leave signal.", which is what the app can now do.
- Source: plan task, joining an incident on the iPhone.
- Verified: a test pins the empty state's hint and the join section's labels; it failed to
  compile, then passed. On the simulator the section showed on the Ready check, and a three-letter
  code answered "The join code has 8 letters and numbers." with no call made. Every line is
  Title 3 or larger (the field text size check caught the first draft's body-size message). The CI mirror
  `bash scripts/ci-local.sh` exit 0; 85 app tests pass.

### feat(ios): load the team's mission after a join, and again after sign-in for a searcher who joined before
- What: `AppModel.join(code:teamId:incidentId:)` checks the request, joins through the callable
  and then reads the team's mission: `FirestoreMissionReader` reads the incident, its segments, the
  latest approved plan (by version) and `profile/shared` as a member (offline, from Firestore's
  cache), `MissionBuilder` builds it and `load` takes it, so the assignment is spoken once. After
  every sign-in (at launch, and when signal returns) a token whose claims name a searcher's
  incident and team loads that mission when none is loaded. Each failure is the join screen's
  words: the input, the callable's refusal, the incident not open, or "Joined, but the mission
  could not be read. Check the connection and try again."
- Source: plan task, loading a mission on the iPhone (AppModel.load had no caller outside tests).
- Verified: four tests (a join loads the drill mission with its assignment; a bad code calls
  nothing and a refused join loads nothing; a closed incident and an unreadable mission say why;
  a searcher's token loads the mission after sign-in once, a family token loads nothing) failed to
  compile, then passed; the CI mirror `bash scripts/ci-local.sh` exit 0; 84 app tests pass.

### feat(ios): build the team's mission from the incident, its segments, the plan and the shared profile
- What: `MissionBuilder` turns the member-readable documents a joined searcher can read into the
  phone's `Mission`, with the parsers the pack uses: the segments (ROW included) give the grid,
  the prior and its version; the latest approved plan gives the team's assignment and segments;
  `profile/shared` gives the approach card's profile and the model's appearance fields; the
  incident gives the mode, the engine settings command copied in (the bundled ones if absent),
  the events already in the prior, and the conditions. It refuses, in words, an incident that is
  not open, a search area it cannot read, and segments built for another prior than the
  incident's.
- Source: plan task, loading a mission on the iPhone after a join.
- Verified: three tests on the drill incident's shape (the seed's incident fields with urban
  terrain and the real segment documents from `shared/test-vectors/pack-segments-sample.json`,
  a plan, a shared profile with other names and the stop_calling_name note; no plan or profile
  yet; a closed incident, a prior mismatch and a missing ROW refused) failed to compile, then
  passed; the CI mirror `bash scripts/ci-local.sh` exit 0; 80 app tests pass.

### feat(ios): join an incident as a searcher through the joinIncident callable
- What: `Joiner` signs in, calls joinIncident (us-central1, limited-use App Check tokens, as the
  callable enforces App Check with replay protection), forces an ID-token refresh, and counts as
  joined only when the new claims name the incident, the searcher role and the team asked for.
  Every refusal reads in plain words, by the callable's error code: a wrong code or team, the
  hour's ten attempts spent ("Too many join attempts. Try again in an hour.", the server's own
  words), App Check, no connection. Adds the FirebaseFunctions product.
- Source: plan task, joining an incident on the iPhone; the callable's contract in
  `functions/src/join.ts`; the Android family app's claims check.
- Verified: six tests (call order with the forced refresh and the exact request; claims for
  another team or incident refused; no sign-in calls nothing; every refusal's words; the error
  codes' mapping; the region and limited-use option) failed to compile, then passed; the CI
  mirror `bash scripts/ci-local.sh` exit 0; 77 app tests pass.

### feat(ios-core): check a searcher's join code and team on the phone before calling
- What: `JoinCode` reads a code the way the joinIncident callable does (case, spaces and hyphens
  ignored; 8 symbols of the Crockford alphabet, no I, L, O or U). `SearcherJoin` builds the
  callable's request (code, role searcher, the team command named, and the incident when given)
  and says why a request cannot work before any call, so a malformed code never spends one of
  the hour's ten attempts.
- Source: plan task, joining an incident on the iPhone (the callable's contract in
  `functions/src/join.ts`).
- Verified: four tests (normalization; only eight Crockford symbols; the request's fields; the
  messages for a bad code, team or incident) failed to compile, then passed; the CI mirror
  `bash scripts/ci-local.sh` exit 0; the app tests pass.

### feat(ios): read the other names a person may answer to from the shared profile
- What: `SharedProfile` gains `otherNames`, the optional list of up to five other names she may
  answer to, in the family's order. It is nil on profiles saved before the list and is written
  back only when present. `namesToCall` gives the names to call her by: the list when present,
  else the nickname, leaving blank names out, as the TS engine's `namesToCall` does. The iPhone
  shows no nickname on any screen today, so no screen changes here.
- Source: field expert input through the profile change on the field-expert branch.
- Verified: a test decodes a listed and an older profile, checks the TS engine's four
  `namesToCall` cases and the written keys; it failed to compile, then passed; 269 core tests
  pass; schema parity now reads 21 fields for iOS. The CI mirror's gates, TS, vectors, rules and
  emulator steps, the web typecheck and build, and Swift core pass. Two failures come from the
  base branch, not this change (which touches only `ios/`): schema parity on Android's
  `SharedProfile` (no `otherNames` yet; a control with the iOS field removed fails the same step),
  and the web test that expects two default approach notes now that a third exists. The Android
  build was not run here.

### feat(ios): speak assignments through the published voice template
- What: the AI Logic voice now calls the published prompt template named by the new Remote Config
  key `voice_template_id` (default `pls-voice-v1`) with the approved plan text as its only input,
  instead of naming a voice model and its settings in the app. The template holds the model, the
  voice and the audio settings and speaks the text's own language. Text outside 1 to 600
  characters, an explicit empty template id, or any failure (an HTTP 500 from the server's model
  guard included) gives the phone's own voice. `remoteconfig.template.json` replaces
  `tts_model_ios` (read by no client now) with `voice_template_id`.
- Source: the published voice template.
- Verified: tests for the new key (default, an explicit empty value turns the voice off, the old
  key is gone), the 1 to 600 character rule, and the speaker and app tests with the template id
  pass (71 app tests); a one-off live call from the app's own bundle on the simulator returned
  audio/wav (230,428 bytes in 2.6 s); `bash scripts/ci-local.sh` exit 0.

### test(ios-core): parse the drill incident's real pack segment documents
- What: `PackSegmentsSampleTests` reads `shared/test-vectors/pack-segments-sample.json` (three
  real `pack-segments` documents from the drill incident, in Firestore's typed REST form),
  converts each value the way the iOS Firestore SDK hands it to the app, and parses them with
  `PackSegments.parse`: grid AA then AC in code-point order, ROW last in the prior, prior
  version 5 equal to the incident's, AA's upstream link and AC's neighbours kept, every area
  positive, and each real centroid inside its own real polygon.
- Source: the pack segments sample added to the shared test vectors.
- Verified: both tests pass against the real documents; `bash scripts/ci-local.sh` exit 0.

### test(ios): pin that a report is read only after sign-in succeeded
- What: `AppModel` takes the report read as a `readReport` seam (the default is the same
  `ReportReader` on Apple's model and Firebase AI Logic). Two tests pin the order in `send`: a
  failed sign-in reads nothing, journals nothing and leaves the words in the field; a successful
  one signs in first and only then reads.
- Source: review (AI Logic is moving to signed-in users only).
- Verified: the tests failed to compile without the seam, then passed; a mutant that reads
  without a signed-in user fails the first test; 70 app tests pass; `bash scripts/ci-local.sh`
  exit 0.

### fix(ios): use the cloud voice only after the phone is signed in
- What: the AI Logic voice for a new assignment is an AI Logic call, so it now also needs the
  phone to be signed in (`SpokenAssignment.path` takes `signedIn`); before sign-in the phone's
  own voice speaks. `AppModel.load` passes the sign-in state. The connectivity monitor's path
  handler now goes through `pathChanged(satisfied:)`.
- Source: review (AI Logic is moving to signed-in users only).
- Verified: a core test (signed out gives the on-device voice), a speaker test, and an app test
  that loads a pack online with and without sign-in (the signed-in run is the control that
  reaches the cloud voice) failed to compile, then passed; a mutant that drops the sign-in
  condition fails the core test; 68 app tests pass; `bash scripts/ci-local.sh` exit 0.

### docs(ios): record why the iPhone retries a 429 and the web does not
- What: the 429 retry entry below now states the difference from the web command post and the
  reason for it.
- Source: review.
- Verified: `bash scripts/ci-local.sh` exit 0 (tone and hygiene checks included).

### fix(ios): retry a cloud report read once after a 429
- What: the guided cloud read now runs through `CloudRetry`. The SDK reports an HTTP 429 as a
  rate limit (`LanguageModelError.rateLimited`, with the server's retry delay as a reset date
  when one was sent); `ModelSessionFactory.cloudAttempt(failing:now:)` turns that into a retry
  and every other error into the read failure it was before. Each try is a new session. The
  on-device path is unchanged.
- Deliberate difference from the web command post, which does not retry a 429: the field phone
  is on a weak signal in the middle of a search, where one short retry is worth it; the command
  post already falls back to fixed wording, and its user is at a desk and can press again.
- Source: review (a lower per-user AI Logic limit makes a 429 more likely).
- Verified: a mapping test (delay, no delay, other error) passes and fails on a mutant that
  ignores the rate limit; all 66 app tests pass on the simulator.

### feat(ios-core): add a single cloud retry after a rate limit
- What: `CloudRetry.run` gives a cloud 429 one retry after a wait: the server's delay when it
  sends one, else 2 s, never below 0. A delay over 5 s is not waited, because the wait and a
  second call would not fit in the 20 s stage limit. A second 429 returns `other`, the normal
  failure path to the parser. No other failure retries.
- Source: review (a lower per-user AI Logic limit makes a 429 more likely).
- Verified: six tests failed to compile without the type, then passed; `bash scripts/ci-local.sh`
  exit 0.

### feat(ios): let a searcher report by picking instead of typing
- What: a "Pick instead of typing" button on the field screen opens `PickListView`: what
  happened (Cleared, Clue, Saw them, Found), where (the team's segments, or here by GPS), and for
  a clear how long and how many searched, all as large buttons. `AppModel.submitPick` journals it
  with input method `picklist` and route stage `picklist` (no model runs), through the same
  journaling step as a read report (`journal`: the event, the posterior and the timings).
- Source: Task 13 (pick-list in `TaskView`).
- Verified: `aPickedReportIsJournaledWithThePersonsSegment` compile-red without `submitPick`,
  then green; 65 app tests pass; the Title 3 scan passes; `scripts/ci-local.sh` exit 0. Not
  verified yet: a still of the sheet, which needs a loaded pack.

### feat(ios-core): turn a pick-list choice into a report reading
- What: `PickList.outcome` turns what a person picked (kind, segment, and for a clear the
  minutes and number of searchers) into the same reading shape a read report has, with route
  stage `picklist`, path rules, model "none", latency 0. Coverage is left to code (minutes,
  searchers and the measured detection range), as for a typed report. The outcome builder keeps
  the person's segment for a picked report; the "segments from the text or the GPS fix" rule
  stays for read reports, where it overrules a model.
- Source: Task 13 (pick-list), with the picklist stage the schema now allows.
- Verified: three `PickListTests` (the route and reading; the stored event keeps AB although the
  fix is in AD; a clue with no segment) compile-red, then green; 260 tests;
  `scripts/ci-local.sh` exit 0.

### fix(ios-core): accept the picklist route stage
- What: `ReadStage.picklist` ("a person picked the report from a list; no model ran"), which the
  schema and rules now allow. Before this, the shared filter dropped a valid pick-list event. Its
  route glyph and route sentence say "Not sent to any model."; the router treats it like the
  parser stage (a failure there goes to the pick-list).
- Source: review round 3 (the schema gained the stage; Swift lacked it).
- Verified: `aPicklistEventDecodesAndCounts` (stage picklist, reason on_device_default, decoded,
  not malformed, counted) and `itsGlyphSaysNoModelRan` compile-red, then green; 257 tests; the
  app builds; `scripts/ci-local.sh` exit 0.

### feat(ios): show the urgency chip in the approach card header
- What: `Mission.conditions` carries the incident's typed temperature and wet answer;
  `AppModel.urgency` applies the bundled `urgency.json` rule. The Ready check's "How to approach
  them" section shows "Cold raises urgency" or "Cool and wet raises urgency" (`UrgencyChip`) with
  the CDC sentence word for word and its read date under it. Search urgency only, no treatment
  advice; clothing does not enter. The section appears when there is a chip or a profile.
- Source: P-12, using the shared rule and lane A's conditions schema.
- Verified: `theAppBundleCarriesTheUrgencyRule` and
  `theUrgencyChipFollowsTheIncidentsConditions` compile-red, then green; 64 app tests pass; the
  Title 3 scan passes; a night still of a local-only build with the chip forced on (never
  committed) shows the chip and the full sentence fitting; `scripts/ci-local.sh` exit 0.

### feat(ios-core): read the incident's conditions for the urgency chip
- What: `IncidentConditions` (`tempF`, `wet`, `setAtMs`; all three keys written, nulls out)
  matches `shared/schemas/incident-conditions.schema.json`. `init(incidentField:)` reads the
  incident document's field leniently (absent or not an object gives nil).
  `UrgencyRule.level(conditions:)` gives no chip with no conditions, as the shared engine does.
  The schema's iOS parity entry is no longer pending, so the parity check now enforces it.
- Source: P-12; lane A's conditions schema (a79f54a).
- Verified: three `IncidentConditionsTests` compile-red, then green; 255 tests;
  `check_schema_parity.py` reports iOS incident-conditions with 3 fields, 0 failures;
  `scripts/ci-local.sh` exit 0.

### build(ios): sign device builds with the team App Attest is registered for
- What: `DEVELOPMENT_TEAM` is set in `ios/project.yml`. The Firebase iOS app now carries the same
  team id (it had none before, so App Attest could not verify on a device), and its App Attest
  provider is registered.
- Source: App Check setup for the field app (team id set on the Firebase app, read back).
- Verified: the project generates and the app builds for the simulator; `scripts/ci-local.sh`
  exit 0.

### fix(ios-core): keep an event whose route reason this build does not know
- What: `RouteReason` decodes any value it does not know as `unknown` (decode only, never
  produced here) instead of failing, so the shared filter keeps the event. The rules bound the
  reason by length only, so a newer client's reason can reach this phone; before this the whole
  event was dropped.
- Source: review of merge point 2.
- Verified: `anUnknownReasonKeepsTheEvent` (an event with reason "a_future_reason" decodes, is
  not counted as malformed, and carries `unknown`) and `aKnownReasonStillDecodesAsItself`
  compile-red, then green; 252 tests; the app builds; `scripts/ci-local.sh` exit 0.

### feat(ios): start the events listener with the pack and use team events in the posterior
- What: `AppModel.load` starts the events listener when a pack for a new incident loads (once
  per incident; an earlier registration is removed), and the posterior is computed over every
  member's events from the listener plus this phone's journal, once each by event id.
- Source: Task 13 (listener; posterior after each report).
- Verified: `loadingAPackStartsTheEventsListenerOncePerIncident` failed with the wiring line
  removed, then passed; 62 app tests pass; `scripts/ci-local.sh` exit 0.

### feat(ios): listen to the incident's events with metadata changes
- What: `EventServer.listen` opens a Firestore snapshot listener on `incidents/{id}/events` with
  `includeMetadataChanges: true`. `FirestoreJSON` turns stored values into `JSONValue` (booleans
  kept apart from numbers, a Timestamp as epoch milliseconds). `EventStore` decodes them with the
  shared `EventFilter` (malformed events are skipped and counted), keeps every member's events in
  `teamEvents`, and settles this phone's own unresolved entries when the server copy arrives with
  no pending writes: the same identity is delivered, a different one is a conflict, using the
  same classification as the read-back.
- Source: Task 13 (`EventStore`: "listener with `includeMetadataChanges: true`").
- Verified: `FirestoreJSONTests` and two `EventListenerTests` (our queued copy leaves the entry
  pending, the server copy marks it delivered; another member's event reaches `teamEvents` and a
  broken one is counted) compile-red, then green; 62 app tests pass; `scripts/ci-local.sh` exit 0.

### feat(ios): write each report's timings and recompute the posterior
- What: after a report is journaled, `AppModel` recomputes the posterior from the pack's prior
  and this phone's journal (`EventFilter.toEngineEvents`, leaving out `priorInputEventIds`, then
  `Posterior.compute`), and writes the three timings (Send, reading done, posterior redrawn) to
  `devices/{deviceId}/measurements/{eventId}` through `MeasurementWriter`. The Firestore writer
  never awaits, like the event write. The event's client time is the Send time. These are the
  measured read and redraw latencies for the judge-facing numbers.
- Source: Task 13 ("after the append the view recomputes Posterior.compute and writes the three
  timings").
- Verified: `aSentReportWritesItsTimingsAndRecomputesThePosterior` (a real `submit` of evidence
  text writes one measurement at the event's path, times in order, posterior set) compile-red,
  then green; 58 app tests pass; `scripts/ci-local.sh` exit 0. Not verified yet: the document
  arriving in Firestore (needs a signed-in run with a pack).

### feat(ios): let a searcher undo a report for 5 seconds
- What: each report echo shows an Undo button for 5 seconds after sending (re-checked every
  second). `AppModel.undo` journals a new `retraction` event that targets the report, built by
  `ReadOutcomeBuilder.retraction` with the signed-in uid as device and author; the report itself
  is never edited. No Undo on a retraction, on a report already undone, or on another person's
  report. `send` and `undo` now read the uid from one injectable source.
- Source: Task 13 (`ReportEchoView`: "5-second undo (a `retraction`)").
- Verified: two `UndoTests` (within 5 s a retraction targets the report and Undo goes away;
  after 5 s nothing is written) compile-red, then green; 57 app tests pass on the iOS 27.2
  simulator; `scripts/ci-local.sh` exit 0.

### feat(ios): show the drill banner, link glyph and route glyphs
- What: the field screen's header (`DrillBanner`) shows the team's segments in the accent
  colour, a DRILL tag and the link glyph (`LinkGlyph`: shape plus a count badge, its words only
  for VoiceOver). Each report echo carries a `RouteGlyph` (phone, cloud, the phone's rules, or a
  raised hand when no model saw it). The route sentence now shows only when "Show sources" is
  on (a per-phone setting on the Ready check, for filming and judges). `AppModel.linkState`
  counts the reports still on this phone.
- Source: Task 25 (route glyph, four link states, VoiceOver labels, drill banner); "proof is a
  glyph, not a sentence".
- Verified: `theLinkGlyphFollowsSignalAndWaitingReports` compile-red, then green; 55 app tests
  pass; the Title 3 scan passes with the new components; `scripts/ci-local.sh` exit 0. Not
  verified yet: a still of the banner and echo glyphs, which need a loaded pack.

### feat(ios): keep every field screen at Title 3 or larger
- What: every smaller text style on the field screens, the Ready check, the report echo, the
  evidence card, the approach card and the Live Activity is raised to Title 3 (semibold, or bold
  where it was bold), and the root view and the Live Activity default to Title 3 semibold, so
  unstyled text is covered too. `FieldTextSizeTests` scans the app's, widget's and shared view
  sources and fails on any style below Title 3 or any fixed point size.
- Source: Task 25 step 3 ("nothing below Title 3", Dynamic Type only); design 22.1 (iPhone text
  semibold or heavier).
- Verified: the scan failed on 20 lines, then passed; app builds; a night still of the Ready
  check shows everything fits; `scripts/ci-local.sh` exit 0.

### feat(ios-core): describe the link state and each report's route as glyphs
- What: `LinkState.make(online:waiting:)` gives the header glyph's four states, which differ in
  SF Symbol shape and a count badge, never in colour alone (signal; no signal; no signal with
  reports waiting; sending), each with a VoiceOver line ("No signal. 2 reports waiting to
  send."). `RouteMark.make` gives each read report's source glyph from our own router's route:
  phone, cloud, the phone's rules, or "Not sent to any model." for the evidence protocol.
- Source: Task 25 (route glyph, link glyph shapes, VoiceOver labels); design 22.1 (states by
  shape and number).
- Verified: three tests compile-red, then green; 249 tests; `scripts/ci-local.sh` exit 0.

### docs(ios): name no internal process in the changelog or comments
- What: changelog entries and three code comments now say "review" or name the
  `ReadOrchestrator` type where they named the team's internal process. No behaviour changes.
- Source: repo rule for public text (commit messages, changelogs, comments and docs).
- Verified: a case-insensitive search of `ios/` for the internal names returns 0 lines;
  246 Swift tests pass; `scripts/ci-local.sh` exit 0.

### fix(ios-core): read a partial shared profile with the missing fields empty
- What: `SharedProfile` decodes every missing or null key as empty ("" for text, [] for
  lists, [:] for flags, nil for optional values) instead of failing. The rules let command write
  `profile/shared` in parts, so a nickname alone is a legal document; before this it failed with
  `keyNotFound: answersTo`. The approach card from such a document shows only its footer, and
  the model sees "No description on file."
- Source: review of merge point 2 (the web reader crashed on a missing `approachNoteIds`).
- Verified: `aNicknameOnlyDocumentDecodesWithEverythingElseEmpty` red with
  `DecodingError.keyNotFound`, then green; 246 tests; `scripts/ci-local.sh` exit 0.

### test(ios): take the timing out of the trace and Live Activity tests
- What: the route-trace test records synchronously (a `Mutex`-backed log) instead of waiting
  200 ms for detached tasks; the Live Activity test waits for the real "ended" state, at most
  10 s, instead of a fixed 1 s sleep.
- Source: one app test run failed with no failure shown and passed on rerun; both fixed waits
  could lose under load.
- Verified: the app suite passed twice in a row afterwards (54 tests each);
  `scripts/ci-local.sh` exit 0.

### feat(ios): speak a new assignment when a pack loads
- What: `AssignmentSpeaker` speaks the team's approved assignment (`SpokenAssignment` words:
  segments and command's approved task text only) once per change, while the app is open.
  `OnDeviceVoice` is the phone's speech synthesizer (offline, no AI); `CloudVoice` asks the AI
  Logic voice model named by `tts_model_ios` for WAV audio (voice "Kore", 10 s limit) and plays
  it. Any cloud failure falls back to the phone's voice. Each attempt records an
  `assignment_speech` Performance trace (path, outcome, time to first sound), so the two voices
  can be compared on measured numbers. `Mission.assignment` carries the latest approved
  assignment; `AppModel.load` speaks it. Audio plays as spoken audio and lowers other sound.
  A locked screen is not covered yet (that needs push delivery).
- Source: spoken assignment changes (EXTRA-MILE F1); Firebase generate-speech page read
  2026-11-18 (unary output is `audio/wav`, 24 kHz mono 16-bit; voice list includes Kore).
- Verified: four `AssignmentSpeakerTests` (on-device once per change; cloud when named and
  online; cloud failure falls back; no assignment says nothing) and
  `loadingAPackSpeaksTheApprovedAssignmentOnce` compile-red, then green; 54 app tests pass on
  the iOS 27.2 simulator; `scripts/ci-local.sh` exit 0. Not measured yet: real latency of
  either voice (needs a loaded pack, or a device run).

### feat(ios): read the voice model for spoken assignments from Remote Config
- What: `RemoteConfigValues` reads `tts_model_ios` (default empty). Empty means the phone's own
  voice only; the app's source names no voice model id, so the model allow-list stays the only
  place a model is named.
- Source: spoken assignment changes (EXTRA-MILE F1), key agreed with lane A.
- Verified: `RemoteConfigValuesTests` updated (the key is read; the default is empty; defaults
  round-trip) compile-red, then green; `scripts/ci-local.sh` exit 0.

### feat(ios-core): build the spoken assignment from the approved plan only
- What: `SpokenAssignment.text` makes the words for a new assignment from command's approved
  plan only: the segment ids, read as letters ("Segments A B and A C."), and the approved task
  text, cut at 400 characters. The plan's reason line, report text and profile fields are
  never spoken. `shouldSpeak` speaks only when the words would change. `path` picks the cloud
  voice only when Remote Config names a model (`tts_model_ios`, default empty), the phone is
  online and the kill switch is off; otherwise the phone's own synthesizer.
- Source: TTS first cut approved in review 2026-11-18 (EXTRA-MILE F1); lane A's key
  name `tts_model_ios`.
- Verified: five `SpokenAssignmentTests` compile-red, then green; 245 tests;
  `scripts/ci-local.sh` exit 0.

### feat(ios-core): add the urgency rule from the shared constants
- What: `UrgencyRule` reads `shared/constants/urgency.json` (40 °F, the CDC sentence, its URL
  and read date). `level(tempF:wet:)` gives cold at or below 40 °F, cool and wet above it when
  the person is typed as wet, and no chip with no temperature, an unanswered wet question or a
  value that is not a number. Clothing does not enter. `UrgencyLevel.chipText` is "Cold raises
  urgency" or "Cool and wet raises urgency"; `sourceLine` quotes the CDC sentence word for word
  with its read date. Search urgency only, no treatment advice.
- Source: promotion P-12; review ruling 2026-11-18 (CDC winter-weather page, read
  2026-11-18); lane A's constants and vectors on main.
- Verified: three `UrgencyTests` (all 7 shared vectors agree, words and source line, nonsense
  temperatures give no chip) compile-red, then green; 240 tests; `scripts/ci-local.sh` exit 0.

### feat(ios): show the team's task as a Live Activity
- What: `TaskActivityAttributes` (in `ios/PLSShared`) carries the `TaskStatus` and the night
  flag. `TaskActivityController` starts one Live Activity when a pack loads, updates it only when
  what it shows changes (segments, reports waiting or needing a look, day or night colours), and
  ends it when the pack is gone; a refused start is tried again on the next change.
  `ActivityKitClient` is the real client (ends leftovers from an earlier run first). The widget
  extension draws the lock screen ("Training drill. Nobody is missing.", "Your segments: AB,
  AC", the status line) and the Dynamic Island in the field colours. The app declares
  `NSSupportsLiveActivities`; `FieldColor` moved to `ios/PLSShared` so the extension can use the
  theme; the extension links PLSCore. `@preconcurrency import ActivityKit` because Activity
  predates Sendable; the client touches its one activity from the main actor only.
- Source: promotion P-07 (Live Activity for the team's task).
- Verified: two `TaskActivityControllerTests` (start once, update on change, end when the pack
  goes; a refused start is retried) compile-red without the types, then green;
  `theRealClientStartsAndEndsALiveActivity` puts an actual Live Activity up on the iOS 27.2
  simulator and takes it down; 48 app tests pass; `scripts/ci-local.sh` exit 0. Not verified
  yet: a still of the lock screen and Dynamic Island (the simulator still did not show it) and a
  loaded pack driving it, which waits on the pack loader.

### feat(ios-core): sum up the team's task for the Live Activity
- What: `TaskStatus.make(assignedSegmentIds:states:)` gives the sorted assigned segments, the
  reports still waiting for signal (pending or checking) and the ones refused by the server,
  and a short line ("2 reports waiting for signal. 2 need a look."). It holds no report text
  and nothing about the subject, because a lock screen can be seen by anyone nearby.
- Source: promotion P-07 (Live Activity for the team's task).
- Verified: two `TaskStatusTests` compile-red, then green; 237 tests;
  `scripts/ci-local.sh` exit 0.

### feat(ios): add a Log report control for the Action button
- What: a WidgetKit extension target `PLSWidgets` (in `ios/project.yml`, embedded in the app)
  with the `LogReportControl` control. Its `LogReportIntent` (in `ios/PLSShared`, built into
  both targets) runs in the app in the foreground (`supportedModes = .foreground(.immediate)`;
  `openAppWhenRun` is deprecated in iOS 26) and asks `ReportFocus` for the Report field, which
  the field screen focuses once when a pack is loaded. Assigned to the Action button, one press
  opens the app with the keyboard and its microphone key ready.
- Source: promotion P-08, Task 32 item 6.
- Verified: two `LogReportIntentTests` (foreground mode; perform asks once, focus taken once)
  compile-red without the types, then green; 45 app tests pass on the iOS 27.2 simulator; the
  built app holds `PlugIns/PLSWidgets.appex` with extension point
  `com.apple.widgetkit-extension`; `scripts/ci-local.sh` exit 0. Not verified yet: assigning
  the control to the iPhone's Action button (a device step for Stephen).

### feat(ios): collect crash reports with Crashlytics
- What: the app links `FirebaseCrashlytics` (pinned SDK, no new package) and a post-build
  script uploads the dSYMs for symbolication on Release builds only, with Firebase's
  documented input files so it runs under user script sandboxing. The app sets no custom keys
  or logs, so crash reports hold stack traces only, never report text or subject data.
- Source: promotion P-15 (Crashlytics on iOS); review note (all target and script
  changes in `ios/project.yml`, never in the generated project).
- Verified: `crashReportsAreCollected` failed to build without the product ("Unable to resolve
  module dependency: 'FirebaseCrashlytics'"), then green; 43 app tests pass; a Release
  simulator build ran the upload phase and succeeded (the script path resolves); Debug builds
  run the phase and upload nothing; `scripts/ci-local.sh` exit 0. Not verified yet: the dSYMs
  showing in the Crashlytics console.

### feat(ios): send one Performance trace per report read
- What: the app links `FirebasePerformance` (same pinned firebase-ios-sdk 13.2.0, no new
  package). `PerformanceTelemetry.record` starts a `report_read` trace, sets the five route
  attributes and `latency_ms` from `RouteTelemetry`, and stops it. `ReportReader` records the
  route of every read on every path (evidence protocol, parser, on-device, cloud) through
  `recordRoute`, a seam for tests.
- Source: promotion P-15 (Performance traces per route), EXTRA-MILE C4.
- Verified: `everyReadRecordsExactlyOneRouteTrace` (an evidence read and a parser read record
  exactly their two routes) compile-red without `recordRoute`, then green; 42 app tests pass on
  the iOS 27.2 simulator; `scripts/ci-local.sh` exit 0. Not verified yet: traces arriving in the
  Performance console, which takes a device or simulator run with network and a console read.

### feat(ios-core): describe each read as a route-only Performance trace
- What: `RouteTelemetry` maps a read's `RouteRecord` to the `report_read` trace: five
  attributes (path, stage, reason, model, blocked) and a `latency_ms` metric. It carries the
  route only, never the report, the reading or anything about the subject. AI monitoring sees
  cloud calls only, so this is how the on-device share and latency can be shown.
- Source: promotion P-15 (telemetry), EXTRA-MILE C4.
- Verified: three `RouteTelemetryTests` (the mapping; every path, stage and reason fits the
  installed SDK's limits of 5 attributes, 40-character names, 100-character values, no
  reserved prefix; strange latencies) compile-red, then green. The huge-latency case crashed
  the run ("Double value cannot be converted to Int64") before the one-day cap was added.
  235 tests; `scripts/ci-local.sh` exit 0.

### feat(ios): ask an old build to update when command raises the minimum version
- What: `AppModel.updatePrompt` is set when `minimum_version_ios` is above this build's
  CFBundleShortVersionString: "Update this app. Command needs version X or newer. Reports still
  send." The field screen shows it as an accent banner under the drill line and the Ready check
  as a row (otherwise "App version 0.1.0: current"). It asks and does not block, so a searcher
  on an old build can still send reports.
- Source: J10 (`minimum_version_ios` upgrade prompt), promotion plan.
- Ruling: prompt, not block. Cost if wrong: an old build with a known defect keeps sending until
  its user updates; command can still flip `kill_cloud`.
- Verified: two `AppModelTests` (a raised minimum sets and clears the prompt; the version comes
  from the bundle) compile-red, then green; 41 app tests pass; stills of a local-only build with
  the minimum at 9.9.9 (never committed) show the banner by day and the row at night;
  `scripts/ci-local.sh` exit 0.

### feat(ios): read Remote Config at start and on every live update
- What: `RemoteConfigStore` sets the built-in defaults, fetches and activates at start, and
  listens for real-time updates (activate, then publish), so a kill-switch flip or a raised
  `minimum_version_ios` reaches the phone without a restart. `RemoteConfigValues.from` reads
  the five iOS keys (`cloud_model_ios`, `token_budget_fraction`, `kill_cloud`,
  `use_limited_use_tokens`, `minimum_version_ios`); a missing or unreadable value keeps its
  default. `AppModel.start` feeds every update into `config`, which updates the live gate.
- Source: J10 and Task 21b (RemoteConfigStore fetch), promotion plan.
- Verified: four `RemoteConfigValuesTests` (keys read, bad values keep defaults, defaults
  written under the same keys, old build asked to update) compile-red, then green; 39 app
  tests pass; the app launches on the simulator and is still running 8 s later against the
  project's template, which is empty today (so the defaults are in force);
  `scripts/ci-local.sh` exit 0. Not verified yet: a live update arriving, which needs the
  template that lane A publishes.

### feat(ios-core): compare app versions for the minimum version check
- What: `AppVersion.isBelow(_:minimum:)` compares dotted versions part by part as numbers
  (0.9 is below 0.10; a missing part is 0; spaces trimmed). A value that is not a dotted
  number never asks for an update, so a typo in Remote Config cannot lock a searcher out.
- Source: J10 (`minimum_version_ios` with an upgrade prompt), promotion plan.
- Verified: two `AppVersionTests` compile-red, then green; 232 tests;
  `scripts/ci-local.sh` exit 0.

### fix(ios): give the read the segment under the GPS fix
- What: `ReportReader` sets `ReadContext.positionSegmentId` from the report's situation, so a
  report that names no segment is read as being about the segment the searcher stands in,
  whatever the model copied.
- Source: review ruling 2026-11-18 (segment ids from code).
- Verified: `theGPSSegmentReachesTheReadNotTheModelsCopy` (a model that copies AC; GPS in AB;
  text names nothing; result AB) red with this line removed, then green; 35 app tests pass on
  the iOS 27.2 simulator; `scripts/ci-local.sh` exit 0.

### fix(ios-core): take segment ids from the report text or GPS, never from the model
- What: `SegmentChoice.ids` picks a reading's segments in code: the ids the report names (the
  parser's rule; an unknown named id is kept so the validator rejects it), else the segment
  under the GPS fix (`ReadContext.positionSegmentId`), else none (the effect then uses the
  assignment). `ReadOrchestrator` applies it to every model and parser reading before
  validation, and the outcome builder applies it before the write, so the model's segment
  field never counts. The kind still comes from the model, with the parser's kind on a
  timeout, a failure or an unknown kind.
- Source: review ruling 2026-11-18 after spike S1 on the Mac (both variants copied the
  team's assignment, AC, instead of the segment the report named).
- Verified: five `SegmentsFromCodeTests` (the choice order; AB named while assigned AC gives
  AB; nothing named gives the GPS segment; "maybe" as the kind falls back to the parser; the
  stored event uses the code choice) red with the `ReadOrchestrator` override removed, then green.
  Two older tests used the model's own unknown id "ZZ" to make a reading invalid; they now use
  a report naming ZZ and a coverage of 400. 230 tests; `scripts/ci-local.sh` exit 0.

### feat(ios): draw the field screens in the day and night colours only
- What: the Report bar is filled with the theme accent (amber by day, red at night) with black
  text; secondary text, problems and the approach card footer use theme colours; the Ready
  check is plain black rows with 2 pt theme lines, a three-button Auto/Day/Night choice (60 pt
  targets for gloves), a theme-coloured switch and a theme-coloured title and back button. The
  system title, back chevron, segmented picker and switch knob stayed white at night, so they
  are replaced.
- Source: promotion P-16, Task 25 step 5 (stills of every screen in each theme).
- Verified: simulator stills of the field screen and the Ready check in Day and in Night, and a
  live Night-to-Day switch from the Ready check: no white left at night except the iOS status
  bar, which the app cannot colour. Two defects found in the stills and fixed before this
  commit: VoiceOver read every choice as the hint text (now Auto, Day, Night with the hint
  separate), and the back chevron kept the night tint after a switch. 34 app tests pass;
  `scripts/ci-local.sh` exit 0. No unit test covers the drawing; the stills are the check.

### feat(ios): keep the screen choice and switch to night colours at dusk
- What: `ThemeStore` keeps Auto, Day or Night on this phone (an unknown stored value falls back
  to Auto); `FieldColor` turns the theme's hex values into colours; `RootView` re-checks each
  minute, passes the chosen colours down as `fieldTheme`, and sets the tint, text colour and
  black background. Auto uses the last GPS fix (`AppModel.lastFix`), else the pack's area.
- Source: promotion P-16, Task 25 (`ThemeStore`).
- Verified: four `ThemeStoreTests` (choice kept, unknown value, place order, hex parsing)
  compile-red without the types, then green; 34 app tests pass on the iOS 27.2 simulator with
  only this commit's app files; `scripts/ci-local.sh` exit 0.

### feat(ios-core): choose the field theme from the setting, the clock and the place
- What: `ThemeMode` (auto, day, night) and `FieldTheme.resolve(mode:date:at:)`. Day and Night
  are fixed choices; Auto is night between civil dusk and civil dawn at the given place and day
  when no place is known yet (the searcher can pick Night by hand).
- Source: promotion P-16, Task 25 (automatic night switch).
- Verified: four `ThemeChoiceTests` (auto before and after dusk in Atlanta, a chosen theme
  wins, no place stays day, stored names) compile-red, then green; 225 tests;
  `scripts/ci-local.sh` exit 0.

### feat(ios-core): tell when it is dark enough for night mode
- What: `Dusk.isAfterCivilDusk(date:lat:lon:)` is true when the sun is more than 6 degrees below
  the horizon (after civil dusk, before civil dawn), from the standard low-precision solar
  position formulas. The app uses it for the automatic night switch.
- Source: promotion P-16, Task 25 (`Dusk`).
- Verified: two `DuskTests` (Atlanta, Nov 22: 15:00 local day, 19:30 night; Nov 23: 05:00
  night, 09:00 day) compile-red without the type, then green; `scripts/ci-local.sh` exit 0.

### feat(ios-core): add the field day and night colours with a contrast check
- What: `Contrast.ratio` (WCAG) and `FieldTheme.day` / `FieldTheme.night` from design section
  22.1. Day: black, white text, one amber `#FFB020` for the Report bar and "your segment", a
  six-step grey ladder for probability. Night: red on black (`#FF5448` primary, `#ED4138`
  secondary, `#C93029` only at 24 pt or more, `#831B16` lines), a six-step red lightness ramp,
  and the top class hatched. Probability is shown by lightness and a printed number, never hue.
- Source: promotion P-16 (night mode, locked in the design), Task 25; design section 22.1.
- Ruling: the plan named the namespace `Tokens`; Core already has `Tokens` (the report parser's
  token list), so the theme is `FieldTheme`. Interface otherwise as planned.
- Verified: six `ContrastTests` (day and night text pairs, both ramps, the 24 pt rule, every
  text role at least 4.5 to 1) compile-red without the types, then green; full suite;
  `scripts/ci-local.sh` exit 0.

### refactor(ios): send the tools' and prompt's words from the Core allow-listed text
- What: `SegmentAtTool`, `TeamAssignmentTool` and `SubjectProfileTool` take their names,
  descriptions and outputs from `ToolText`; `ReportPrompt` wraps `PromptText`. The words the app
  sends are now the exact words `cloudPromptHoldsOnlyNamedFields` checks.
- Source: review ruling 2026-11-18 (design section 9), Task 21b.
- Verified: `ToolsTests` rewritten to compare each tool's name, description and output, and both
  instruction texts, with the Core text: compile-red without `guidedText`/`permissiveText`, then
  green; 30 app tests pass on the iOS 27.2 simulator; `scripts/ci-local.sh` exit 0.

### test(ios-core): pin everything the cloud route can send to an allow-list
- What: `PromptText` (instruction text), `ToolText` (the three tools' names, descriptions and
  outputs) and `CloudOutbound.texts` (instructions, report, every tool's name, description and
  output) move the cloud payload into Core. `cloudPromptHoldsOnlyNamedFields` walks the
  subject-profile schema, puts a findable value in every shared and command field, and asserts
  only the report, the segment id, the assignment ids and the six appearance fields reach the
  payload; no flag name, health, medication, address, phone number or contact word appears.
- Source: review ruling 2026-11-18 on design section 9 (all three tools may run on the
  cloud route; the test is an allow-list over the whole outbound prompt); Task 21b.
- Verified: compile-red without the types, then green; a planted leak (hair read from
  answersTo) turned it red on "field answersTo reached the cloud prompt", then restored; full
  suite 213 tests; `scripts/ci-local.sh` exit 0. The Generable schema text of the reading is
  fixed copy and is not in this list.

### fix(ios-core): hold stored effects to the rules' id length and influence cap
- What: `EffectShape` now refuses a cleared effect whose segment id is empty or longer than 16
  characters, and a clue effect with more than 64 influences, as the Firestore create rule does.
  A stored event that fails is skipped and flagged, never applied.
- Source: fresh-eyes review M6; review ruling 2026-11-18 ("a mismatch with the rules is a
  real defect").
- Verified: `sizesFollowTheCreateRule` red on the three missing limits, then green; full suite
  211 tests; `scripts/ci-local.sh` exit 0.

### feat(ios): show the approach card on the Ready check
- What: `approach-notes.json` is bundled into the app; `ApproachCardView` shows the first lines,
  the rest under More, and the footer; the Ready check shows it under "How to approach them" when
  the pack carries `profile/shared` (`Mission.sharedProfile`, filled by the pack loader).
- Source: Task 35 (ApproachCardView), spec section 13.3.
- Verified: a bundled-file test (`theAppBundleCarriesTheApproachNotes`) compile-red, then green;
  29 app tests pass on the iOS 27.2 simulator; `scripts/ci-local.sh` exit 0.

### feat(ios-core): build the approach card from the profile's note ids
- What: `ApproachNotes` reads `shared/constants/approach-notes.json`; `ApproachCard.build` takes
  the note ids command chose (`approachNoteIds`), orders them by the file, fills in the family's
  own words (`{primaryLanguage}`, `{triggersToAvoid}`, `{bestApproach}`,
  `{uniqueDescription}`), leaves out a note whose words are empty, shows the first 7 and puts
  the rest under More, with the footer. Code and fixed copy only, no model.
- Source: Task 35 (ApproachCardView data), spec section 13.3, lane A 2bc711c.
- Verified: two `ApproachCardTests` (file order with filled text and an unknown id ignored; the
  7-line cut and empty family text) compile-red, then green; full suite 210 tests;
  `scripts/ci-local.sh` exit 0.

### feat(ios-core): add the shared subject profile
- What: `SharedProfile`, the 20 fields of `profile/shared` from
  `shared/schemas/subject-profile.schema.json` (all keys encoded, nulls written out). It is shown
  to people and carried in the pack; only `ModelProfile`'s six appearance fields reach a model.
- Source: Task 35 (phone side), spec section 13.2, lane A's parity map (Profile.swift#SharedProfile).
- Verified: `ProfileTests` (decode; encoded keys equal the schema's required list) compile-red,
  then green; `check_schema_parity.py` now checks iOS SharedProfile (20 fields, 0 failures);
  full suite passes; `scripts/ci-local.sh` exit 0.

### fix(ios): put a time limit on the token count too
- What: the stage time limit becomes a public helper, `Timeout.run(seconds:_:)`, and
  `ReportReader` uses it around the token count (5 s by default, then a characters-per-token
  estimate). The model runner is now injectable for tests. Before, a stalled count would hold
  the report with no limit.
- Source: spike S1 on the Mac: a FoundationModels call stalled for 44 minutes (sampled stack
  parked inside FoundationModels) in a run built before the stage limits.
- Verified: two `TimeoutTests` (a 30 s call gives nil in about 0.1 s; a quick call gives its
  value) and an app test with a 60 s token count and a 0.2 s limit (the read finishes in under
  10 s), compile-red without the API, then green; 207 PLSCore tests; 28 app tests pass on the
  iOS 27.2 simulator; `scripts/ci-local.sh` exit 0.

### refactor(ios): let the compiler check the model runner's Sendable conformance
- What: `FoundationModelRunner` drops `@unchecked Sendable`; `FirebaseAI` is a `Sendable` final
  class in 13.2.0 and `Tool` is `Sendable`, so the plain conformance compiles and stays checked.
- Source: fresh-eyes review M4.
- Verified: the app builds for the simulator with no new Sendable warnings in our sources;
  `scripts/ci-local.sh` exit 0.

### fix(ios-core): refuse out-of-range stored numbers instead of crashing
- What: numbers read from stored documents convert with `Int(exactly:)`: an out-of-range or
  fractional `seq` makes a server copy's identity unreadable, an extreme `heightFt` or
  `heightIn` is dropped, and an out-of-range `priorVersion` refuses the pack segment by name.
  `PoaClass` handles an extreme ratio or percent without overflow. Before, `Int(...)` trapped
  and the app crashed on such a document.
- Source: fresh-eyes review M5, extended to `PackSegments` and `PoaClass` by a grep for the same
  conversion.
- Verified: the new test crashed the suite before ("Double value cannot be converted to Int"),
  then passed; full suite 205 tests; `scripts/ci-local.sh` exit 0.

### fix(ios): offer Retry only when a retry can help
- What: `Outbox.isRetryable(reason:)` treats an id conflict, `invalid-argument` (the server
  refuses this document's content every time) and `encode-failed` as permanent; those entries
  say "Not delivered. Ask command" and show no Retry. Network, auth, permission and
  `not-on-server` reasons stay retryable.
- Source: fresh-eyes review M8.
- Verified: the new test compile-red, then green; 204 PLSCore tests; app builds;
  `scripts/ci-local.sh` exit 0.

### fix(ios): name a sighting on the echo card and say it waits for command
- What: `EchoText.effectLine(_:type:)` says "Sighting logged in AC. It counts once command
  confirms it." for a sighting (it said "Clue logged"); the echo card passes the event type.
- Source: fresh-eyes review M7; spec section 8 (a sighting changes the map only after a
  confirmation).
- Verified: the new test compile-red, then green; 203 PLSCore tests; app builds;
  `scripts/ci-local.sh` exit 0.

### fix(ios-core): test the cloud gate at dispatch and name a mode exit in the route
- What: when the live gate closes a cloud route at the moment of dispatch because the incident
  left drill or judge mode, the route record now says `not_drill_mode`; other closures keep the
  reason step 1 failed, as the router does. New tests pin the dispatch check itself (a cloud
  route from the snapshot with the kill switch on calls no model) and the mode exit on both the
  reroute and the dispatch paths.
- Source: fresh-eyes review M3 (no test of the dispatch check) and M10 (old reason kept).
- Verified: of three new tests, the dispatch mode-exit test failed before (old reason), then
  passed; the other two are guards that pass on the H1 fix; full suite 202 tests;
  `scripts/ci-local.sh` exit 0.

### fix(ios-core): read "half an hour" as 30 minutes
- What: "half an hour ago" now gives a sighting 30 minutes before the send (it gave 60), and
  "for half an hour" gives a search of 30 minutes.
- Source: fresh-eyes review M2 (a sighting time stored 30 minutes wrong).
- Verified: the new test failed on both forms, then passed; full suite 199 tests;
  `scripts/ci-local.sh` exit 0 (lane pushes run no CI).

### fix(ios): set a damaged journal aside instead of stopping all reporting
- What: `Outbox.openOrRecover` moves an unreadable journal aside as
  `outbox.damaged-{ms}.json` (kept, never deleted) and starts a new one; `EventStore` opens with
  it and reports where the old file went, and the app tells the person that earlier reports may
  need to be sent again. `AppModel.start` now gives each start-up failure its own message
  (numbering, missing evidence word list, journal) instead of one message that blamed the
  journal for all of them.
- Source: fresh-eyes review I9.
- Verified: two `OutboxRecoveryTests` (a damaged file is moved aside and kept, a new journal
  works; a healthy journal opens as it is) compile-red, then green; 198 PLSCore tests; 27 app
  tests pass on the iOS 27.2 simulator.

### fix(ios): read Remote Config at each send so a kill-switch flip takes effect at once
- What: `AppModel.config` refreshes the live gate whenever it changes, and the report reader is
  built at each send from the current values (cloud model, token budget, kill switch,
  limited-use tokens). Before, the reader held a copy made at launch, so a fetched config would
  have changed nothing until a restart. Fetching from Remote Config itself is Task 21b.
- Source: fresh-eyes review I7.
- Verified: `aKillSwitchFlipReachesTheLiveGateAtOnce` failed before (the gate stayed false), then
  passed; 27 app tests pass on the iOS 27.2 simulator.

### fix(ios): feed cloud request failures into networkOnline
- What: `ReadOutcome.cloudTransport` says whether a cloud stage was used and whether its request
  failed (network error or timeout) or succeeded; `AppModel` passes it to the connectivity
  monitor (`requestFailed` / `requestSucceeded`). So joined Wi-Fi with no internet now counts as
  offline for the next minute, as the earlier changelog entry for the monitor already said; before
  this commit no code called those methods.
- Source: fresh-eyes review I6; plan self-audit addendum (test the failed-request case).
- Verified: two `ReadOrchestrator` tests (a network failure is reported; a success and an on-device
  read are reported) compile-red without the field, then green; full suite 196 tests; app builds.

### fix(ios): retry anonymous sign-in and show it on the Ready check
- What: `SignIn` tries anonymous sign-in at start, again on every return to signal and before a
  send, and never while one attempt is running. The Ready check shows "Signed in" or "Not signed
  in. Stay in signal." Before, one failed attempt at first launch (offline) was never retried
  and its error was dropped.
- Source: fresh-eyes review I4; spec section 11.1 (sign in before leaving signal).
- Verified: `SignInTests` (a failure is tried again; no attempt once signed in) compile-red
  without the type, then green; 26 app tests pass on the iOS 27.2 simulator. CI: Actions budget
  block; local `ci-local.sh` and `swift test` exit 0.

### fix(ios): keep the searcher's words in the field until the report is journaled
- What: `AppModel.submit` returns the text to leave in the field: empty once the event is in the
  journal, the same words when it is not (no pack, not signed in, a journal error), so nothing a
  searcher said is lost. A second Send while one is reading does nothing. The field screen shows
  "Reading your report" while it reads. The unused `dictated` state is removed.
- Source: fresh-eyes review I2 and M11 (M1's unused variable).
- Verified: `AppModelTests` (a send with no pack keeps the text and says "No pack loaded.")
  compile-red without `submit`, then green; 25 app tests pass on the iOS 27.2 simulator. CI:
  Actions budget block; local `ci-local.sh` and `swift test` exit 0.

### fix(ios-core): give every model stage a time limit
- What: each guided or permissive model call gets `stageTimeoutSeconds` (20 s by default). On
  timeout the read moves on as a failure (`network` on the cloud route, `other` on-device), so
  it reaches the parser instead of holding the report. The race resumes once and does not wait
  for a call that ignores cancellation.
- Source: fresh-eyes review I2 (no timeout on `session.respond`).
- Verified: the new test with a runner that sleeps 30 s failed (the read took 31.8 s), then
  passed in about 0.2 s; full suite 194 tests; app builds.

### fix(ios): a late timeout from one location request cannot answer the next
- What: `FixGate` gives each request a token, and only a finish with the current token resumes
  the waiter. `LocationProvider` uses it, cancels the timer when a fix arrives, and ignores a
  location older than the request. Before, the first report's 10 s timer could resolve the
  second report's request with no position, so it silently fell back to the assignment.
- Source: fresh-eyes review I5.
- Verified: two `FixGateTests` (a stale finish is ignored; a second finish does nothing),
  compile-red without the gate, then green; 24 app tests pass on the iOS 27.2 simulator. Real
  fixes are device acceptance (spike S-GPS).

### fix(ios-core): cap the stored report text at the rules' 2,000 limit
- What: after the phone-number scrub (which can make text longer), the stored `rawText` is cut
  at a character boundary to at most 2,000 UTF-8 bytes, which is at or under 2,000 in any unit
  the create rule's `size()` may count. Before, a long report was refused by the server forever
  and Retry could never help.
- Source: fresh-eyes review I3; plan Review Focus 2 (the 2,000-character case).
- Verified: the new test (2,500 letters, 700 four-byte emoji, a scrub that grows the text)
  failed on all three, then passed; full suite 193 tests.

### fix(ios): no token count for evidence text or outside a drill
- What: `ReportReader` runs the evidence screen and the drill or judge check before it counts
  tokens with Apple's model, and skips the count when either stops the read. Before, the report
  text went to `SystemLanguageModel.tokenCount` even when the card then said "Not sent to any
  model." The estimator is now a seam for tests.
- Source: fresh-eyes review I1; hard rule (a report with a possible-evidence term goes to no
  model; no model call outside a drill or judge incident).
- Verified: a counting test failed with the seam but without the guard (count above 0), then
  passed; 22 app tests pass on the iOS 27.2 simulator.

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
  incident mode) behind a `Mutex`, so PLSCore's `ReadOrchestrator` can read it from any thread at the
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
  Source: lane A ae8446e (review decision). Verified: all 7 eventId vector cases and the
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
- Source: lane A 6c4dc21 (malformed_* docToEngine vectors).
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
- Source: lane A's security-rules review.
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
- Source: Codex review H2, verified against the code; plan Review Focus 3.
- Verified: new parser and builder tests (parser path and model path) failed on the old code,
  then passed; "the segment by the creek" still names nothing; full suite 155 tests.

### fix(ios-core): check the cloud gate live at dispatch, keep the context-limit reason
- What: `ReadOrchestrator` reads a live gate (connectivity, consent, kill switch, incident mode)
  again when it reroutes and right before any cloud call; if the gate closed during the
  on-device call, the report goes to the parser, not the cloud. A context-limit failure now
  reroutes as `over_token_budget` instead of `on_device_unavailable`. `ReportSituation` gains an
  optional `liveGate` that `ReportReader` passes through.
- Source: Codex review H1 (gpt-6.2-sol, 11664c5..cec3596), verified against the code.
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

### feat(ios-core): add `ReadOrchestrator` and the tolerant permissive-line parser
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
