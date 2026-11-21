# Changelog

This file covers shared/, tools/, functions/, the root rules and config, scripts/, .github/ and docs/.
Newest first. Each entry gives what changed, its source and how it was verified.

## 2026-11-21

- Hosting: `/privacy` and `/support` rewrite to `/privacy.html` and `/support.html` ahead of the app shell, so each
  URL answers with its own page. Source: the App Store submission needs public privacy and support pages.
  Verified: a new check in `scripts/test_firebase_config.py` (each path has one rewrite to its page, before the app
  shell, and the page file exists) failed first, then passed with CI's Python gates.
- Engine: correctFoundKind treats object-note words that are also names ("Brook", "Brown", "River") as names where a
  name would stand. A name-like colour or size word counts only inside a found item ("a brown coat"), a name-like
  place word only right after a determiner ("by the river"), and neither when capitalised after the first word.
  A found item now also ends at punctuation, so it never runs into the next sentence. found-kind.json gains 7 cases.
  Source: review. Verified: three new cases and a generated check (29 name-like words, both cases, 5 shapes) failed
  first; the item crossing a sentence ("found a hat. brown nearby") was the last failure, fixed by the punctuation
  stop; all pass now with the engine's 372 tests, typecheck and lint; the web's unit tests and CI's Python gates pass.
- Engine: correctFoundKind's object-note vocabulary grows with words that cannot name a person: places and terrain
  (fence, bridge, bench, tree, parking lot, porch, yard, rock, hill, gate, ...), positions, more colours, materials
  and sizes, what happened to an object (snagged, caught, hanging, buried, ...), and clue objects (wrapper, cup,
  paper, receipt, tissue, can, ...). found-kind.json gains 10 cases: "Found a coat snagged on the fence" and a cup and
  wrapper by the pond become clues, an unknown word ("smells of smoke") still keeps the model's kind, and the 10
  drill reports the phone's read path was tuned on, each with the kind the on-device model gave, all end with the
  right kind. Source: review. Verified: the two new clue cases failed first, then passed; the lists still share no
  word; the engine's 364 tests, typecheck and lint pass; the web's unit tests and CI's Python gates pass.
- Vectors README: the found-kind.json section describes the conservative rule (all three conditions, the two word
  lists, segment ids, the reason the human sees) and the generated checks. Source: review. Verified: hygiene guard
  and CI's Python gates pass.
- Engine: correctFoundKind is conservative by construction. A found reading becomes a clue only when every "found" in
  the note is followed by a determiner and a known object, every word of the note is a known object-note word
  (OBJECT_NOTE_WORDS: determiners, objects, place, colour, direction and clue words, a short list of where and state
  words, numbers, a two-capital segment id in a note that is not all capitals), and no word could name the person
  (PERSON_WORDS, now with family and relation words; a profile name). The reason now says the model said found:
  "Read as a clue: an object was found, not the person. The model said found; check the note." found-kind.json gains
  8 cases. Source: review ("Found a coat and grandma nearby" and "Found a glove. Found mom too" came back as clues).
  Verified: the new cases, a check of more than 2,600 generated notes (an object beside a family word, a name, or a
  second find of a person) and a check that the two word lists share no word failed on the previous rule, then
  passed; the engine's 354 tests, typecheck and lint pass; the web's unit tests and CI's Python gates pass.
- Vectors README: the found-kind.json section now lists the full rule (determiners including possessives, every
  kind of person-found word, when "her" is a possessive) and every way the rules parser's kind differs from the
  rule's, with the line that a platform follows `kindOut`. Source: review. Verified: hygiene guard and CI's Python
  gates pass.
- Engine: correctFoundKind keeps every note that could say the person was found. It now also treats as person-found
  he, she, they; words for a person (man, woman, lady, child, body, ...); the person's state (alive, conscious, awake,
  talking, hurt, injured, ok, fine, dead, ...); and the response to them (ambulance, EMS, medic, paramedics, 911,
  hospital, CPR). It also reads possessive his, their and her as determiners, so "Found her coat by the creek" and
  "Found his glasses on the trail" become clues; "her" counts as a possessive only when spaces alone separate it
  from a known object, so "Found her, coat nearby" and "Found her blue coat" stay found. found-kind.json gains 12
  cases. Source: review (seven person-found notes, such as "Found a coat, she is sitting by the creek", came back
  as clues). Verified: the new cases and a check that 660 notes pairing a found object with a way of saying the
  person was found are never corrected failed first (10 of 31 tests), then passed; the engine's 344 tests,
  typecheck and lint pass; the web's unit tests and CI's Python gates pass.
- Engine: correctFoundKind(reading, note, names) in `shared/engine-ts/src/found.ts` runs found-kind.json. A `found`
  reading becomes a clue when the note has "found a/an/some/the" then a known object and no word says the person was
  found (him, her, them, subject, person, patient, located, safe, breathing, "with us", or a word of the profile's
  names); its item (up to three words) and feature come from the note as the phones' rules parser reads them, and
  FOUND_AS_CLUE_REASON ("Read as a clue: an object was found, not the person.") is returned for the UI and the
  receipt. Any other reading comes back unchanged. Source: the found-kind vectors. Verified: the new engine test
  (every case, the reason, the input left untouched, and each case's parserKind against a copy of ReportParser.kind)
  failed first (no export), then passed; the engine's 331 tests, typecheck and lint pass, with every existing vector;
  the web's 919 unit tests and CI's Python gates pass.
- Vectors: new `shared/test-vectors/found-kind.json` (16 hand-written cases) and its README section: a model reading
  of kind `found` checked against its note. "Found a blue coat by the creek in BO" and "Found a shoe on the path in
  segment BP" become clues with their item and feature from the note; "Found him by the creek, he is safe", "Found
  Mr. Lee near the bench" (a profile name), "Found his coat and then found him", "found a man" and a sighting stay as
  they are. Each case also records the phones' rules parser's own kind for the note. Source: a model read those two
  notes as the person found. Verified: the file is well formed JSON and every value is one the reading schema allows;
  the engine rule that runs it follows in the next commit.

## 2026-11-20

- Drill retention, review fix: startPurge starts or resumes each purge in one transaction that reads the incident and
  its purge record together and returns the sign-in cutoff. With the incident gone, only an unfinished record resumes,
  with its own cutoff, so a stale run never reopens a purge another run finished; with the incident there, the cutoff
  is its close (a kept drill past its end date: the earlier of its close and that date, an open one closed at that
  date, never over a recorded close), never later than an unfinished record's cutoff, and the record is written in the
  same transaction. Source: review (second-model: the purge ignored the close transaction's result). Verified: 3 new
  startPurge tests (a close recorded after the scan, an open kept drill and a later close, a finished purge and an
  unfinished one) failed first, then pass; functions suite 289.
- Drill retention, review fix: a kept drill purged on its end date uses one sign-in cutoff on every run and retry (its
  real close if it had one, else its end date), and an open one is closed at its end date in a transaction that never
  overwrites a close that landed meanwhile (stampKeptClose). Source: review (second-model: a retry could widen the
  cutoff; the stamp could overwrite a real close). Verified: 3 new tests (the stamp, the retry cutoff, a close after
  the scan) failed first, then pass; functions suite 287.
- Drill retention test: a kept drill that is closed but has no closedAt is purged once its end date passes, with the
  run's time as its close. Source: review. Verified: passes on the existing fix (this case takes the same path as an
  open kept drill, which failed first in the previous commit); retention tests 22.
- Drill retention: a kept drill is purged once its end date (2027-01-01) passes, whether or not anyone closed it; an
  open one first gets the server's closedAt, then goes the same durable way (purge record, media, join codes, the
  incident, idle sign-ins). An open drill that is not kept is never touched. Source: review (an open drill is never
  deleted, so the kept drills would have outlived their date). Verified: 2 new tests (an open kept drill past its date
  is purged while an open drill that is not kept stays; the server's closedAt is written before the purge and not in a
  dry run) failed first, then pass; functions suite 283.
- Drill retention: every kept drill (drill-dev-1, drill-judge-1, drill-kennesaw-1, drill-test-1) is kept until
  2027-01-01 and then deleted like any other closed drill; none is kept for ever. LIMITS and the production checklist
  say so. Source: review (a simple, true privacy line; judging ends 2026-12-16). Verified: the keep-list test failed
  first (the development and judge seed drills were kept for ever), then passes; functions suite 281. Production on
  2026-11-21: 4 drills, all open, so no closed drill lacks a closedAt.
- README lists drill retention among the Cloud Functions, and LIMITS records that the job is live (since 2026-11-21
  03:02 UTC) and that its first run, started by hand, deleted nothing because every drill was open. Source: review.
  Verified: the deploy log, the live ruleset read back, the scheduler job ENABLED, a throwaway drill's closedAt equal
  to its close commit time, and the run's log line (deleted 0, failed 0).
- Drill retention keeps drill-test-1 until 2027-01-01, like drill-kennesaw-1: every live check and the daily probe use
  it, and the seed tool refuses a purged id, so an accidental close would have broken them inside judging. LIMITS and
  the production checklist list it. Source: review. Verified: the keep-list test failed first (drill-test-1 not kept),
  then passes; functions suite 281.
- drill-day, section 2: a new step 4 says to tap Allow when iOS asks to allow Live Activities on the first start of a
  drill, while there is still signal, so the lock screen shows the team's status; the later steps and section 5's
  reference move by one. Source: review (the prompt was seen on a physical iPhone, 2026-11-20). Verified: the
  three lock-screen lines against ios/PLSWidgets/TaskLiveActivity.swift and
  ios/PLSCore/Sources/PLSCore/TaskStatus.swift.
- Drill retention: starting a purge clears both done and stale marks, so a drill once marked stale that later becomes
  due is retried by the next run when its purge fails partway. Source: review (second-model, fourth round). Verified:
  a new test (a stale record, the drill due, sign-in deletes failing after the root is gone, then the next run) failed
  first, then passes; functions suite 281.
- LIMITS, Drill data retention: tombstones and the seed tool's refusal of a purged id, and the one race left open (a
  sign-in idle since the close that joins another incident in the instant before its delete; its person signs in again
  and rejoins with a code). Source: review. Verified against functions/src/retention.ts and tools/seed/seed_drill.py.
- Drill retention: purge records are kept for good as tombstones (doneAt when finished, staleAt when the id was in use
  again) instead of being deleted, so the seed tool can refuse a purged id; a finished purge is never resumed; each
  unfinished record is handled on its own, so one that cannot be written fails alone and the other drills are still
  purged. Source: review (second-model, third round). Verified: 3 new tests (a tombstone not resumed, a stale record
  left alone on the next run, one failing record beside a due drill) and 3 updated ones failed first, then pass;
  functions suite 280.
- Seed tool: refuses to create a drill, or add a code to one, when the drill retention job holds a purge record for
  its id, and fails closed when the record cannot be read; checked before anything is written to the Keychain or
  Firestore. Source: review (second-model: a purged id seeded again would carry old sign-ins' claims and could be hit
  by a resumed purge). Verified: 3 new tests failed first, then pass (18).
- LIMITS, Drill data retention: a reused id's record is dropped, the last join-code sweep, sign-ins used after the
  close are kept, and the 2026-11-21 audit (no drill had a closedAt before the rules made it the server's). Source:
  review. Verified against functions/src/retention.ts and a read of every production drill.
- Drill retention, second review round: a purge record keeps the drill's close time and resumes only while its
  incident is gone; a record whose id is in use again is dropped without deleting anything; a sign-in is deleted only
  if nobody used it since the drill closed (a person joining anything refreshes their token first); a last join-code
  sweep runs after the incident is deleted; the job's log line counts dropped records. Source: review (second-model).
  Verified: 3 new tests (a reused id, a sign-in used after the close, a join code written during the purge) failed
  first, then pass; functions suite 278; ci-local gates, ts and rules pass.
- LIMITS, Drill data retention: the purge record and the next-run finish, join codes, the last media sweep, the
  commit-time closedAt and the re-read before a sign-in is deleted. Source: review. Verified against
  functions/src/retention.ts and functions/src/index.ts.
- Rules test: no client reads or writes a drill purge record (ops/drillPurges/items), signed in or not. Source:
  review. Verified: the functions suite passes (275).
- Drill retention, after a second-model review: a purge record (ops/drillPurges/items/{id}) is written before anything
  is deleted and cleared only when every step succeeded, so a run that stops partway, even after the incident root is
  gone, is finished by the next one; the drill's join codes are deleted; a last media sweep after the incident is gone
  catches an upload made during the purge; each sign-in is read again just before deletion and kept if it joined
  another incident; a deleteUsers result with failures keeps the record. closedAt is the close write's commit time,
  set in a transaction only if absent, and the trigger retries. Source: review (second-model). Verified: 9 new
  failure-injection tests (resume from the record with the root gone, failed sign-in deletes, a sign-in that moved, a
  late upload, a repeated close event) failed first, then pass; functions suite 275; ci-local gates, ts and rules
  pass.
- LIMITS gains Drill data retention (what is deleted and when, the server's closedAt, the orphaned anonymous sign-ins,
  the keep-list, the iPhone practice drill staying on the phone); the production checklist gets the job's row. Source:
  review (drill retention). Verified against functions/src/retention.ts, firestore.rules and
  ios/PLS/App/AppModel.swift; on 2026-11-21 every drill in production was open, so nothing is due before 30 days after
  the first close.
- functions/src/index.ts: recordDrillClosedTrigger (incident updates) and deleteEndedDrillsJob (daily 07:41 UTC,
  counts only in its log line). Source: review (drill retention). Verified: functions typecheck; the functions suite
  passes (270); ci-local ts and rules sections pass.
- functions/src/retention.ts: closedAtPatch and recordDrillClosed write the server's closedAt once, when a drill
  becomes closed; deleteEndedDrills deletes every drill closed more than 30 days ago (media prefixes first, then the
  incident recursively, then its orphaned anonymous sign-ins), keeps drill-dev-1, drill-judge-1 and drill-kennesaw-1
  until 2027-01-01, leaves a drill whose media cannot be deleted for the next run, and has a dry run. Source: review
  (drill retention, approved). Verified: 9 emulator tests failed first (no module), then pass.
- Rules: closedAt on an incident is server-owned, like mode and expiresAt, so no client can move a drill's deletion;
  command still closes a drill. Source: review (drill retention). Verified: a new rules test failed first (command
  could write closedAt), then passes; the functions suite passes (270).
- README gains How we built it: the AI paths (all through Firebase AI Logic), the Firebase products, the apps'
  frameworks, the engine and its Swift port, the shared rules Android ports, the data, the checks, and the build
  process with evidence in the repository (Claude Code; Codex reviews on pull requests). Source: review. Verified:
  every item against a dependency or import in the shipped code.
- README, judges line: the published run is now described as test family reports and plans, the run label's new words;
  scripts/test_readme_run_label.py fails CI when README.md stops containing the label's description (it reads
  web/public/evidence/published-run.json). Source: review (the README and the judge card must say the same thing).
  Verified: the test failed first on the old words, then passes.
- SECURITY row 6: the four server prompt templates are locked, with the read-back: locked true and the same template
  text by SHA-256, an identical-text write refused (HTTP 400 FAILED_PRECONDITION), template calls still answering 200
  after the lock, and the publish dry run matching the repository. Source: review (Firebase recommends locking
  templates used in production). Verified: GET of each template after modifyLock; the refused PATCH; serviceruntime
  request counts per minute (TemplateGenerateContent 200 at 01:56:52Z and 01:57:52Z); scripts/template_publish.py dry
  run.
- README, judges line: the published run is described in the judge card's own words again (the run file's label:
  Piedmont Park, Atlanta: the build's own test reports and plans, 2026-11-18 to 19), not a separate count. Source:
  review (the README and the judge card must say the same thing). Verified: the README contains the label text of the
  live /evidence/published-run.json.
- LIMITS: Apple's Foundation Models acceptable-use terms, quoted (no official use in connection with law enforcement
  or criminal justice; no decisions without human supervision with a material impact on individual rights in high-risk
  domains); the iPhone reads with a model only in drill and judge incidents (ReadPlan.swift) and command approves
  every assignment change; we cannot verify Apple permits use on an official search. Source: review. Verified: both
  quotes word for word from Apple's Acceptable use requirements for the Foundation Models framework page (read
  2026-11-21); ReadPlan.modelModes is drill and judge.
- Production checklist: the minimum_version_android item no longer waits for the repo to go public on 2026-11-28; the
  repo is public and /releases/latest opens the android-judge release with its APK, so the key is raised only when a
  newer release APK is published. Source: review. Verified: /releases/latest answers 200 and resolves to
  releases/tag/android-judge for a signed-out request.
- README, judges line: the judge page names the cloud model and says whether the laptop's built-in model is ready (it
  does not name an on-device model). Source: review. Verified against web/src/judge/judge.ts.
- SECURITY row 1b: App Attest PASSED on a physical iPhone (2026-11-20, Ad Hoc Release build, App Attest production:
  attestation and assertion exchanges 200, Firestore reads VALID before enforcement); it said PENDING. Source: review.
  Verified: Cloud Monitoring reads at 21:22Z and 21:28Z on 2026-11-20; docs/TEST-MATRIX.md build 8 rows.
- README and SECURITY: four calls use server prompt templates, not three; the web photo read calls pls-photo-cues-v1
  (photoTemplateGenerator in web/src/ai/client.ts, used by CommandPost's readPhotoCloud since 65ee825a), so SECURITY
  row 6, the call-table intro and the photo row say so. Source: review. Verified against
  web/src/command/CommandPost.tsx:455.
- served_version_check compares the served commit's production inputs with origin/main's instead of checking ancestry,
  and refuses a shallow clone, a missing origin/main and an unknown served commit. Source: review (second-model).
  Verified: 12 real-git tests; the live site fails today because main's engine changes are not deployed.
- Daily probe: a new step fails when the live site is not built from main's production inputs
  (scripts/served_version_check.py reads /version.json and compares the served commit's web app, shared engine and
  data, hosting config and package files, without tests, e2e specs, harness pages or markdown, with origin/main's; it
  also fails a dirty build, a shallow clone, a missing origin/main and a served commit the repository does not have).
  Content is compared, not ancestry: a squash merge with the same code passes, a build from a branch ahead of main
  with other code fails, and a test-only main commit asks for no deploy. The probe checks out full history for it.
  The production checklist records the cron's measured lag (about 8 h) and that the 2026-11-19 scheduled run failed
  because an Actions budget blocked it before it started. Source: review (the live site lagged main after a merge;
  a second-model review found ancestry accepted a branch build with other web code). Verified: 12 tests against real
  git repositories (behind main, ahead of main with other code, squash-equivalent, test-only main change, a checked
  out feature branch, a missing commit, dirty, no origin/main, shallow); live it fails today, correctly: the site
  serves 17c20055 and 16 production files on main differ, starting with shared/engine-ts/src/found.ts. The retire
  date is pinned in scripts/test_judging_window.py.
- LIMITS, Search model: only a sighting seen later than every prior input moves the start; the first-missing time is
  not stored; a confirmed camera clip always moves the start, so command checks its time first. Source: review.
  Verified against web/src/prior/sightingPrior.ts and web/src/prior/cameraPrior.ts.
- LIMITS, Search model: a command-confirmed sighting with a place and a time becomes the new last known point (the
  ring prior is rebuilt from it, with the wedge from its direction); the rings have no time term, so the command post
  states the sighting's age instead; a sighting with no place, or confirmed only by the family, still moves the map
  only as a clue; the map before the rebuild is not kept. Source: review. Verified against
  web/src/prior/sightingPrior.ts and the camera path it reuses.
- Judge page route-order check: waits for the replay region before reading the route's targets, since the replay step
  points at #d1-h until the run file loads and that section then goes away; without the wait it timed out in CI.
  Source: CI. Verified: the check passed 3 runs in a row locally and the full no-backend set passes (34).
- Judge page: links the published Android release (android-judge, point-last-seen-family-424e5f9c.apk with its SHA-256
  file) as "Android family app" (ANDROID_RELEASE_URL in web/src/judge/judge.ts), and the numbered three-minute route
  now follows the page's own order, the cloud model before the laptop step. README's Android row points at the
  release. Source: review (judge reachability; live QA of the route order). Verified: the release page and the APK
  answer 200 to a signed-out request; the new unit test and the e2e checks for the Android link and the route order
  failed first, then pass; web typecheck, 923 unit tests, the build and 34 no-backend browser checks pass.
- SECURITY row 12: the cloudGuard log's path field reads direct for every call, template calls included, because AI
  Logic hands the trigger a template call already expanded (the template's system instruction and output schema, no
  template name), so the trigger cannot tell them apart; template use is shown by the apps' code. Source: review.
  Verified in Cloud Logging on 2026-11-20: the web sighting note (22:26:29Z), the Android clip read (22:10:53Z) and
  the iPhone voice (21:03:15Z), all template calls in the apps' code, each logged path direct, template null, with
  systemInstruction and _responseJsonSchema present on the two text templates; functions/src/cloudGuard.ts sets path
  from data.template alone.
- Judge page links: the judge page now links the iPhone's recorded runs (docs/evidence/ios) and the test matrix
  (docs/TEST-MATRIX.md) on GitHub, beside the command post and the source; the links come from judgeLinks in
  web/src/judge/judge.ts, where the Android release and the TestFlight link are null until each is public, so no dead
  link ships. README's iPhone row points at the recorded runs while TestFlight waits on Apple; the production
  checklist no longer says the repo goes public on 2026-11-28 (it is public now). Source: review (judge reachability
  audit). Verified: all four external links answer 200 to a signed-out request; web typecheck, 922 web tests
  (judgeLinks tests red first), the web build and 33 no-backend browser checks pass locally.
- SECURITY call table and the drill-day page now say when each cloud read actually happens, checked against the code
  on each platform. The iPhone report read goes to the cloud only when Apple's model is not available, does not
  support the phone's language or the report is over its token budget, and only online, with Allow cloud reading on,
  kill_cloud off and iOS 27 (RouterPolicy.swift); a refused, unparsed or timed-out report is not sent. The Android
  family note uses the phone's model when it has one and, without one, the cloud only after "Send to the cloud", never
  under kill_cloud or for a non-English note; it starts at "Sort it" and joins the profile only on "Add to profile"
  (FamilyNote.kt, NoteScreen.kt). The Android clip read starts at "Read the clip" after three consents. The web clip
  read runs an on-device check first that can send only the flagged seconds or nothing (ClipIntake.tsx). The drill-day
  route check is offered in any drill or judge incident, including drill-kennesaw-1, so the page says not to run it
  there. Source: review (cloud-read audit). Verified: each statement against the cited file on main; the iPhone read's
  streaming is consistent with Cloud Logging (no cloudGuard line for the 21:09:26Z iPhone cloud read, while its voice
  calls do log).
- Drill day, iPhone cloud-reading switch (part of the iPhone sections): it is on for Stephen's iPhone in this drill
  and the volunteers' choice on theirs, and because it is off by default and not saved (ios/PLS/App/AppModel.swift,
  cloudConsent = false, in memory only) the checklist says to turn it back on in Ready check after any relaunch.
  Source: the iPhone team's correction. Verified in AppModel.swift.
- Drill day: two iPhone sections from the iPhone team. Before leaving signal: check the build over USB (build 8,
  commit 8dfa5358), the Ready check rows, location, the cloud-reading switch (off whatever it says on iOS 26), the
  filming caption, and the practice-only route check. After the drill: list and copy the phone's outbox and any
  route-check file with devicectl, read the outbox before anything goes into the repository, and do not reinstall
  before pulling. Sections renumbered. Source: the iPhone team's drill-day lines. Verified: every on-screen string and
  path quoted (Before you leave signal, Check both read routes, Allow cloud reading, Allow location, Pack: loaded,
  Show sources, the filming caption, route-check-, PLS/outbox.json, PLS-practice) is in ios/PLS or PLSCore on main.
- LIMITS, Language: every platform now screens a note before the cloud read (the web since #158, with the iPhone and
  Android), so the section states the shared rule and where each platform runs it, what the person sees (fill the
  fields by hand; pick on the iPhone), and its limits: it is a word count, a short note in another language can pass
  ("Ella no está aquí"), and a note in another Latin-script language such as French passes. The old line that any
  non-English note can go to the cloud is gone. Source: the language screen on all three platforms. Verified against
  shared/constants/language-words.json (matching, 90 foreign words), shared/test-vectors/language.json (knownMiss) and
  the three screen files on main.
- Phone vectors: the iPhone takes the current Android rule (#157), so "ios" leaves pendingOn on its last five cases
  (bare minus between decimals, an ordinal with no street word, and three times joined to digits) and no case is
  pending on any platform; LIMITS states 52 of 52 on Android, the iPhone and the web. Source: the iPhone port.
  Verified: with every mark cleared, the iPhone's PhoneNumber tests (32 tests), the web's phoneVectors.test.ts (53)
  and Android's PhoneVectorsTest pass locally; scripts/test_phone_vectors.py checks the counts (6 passed).
- A judge sandbox now counts as live only with an explicit `setupReady == true`: `firestore.rules` liveFor and
  `storage.rules` notExpired read `get('setupReady', false)`, and `deleteIncidentMediaNow` requires `setupReady ===
  true`. Before, a sandbox with no flag (made before setup was tracked) counted as ready; every such sandbox has
  expired, and `startJudgeSession` always writes the flag. Source: review (setup gate, medium 3). Verified test first:
  three new no-flag assertions (rules, storage, deleteIncidentMediaNow) failed, then passed with the change;
  live-judge fixtures now carry the flag; rules and functions suite 256 of 256.
- Tests: the expired, no-expiry and expiry-edit judge sandbox tests (rules, storage, delete media, join) now give
  their sandbox `setupReady: true`, so each fails only for the reason it names and would catch a removed expiry check.
  Source: review (Codex round 1, low). Verified: suite 256 of 256.
- `joinIncident` refuses a judge sandbox whose setup is not finished (`setupReady !== true`), as the rules do, so it
  never grants claims that every read would then refuse. Source: review (Codex round 1, low). Verified test first: the
  join test's no-flag and not-ready cases failed, then passed; suite 256 of 256.
- Phone vectors and LIMITS after the web took the Android phone-number rule (web/src/data/phoneNumbers.ts): "web"
  leaves pendingOn on all 23 cases it was pending on, so the web now runs every case; LIMITS says every platform
  removes a run of 7 or more digits, a count of a million or more and a decimal pair that starts with +, renames the
  section "Phone numbers in notes", and states the counts (Android 52, the iPhone 47, the web 52, the iPhone pending
  on five until it takes the current Android rule). Source: the web port. Verified: the web runner passes all 52 cases
  forced (the web team's run); scripts/test_phone_vectors.py checks the LIMITS counts against the file (6 passed).
- Phone vectors: the pending marks for the web now match what the web does. Measured against
  web/src/data/sightings.ts, the web passes 29 of the 52 cases; five it fails were unmarked (spaced_digits,
  spoken_digits, uk_international, mexico_international, us_slashes) and now carry pendingOn web, and 17 it passes
  were still marked and are now unmarked. LIMITS states each platform's pass count (Android 52, the iPhone 47, the web
  29), and scripts/test_phone_vectors.py checks those counts against the file. Source: review. Verified: a probe of
  the web function over every case (29 pass, the 23 failures all now pending on web); Android PhoneVectorsTest and the
  iPhone's PhoneNumberVectorTests pass locally on this file; the count test failed on a planted 51 and passes on 52.
- README and LIMITS: the command post's extras, as available features (whether the drill used each is filled in after
  its debrief): the ICS 204-shaped assignment sheet, GeoJSON export, radio cards and a match code check, the opt-in
  names and approach notes on the sheet and cards, the event-log replay from the current prior onward, and the
  Kennesaw-only terrain display layer; and a LIMITS section with their seven limits. Source: the extras hand-over at
  main 7afaee2. Verified: each feature is on main (Ics204View.tsx with v3.1, ExportButton.tsx RFC 7946,
  LazyRadioCodeCheck, printablePersonLines, ReplayPanel's "Earlier prior" line, and only
  kennesaw-mountain-drill.elevation.json under web/public/extras/terrain); no camera-read or space-time claim is made.
- Public run export: a report's route is its read's provenance (path, stage, model, reason, latencyMs and the rest of
  the route record), and the export's check now refuses a route whose values a route record cannot hold (enums from
  shared/schemas/route-record.schema.json, a model id of at most 80 characters, numbers for the times, a boolean
  sdkReported), so no note text can ride in one. The reading's content still never leaves on a report. Source: review
  (the replay's per-report provenance). Verified: tools/export-run tests 24 passed (the new route-values test failed
  first; a full reading with evidenceQuote exports only its route; a planted evidenceQuote is refused); typecheck
  passes.
- Grounding vectors README: where the rule applies. The web and the iPhone read notes into these fields; the Android
  family app has none to ground (its note read fills kind, label, summary and evidenceQuote; a family sighting's
  direction and colours are picked by hand; a camera clip's colours come from the frames, with no note or profile in
  the request). Source: the Android team's check at 720038b4. Verified: no shared/templates/*.json names the profile.
- Engine: groundReading(reading, note) returns a copy of a reading with each colour, direction, footwear or carried
  value the note does not support blanked (shared/engine-ts/src/ground.ts, rule and words from
  shared/constants/grounding-words.json). Each platform calls it after every read; the web wiring follows in its own
  change. Source: review (a read took blue from the subject's profile). Verified: test/grounding.test.ts runs every
  grounding.json case per field (32 tests, red before the function existed); engine typecheck, lint and all 312 tests
  pass.
- Grounding vectors: shared/constants/grounding-words.json holds the word lists and the rule for grounding a reading
  in its note (a colour or a direction stays only when its word is in the note, footwear or carried only when it
  shares a word with it; otherwise the field is blanked), and shared/test-vectors/grounding.json pins 26 cases, a kept
  and a blanked case for each of topColor, bottomColor, direction, footwear and carried, including the profile leak
  (blue from the profile). scripts/test_grounding_vectors.py checks both files and runs in CI. Source: review.
  Verified: pytest 4 passed; local gates pass.
- SECURITY row 14 and the production checklist: App Check is now ENFORCED on Firestore (since 2026-11-20 21:29:29 UTC)
  as well as Storage (since 01:47:55 UTC), with the verdict read that preceded each and the post-enforcement checks
  (64 of 64 live web specs, the daily probe run 44824078797, an iPhone read, Firestore VALID-only verdicts, and a REST
  read with no App Check token refused with 403). Source: the enforcement step. Verified: the enforcement mode read
  back ENFORCED; Cloud Monitoring verification_count 21:29 to 21:50 UTC showed Firestore iOS VALID 60 and web VALID
  711 and no denial.
- README: one line on what a person sees when no model reads (nothing is sent; the web receipt's fixed wording, the
  iPhone's rules mark, and the web and Android forms asking for the fields by hand), and the judge-page line now says
  the page replays the development drill's published run instead of "No published run yet". Source: review. Verified:
  wording copied from web/src/ai/receipt.ts, ios/PLSCore/Sources/PLSCore/Glyphs.swift and
  web/src/command/SightingForm.tsx; the live /evidence/published-run.json is the Piedmont Park development run.
- README, How the models are called: the iPhone route cites its basis, Firebase iOS SDK 13.0.0's
  FirebaseAI/CHANGELOG.md (lines 69 to 74 at tag 13.2.0: SystemLanguageModel and HybridModel removed; use
  ai.geminiLanguageModel(name:) with Apple's Foundation Models directly). Source: review. Verified: fetched the file
  at tag 13.2.0 (lines 69 to 74 hold that entry); ios/project.yml pins 13.2.0; ModelSessionFactory.swift builds
  LanguageModelSession(model: ai.geminiLanguageModel(name:)).
- SECURITY, Data and media: one paragraph on what Performance Monitoring records: one trace per model read with the
  route only and its latency, never text (the attributes each platform sends, Android's matching Analytics event, the
  iPhone's spoken-assignment trace), plus the SDKs' automatic page-load, app-start, screen and network samples.
  Source: review. Verified against web/src/telemetry/trace.ts, ios/PLS/AI/PerformanceTelemetry.swift,
  ios/PLS/AI/AssignmentSpeaker.swift and the Android Telemetry.kt.
- SECURITY: the plan-wording row's mode now matches the code, on-device first with a cloud fallback (PREFER_ON_DEVICE
  in web/src/ai/replanWording.ts); it said prefer cloud. Source: review. Verified: grep shows replanWording.ts sets
  InferenceMode.PREFER_ON_DEVICE and no other doc says prefer cloud.
- Phone vectors: Android (#122) now removes a time's minutes with its run, so "android" leaves pendingOn on
  time_joined_before_its_hour and time_after_zip_not_date; new mustRemove "Call GA 40455-5014 2:30 555-0142" (a time
  between a ZIP+4 and a number, which hid the number's short piece before #122), pending on web and ios. Source: the
  Android change and its review. Verified: PhoneVectorsTest passes locally on this branch with main at 720038b;
  scripts/test_phone_vectors.py 5 passed; local gates pass.
- Phone vectors: the two time cases stay pending on android. Android's rule removes the number but leaves the minutes
  ("Call [number removed]:42", "Call GA [number removed]:30"), which fails the no-digit-left check. Source: this
  branch's Android CI run. Verified: PhoneVectorsTest run locally on this branch: fails on each of the two cases with
  android unmarked, passes with both pending (all other cases run).
- Phone vectors: Android's rule (#109) now passes every case it was pending on, so "android" leaves pendingOn on 19
  cases (the grouped, Unicode-digit, two-CRLF, date, + pair, bare minus, ordinal and time cases); the web stays
  pending on all of them and the iPhone on the bare minus, the ordinal and the two time cases. LIMITS takes the
  Android branch's wording (the + bullet, the street-address and colon limits), so this branch's own street-address
  line is dropped as a duplicate. Source: the Android change. Verified: the Android team ran every pending case
  against #109; scripts/test_phone_vectors.py 5 passed; local gates pass.
- Phone vectors: the iPhone now reads a month and day as a date and removes a decimal pair that starts with + (#119),
  so "ios" leaves pendingOn on plus_before_decimal_pair and short_date_beside_number; LIMITS says the + pair is kept
  today on the web and Android only. Source: the iPhone change. Verified: the iPhone team ran the file with both marks
  removed before #119 merged; scripts/test_phone_vectors.py 5 passed; local gates pass.
- Phone vectors: exact case "Seen 11/19/2026 14:03 404-555-0142" -> "Seen 11/19/2026 14:03 [number removed]" (a date
  and a time both stay beside a removed number), pending on web and android; the iPhone gives this output today.
  Source: the iPhone team's run. Verified: scripts/test_phone_vectors.py 5 passed; local gates pass.
- Phone vectors: a time keeps its place only after a date or on its own beside a number; joined to other digits before
  its hour, or after a ZIP+4 code, it goes with the run (mustRemove "Call 1 404 555 01:42" and "Call GA 40455-5014
  2:30", pending on web, ios and android). LIMITS: a phone number written like a street address ("Call 5550 142nd St")
  is kept on the iPhone and Android. Source: review. Verified: scripts/test_phone_vectors.py 5 passed; local gates
  pass.
- Phone vectors, two more shared rulings: a bare minus between decimals with no space or comma is a number (mustRemove
  "Call 44.2071-23.4567"; the comma and space GPS keeps stay), and an ordinal stays apart only when a street word
  follows it (mustRemove "Call 4550 142nd"; keeps "12345 67th Ave" and "near 4550 142nd St"). Both removes are pending
  on web, ios and android (Android's rule for them is on its open branch). README says so. Source: review. Verified:
  scripts/test_phone_vectors.py 5 passed; local gates pass.
- Phone vectors: the exact case "Seen 11/19 555-0142" is pending on ios too. The iPhone rule reads a date only with
  three groups, so a month and day beside a number join it into one 11-digit run and the whole run goes. The iPhone
  team is adding a month/day date. Source: the iPhone team's run of #118's cases. Verified:
  scripts/test_phone_vectors.py passes; local gates pass.
- Phone vectors, two shared rulings: a decimal pair that starts with + is a phone number, not a coordinate (mustRemove
  "Call +44.2071, -23.4567", pending on every platform; the keep "GPS 33.7490, -84.3880" stays), and a date beside a
  phone number stays while only the number goes (exact cases for 11/19/2026, 2026-11-19, 11/19 and "Nov 19 2026"
  beside a number, plus a word between; mustKeep "Seen 11/19/2026 14:03"; pending on web and android). "404/555/0142"
  was already a mustRemove. README and LIMITS say so. Source: review. Verified: scripts/test_phone_vectors.py 5
  passed; local gates pass.
- Phone vectors: the iPhone now removes a grouped count of seven or more digits (#116), so "ios" leaves pendingOn on
  grouped_phone_number and adlam_grouped_number; LIMITS says a comma-written phone number is kept today on the web and
  Android only. Source: the iPhone grouped-count change. Verified: the iPhone team ran main's file with these marks
  removed against #116 before it merged; scripts/test_phone_vectors.py 5 passed; local gates pass. Correction to the
  grouped-count entry below: that file has 5 tests (one of them new), not 6.
- Vectors README: a grouped count is no longer listed as search information that can shield itself inside a run. Under
  the 7+ digit ruling the grouped-count span always holds 7 or more digits, so it can never apply; the iPhone and
  Android rules both drop it. "walked 12,345 steps" on its own stays a keep. Source: the iPhone and Android reviews.
  Verified: local gates pass.
- Language screen: the shared rule now says to judge the note as the person wrote it, before phone numbers are
  removed, since the [number removed] token adds English-looking words that hid a non-Latin note; two mustRefuse cases
  pin it ("Бабушка ушла 404-555-0142", "奶奶的電話是 一二三四五六七"). Source: the Android and iPhone reviews of the screen.
  Verified: looksEnglish refuses both as written and would pass them after cleaning (checked first); 32 engine
  language tests pass.
- Phone vectors: a grouped count of seven or more digits is now a number (privacy wins ties): the keep becomes "walked
  12,345 steps" and mustRemove "Call 4,045,550,142" is added, pending on web, ios and android. Seven more cases from
  the Android review: mustRemove "Call OH 41234-5678" and an Adlam grouped number (both were keeps that let a phone
  number through), a spacing accent, NEL, dingbat digits and 幺 inside a number, and mustKeep "Seen Nov\r\n\r\n19
  2026". The contract's no-digit-left check now catches a number character in any script (Unicode Nd, Nl, No), not
  only 0-9. README and LIMITS say so, including that a comma-written phone number is kept today. Source: review.
  Verified: scripts/test_phone_vectors.py 6 passed, including a new test that an Adlam or a dingbat digit left behind
  fails the contract.
- Vectors README: the phone-number reference rule names its file,
  android/app/src/main/java/app/pointlastseen/family/core/PhoneNumbers.kt (the iPhone's matches it), and states it as
  that file does: seven or more digits in a row, joined by short separators; search information inside a run stays
  only when the rest of the run is nothing or whole numbers of seven or more digits, otherwise the whole run is
  removed; an ordinal never joins others. Source: review (the Android port is the reference). Verified against the
  file's header comment on main 3aa206e.
- Phone-number vector: two mustKeep cases split by CRLF ("Seen Nov \r\n19 2026" and "GPS 33.7490,\r\n-84.3880"),
  so a line break inside a date or a coordinate pair never joins its digits into a number on any platform. Pending on
  web. Source: the iPhone parity sweep against the Android rule. Verified: the vector test passes.
- Phone-number vector: the new cases are pending on web only; the iPhone port of the reference rule passes them all,
  so iOS runs them. Source: review. Verified: the vector test passes.
- Phone-number vector gaps (from the Android port's review): 6 more mustRemove (dotted pairs 06.12.20.26.19, a number
  glued to a date, U+2011, U+2010 and U+2013 hyphens, a number split by CRLF), 5 more mustKeep (GPS pair, ZIP+4,
  grouped count 1,234,567, 12345 67th Ave, 5km), and a new exact case type checked byte for byte ("Seen at 14:03,
  404-555-0142" becomes "Seen at 14:03, [number removed]"; the shared replacement token is now in the file). New cases
  carry pendingOn [ios, web]: a runner skips cases pending for its platform. The contract and the reference rule (the
  Android family app's) are in the vectors README. Source: review. Verified: the vector test passes and fails a
  scrubber that does nothing, wipes the note, or writes a different token.
- Route reason `not_english` (route-record schema enum and engine-ts RouteReason): the language screen refused the
  cloud read because the note does not look English, so the read went to no cloud model and fell to the platform's own
  path. Distinct from on_device_unavailable, so command sees why. Source: the iPhone language-screen port. Verified:
  schema parity ok (13 schemas, 31 platform types), engine typecheck and tests pass; the iPhone already decodes an
  unknown reason safely.
- Language screen before a cloud read (row H decision): `shared/constants/language-words.json` holds the rule and two
  word lists (429 English, 90 Spanish, Portuguese and Vietnamese function words, none shared); a note is refused for
  the cloud read when more than half its words are non-Latin, or when it has 3 or more foreign words and more than
  twice as many as English ones. `shared/test-vectors/language.json`: 18 must-allow (including 6 English notes quoting
  Spanish), 9 must-refuse (es, pt, vi, ko) and 1 known miss ("Ella no está aquí" passes). The web runs `looksEnglish`
  from shared/engine-ts; iOS and Android port it. Source: review (evidence in another language escapes the English
  pre-screen). Verified: 30 engine tests pass; the rule refuses 0 of 325 English sentences from the repo's docs, where
  a one-sided English-share rule refused 22%.
- LIMITS: a family's edit before its first publish reaches the search for single fields; for a list or set field it
  reaches the search only where command's profile lacks that field; after the first publish, an edit to such a field
  sends the phone's whole list, replacing what command added. Source: review of the Android profile publish change.
  Verified against the Android code on main (EditableFields.sendable passes single values only; FirstPublish.of; the
  Fields path sends changed values whole with doc.update).
- judge_drill.py, review round 3 (four medium, one low; the last round): a reset now deletes what judges wrote under a
  team (devices and their measurements) while keeping the team doc; deletes a segment the validated seed no longer
  has, in the same atomic commit as the baseline, and --check flags such a segment (the iPhone refuses segments at
  mixed prior versions); polygon positions must be finite and rings must hold at least 4 positions; the dry run counts
  exactly what a reset deletes. A reset commit holds at most 500 writes, so a grid of up to about 400 segments resets
  and a larger one is refused rather than split (kept on purpose: atomic, and the largest drill grid has 338
  segments). Verified test first: 2 new tests failed, then passed; 15 judge_drill tests; the live --check and dry run
  exit 0.
- seed_drill.py --expires accepts ASCII digits only and refuses an impossible date the same way, never repeating the
  value. Source: review round 2 (low). Verified test first: three new bad values failed, then passed; 15 seed_drill
  tests.
- judge_drill.py, review round 2 (one high, four medium): a reset never deletes under segments or teams, so a seed
  missing a doc cannot remove one the drill needs; the seed must have every team and segment its plan names, and a
  gridId, gridAttribution, priorVersion and engineParams; segment numbers must be stored as Firestore numbers (a
  timestamp is not one) and polygon positions as number pairs; the baseline write and the delete of any stale plan are
  one atomic commit, so a failed delete can never leave an old plan beside a new baseline; ids from Firestore names
  are used as they are (never unquoted, so two ids cannot merge). Verified test first: 4 new tests failed, then
  passed, plus a guard that the real media delete takes 404 as gone and raises otherwise (13 judge_drill tests); the
  live --check still exits 0.
- judgeDrill rules tests: the segment refusal now uses a write command may make (prior unchanged), with command making
  the same write as a control, and the family profile control changes a value the fixture does not already hold, so
  neither passes for the wrong reason. Source: review round 1 (low). Verified: rules and functions suite 260 of 260.
- seed_drill.py --expires: an invalid or past value is no longer repeated in the error, so a code pasted into the
  wrong argument never reaches the screen or a log. Source: review round 1 (low). Verified: 15 seed_drill tests pass.
- judge_drill.py hardening (review round 1: two high, two medium, two low): the seed is refused unless its segments
  pass the apps' contract and it has profile/shared; --reset rewrites the baseline first, then deletes extras, then
  media, and a media file already gone (the clip trigger removes clips with their readings) counts as deleted, so a
  reset that stops part way never leaves the drill without its baseline; the walker lists parents that were never
  written (showMissing) and pages collection ids; --check fails on a plan the baseline does not have and on a stale
  incident field, and --write clears such a field; doc ids are quoted in URLs. Verified test first: 4 new tests
  failed, then passed (8 judge_drill tests); the live --check still exits 0.
- Judge drill `drill-judge-1` SEEDED in the live project (evidence `docs/evidence/drill/drill-judge-1-seed.md`): made
  by seed_drill.py, baseline written from the judge seed (73 docs; --check ok; segment contract 68 docs at prior
  version 5), and one searcher and one family code for judges, each with expiresAt 2026-12-17T23:59:59Z, kept only in
  the Keychain (account drill-judge-1-judges). PRODUCTION-CHECKLIST: a judging-window row and two lines (check before
  2026-12-10, revoke after judging). Source: review (a judge cannot reach the phone apps). Verified: the read-back in
  the evidence file.
- `tools/practice/judge_drill.py`: the shared judge drill `drill-judge-1`, built from the judge seed so it tells the
  same story as /judge and the iPhone practice pack: the incident fields judgeSession.ts copies, segments, teams,
  profile/shared and the pack's plan (approvedByUid `judge-drill-baseline`), as a training drill (mode drill, the
  drill label, "Judge drill" in the name). `--check` compares the baseline docs with the seed and counts what judges
  added; `--write` applies the baseline; `--reset` lists what a reset deletes (docs judges added, through nested
  collections, and their media) and `--reset --yes` does it, for drill-judge-1 only and never from 2026-12-10 to
  2026-12-16. Values are copied as Firestore stores them. Source: review (judge codes). Verified: 4 tests (baseline
  overrides, drift caught, reset refusals, bad arguments change nothing).
- Rules tests for a judge drill shared by many judges (`functions/test/rules/judgeDrill.test.ts`): no searcher or
  family member can close, relabel, pause, re-plan or delete the drill, or write its segments, teams or shared profile
  deletion; a searcher cannot change, delete or forge another member's report; a family member cannot change an answer
  another gave; a searcher cannot write the profile while a family member's normal edit passes. Each test also has a
  write that succeeds (the drill's command, a member's own report, the first answer), so a refusal cannot come from a
  broken setup. Source: review (judge codes). Verified: rules and functions suite 260 of 260.
- `seed_drill.py --add-code ... --expires <UTC time>`: an extra join code can carry `expiresAt`, after which
  joinIncident refuses it (the check already existed in join.ts; the tool never wrote the field). The time must be
  written YYYY-MM-DDTHH:MM:SSZ and lie in the future, or nothing changes. Source: review (judge codes that end after
  judging). Verified test first: the expiry field and the refusal of five bad times failed, then passed; 15 seed_drill
  tests pass.
- Phone-number vector: dates are kept on every platform. Four mustKeep cases added ("11/19/2026", "2026-11-19",
  "11/19", "Nov 19"), pinned in `scripts/test_phone_vectors.py`; "404/555/0142" (3-3-4 grouping) stays mustRemove. A
  date in a note is search information, not a phone number. Source: review (a slash fix on one platform began removing
  dates). Verified: the vector test passes, and a scrubber that removes any 7-digit run joined by / or - fails the
  contract on 11/19/2026 and 2026-11-19.
- `docs/TEST-MATRIX.md`, linked once under the README's ships table: one row per platform and model path (mode and API
  with file:line, the model as recorded, hardware and OS or browser, channel, date, result, tracked evidence). Rows
  that never ran say Not run and why: web on-device note read and plan wording, Android on-device (the A16 has no
  AICore), and both iPhone paths (no docs/evidence/ios yet). `scripts/test_test_matrix.py` (CI and ci-local lists)
  fails on an untracked evidence file, a code line that no longer holds its call, a Not run with no reason, or a Not
  run row once its evidence folder exists. Writing it found that the clip-read row's measurement page was removed
  after its run (9db2ddb); the row now says so. Source: review (no test matrix). Verified: 3 tests pass.
- LIMITS, new Language section: notes are expected in English; what each check knows (web on-device asks for English,
  iPhone on-device only for a supported phone language, the iPhone parser and the evidence pre-screen know English
  words, phone numbers US formats on web and Android); a note in another language can still go to the cloud model,
  unmeasured, and evidence in another language escapes the pre-screen. Source: review (language scope not stated).
  Verified against gate.ts, ModelSessionFactory.swift, ReportParser.swift, evidence-terms.json and its three readers,
  ReadOutcomeBuilder.swift, and the prompt templates (none names a language).
- Gemini burn rate measured: `scripts/ai_spend.py` reads AI Logic's token counts and the practice searches started
  (ops/judgeSessions-{day}), prices the tokens at the Gemini Developer API paid rates (source and read date in the
  file; a model with no price fails the run) and projects a week at the daily cap of 50. 2026-11-13 to 2026-11-20:
  $0.05 for every cloud read, at most $0.0063 per practice search, a week at the cap at most $2.20 against $25;
  PRODUCTION-CHECKLIST row and the 2026-11-29 line now use the script. `scripts/test_ai_spend.py` (CI and ci-local
  lists) checks the arithmetic, that an unpriced model fails, that every model in models.json has a price and that the
  cap matches judgeSession.ts. Source: review (burn rate not measured). Verified: 5 tests pass; the live run exits 0.
- `shared/practice/ios-practice-pack.json`: the iPhone's practice drill, so a judge can open the searcher app without
  a code. `tools/practice/export_practice_pack.py --write` exports it from the judge seed (drill-dev-1, read from
  judge-seed.json) with the same overrides `startJudgeSession` applies (NOT_COPIED and the drill label are read from
  judgeSession.ts), plus the seed's latest plan at its prior version that no test wrote (plan 0019) with
  `approvedByUid` set to `practice-pack`; timestamps become epoch milliseconds. `--check` compares the committed file
  with the live seed. `tools/practice/test_export_practice_pack.py` (in the CI and ci-local pytest lists) checks the
  committed file offline: the iPhone's required fields, the segment contract, a T1 assignment naming segments in the
  pack, profile fields only from profile/shared, no uid or join-code field, under 1 MB; ten spoiled copies are each
  caught. Source: review (a judge cannot reach the phone apps). Verified: --write, --check and the offline check exit
  0 (53,011 bytes, 68 segments); 5 tests pass.
- `shared/test-vectors/phone-numbers.json`: one hand-written set of phone-number cases for every platform that removes
  numbers from a note. Must remove: spaced digits, spoken digits, +44 and +52 numbers, slashes, parentheses and spaces
  (7 cases, each in the same sentence); must keep unchanged: 14:03, segment 12, 3 searchers, 45% and a sentence with
  all four. The contract is in the vectors README; `scripts/test_phone_vectors.py` (in the CI and ci-local pytest
  lists) pins the required cases and checks that the contract passes a correct scrubber and fails one that does
  nothing or wipes the note. Source: review (phone patterns differ by platform). Verified: 4 tests pass.
- SECURITY row 1c: Android release App Check is PASSED, not pending. The release-signed build on a Samsung A16 got a
  Play Integrity token, signed in and made a cloud note read on 2026-11-18
  (`docs/evidence/android/a16-2026-11-18/README.md`, lines 20-21). The row also records the settings read back
  2026-11-20 (a sideloaded version is accepted on a device of any integrity level; the release SHA-256 is registered)
  and that all 14 release-build token exchanges from 2026-11-19 18:00 to 2026-11-20 01:34 UTC succeeded. Source:
  review. Verified against the evidence file, the App Check config API and the serviceruntime request counts for
  ExchangePlayIntegrityToken.
- LIMITS: pushes are a convenience, not an alert; delivery can be late or missing, and anything urgent reaches the
  family by the search lead's call, as the paused notice ("The search lead will call you.") says. Source: review of
  the family push design (FCM's documentation says its APIs are not designed for uses where a failure could cause
  harm). Verified: the README, the judge page (JudgePage, judge.ts, JudgeExtras), drill-day.md and SECURITY.md never
  call push an alert path; the paused notice text is in functions/src/notify.ts.

## 2026-11-19

- LIMITS: a write already under way when the family leaves (a photo or clip upload, or the profile's first publish)
  can still reach the search; each checks the join just before it starts, and only a server-side membership check
  could stop one already started. Source: review of the Android leave change. Verified against the Android code
  (`JoinedClipDeps` and `PhotoUpload` check `stillJoined` before each write).
- LIMITS: leaving a search on the family app. "Leave this search" stops new changes, waits up to 5 seconds for sent
  ones, then asks the phone to stop following the search's notifications; leaving is local to the phone, whose sign-in
  still names it as the search's family, so a change made offline just before leaving is accepted when the phone
  reconnects. After leaving, the app shows no notice for that search while open; a background notice can still arrive
  until Firebase confirms the topic drop, which is retried at each app start until confirmed. Source: review of the
  Android leave change. Verified against the Android code (`waitForPendingWrites` bounded at 5,000 ms,
  `Session.leave()` removes only the local incident id, `FamilyPush.isForCurrentSearch`, `FamilyTopic` pending drops
  with `retryPending`) and the rules' `isMember`, which reads the sign-in's `inc` claim.

- `seed_drill.py` can add and revoke an extra join code for one role, for example an app reviewer's, without
  touching the incident's primary code: `--add-code <project> <incidentId> <role> <incidentId>-<name>` keeps the code
  in the Keychain under the role's service and its own account and then creates its joinCodes doc (only if absent);
  `--revoke-code` checks that the doc names this incident and role, deletes it (only if present) and removes the
  Keychain entry. An account that is not `<incidentId>-<name>`, such as the primary account, is refused before
  anything changes. A searcher code for the test drill was added this way for Apple's Beta App Review, under
  account `drill-test-1-reviewer`.
  Source: the iPhone app's TestFlight review needs a join code that can be revoked after the review.
  Verified: the tests (the account rule; the create-only and delete-only writes; argument checks before any change)
  failed first, now all 35 seed tests pass; live, the reviewer code is 8 characters in the Keychain, differs from the
  primary code, and its doc reads back as a searcher code of drill-test-1.
- The web workflow's ffmpeg comes first from a pinned static build in a GitHub release (BtbN FFmpeg-Builds, the
  month-end autobuild of 2026-10-31, release 8.1), checked against its SHA-256 before use, and only falls back to one
  bounded apt install. Ubuntu's apt mirrors stalled this step three times, the last on main after the bounded apt
  install merged (both attempts timed out). The download is bounded to 240 s in all and the step to 9 minutes.
  Source: CI (main's web job failed in the ffmpeg step: both apt attempts stalled).
  Verified: the script passes `bash -n`; the ci-local mirror checks pass (7); rules_gate exits 0; the pinned asset's
  SHA-256 is the one GitHub publishes for it. The web job on this change's pull request downloads and checks it.
- The rules gate checks that `shared/constants/judge-seed.json`, which the web's live fixtures read, names the same
  judge seed as `JUDGE_SEED_INCIDENT` and a different test drill, so the two copies of the seed id cannot drift.
  The file's description now says what it is: the drill every practice search is copied from (judges do not open
  it) and the test-only drill live tests write to.
  Source: review (a second copy of the seed id in the shared constants).
  Verified: the test (a matching file passes; a different seed, a test drill equal to the seed, and an empty file
  each fail) failed first, now all 39 gate tests pass; the gate over the repository exits 0.
- The rules gate fails when a live or device test names the judge seed, the drill every judge practice search is
  copied from: its id (read from `JUDGE_SEED_INCIDENT` in `functions/src/judgeSession.ts`, so a renamed seed stays
  guarded) may not appear in `android/app/src/androidTest/`, `android/*.sh`, `web/e2e/` or `ios/PLSUITests/`. Those
  tests use the test-only drill `drill-test-1`. Docs, unit tests and the functions may still name the seed, and an
  unreadable seed constant fails the gate.
  Source: review (live tests had written into the judge seed).
  Verified: the tests (a Kotlin device test, a run script, a web e2e spec and an iPhone UI test naming the seed each
  fail; the same id in a doc, a unit test or the functions and another drill id pass; an unreadable constant fails)
  failed first, now all 38 gate tests pass.
- The Android unit-test floor is 304, the suite's real count with the membership and first-publish tests (it was
  293), in `.github/workflows/android.yml` and `scripts/ci-local.sh`.
  Source: the Android app's report of its full suite on this merge.
  Verified: the Android job runs 304 tests with 0 failures (reported by the Android app on its branch; checked again
  by this pull request's CI).
- `docs/LIMITS.md` says what the family app does with a shared profile and a lost search: a second phone's first
  share adds only fields the search does not have yet, so it never fills a field command left empty; and the app
  leaves a search only when a refreshed sign-in no longer names it as that search's family or the family taps
  "Leave this search", so a phone that loses access while offline shows the search until it can check.
  Source: the Android app's first-publish and membership changes in this merge.
  Verified: each line matches the Android commits merged here (absent-only first publish; drop after a successful
  forced refresh; Leave this search) and their live test on the test drill.
- The web job's three browser steps each have a 5-minute limit, about five times their usual time (15 s, 40 s and
  55 s on recent runs), so a stall is reported as its own step failing instead of the whole job ending cancelled at
  its 15-minute limit.
  Source: review (a web run that ended cancelled at the job's limit was hard to read: the stall was in an earlier
  step).
  Verified: the ci-local mirror checks pass (7); the web job's result is on this change's pull request.
- The web workflow installs ffmpeg through `scripts/ci/install-ffmpeg.sh`, which bounds each apt call (60 s for the
  index, 120 s for the install, with apt's own retries) and tries twice, and the step has a 7-minute limit. A stalled
  apt mirror once held the old one-line install until the job's 15-minute limit, so the run ended cancelled instead
  of failing with a reason. The script exits non-zero unless ffmpeg is on PATH. The check that every workflow
  command runs in `scripts/ci-local.sh` treats the script as runner setup.
  Source: CI (a web run cancelled at the job limit in the ffmpeg step).
  Verified: the script passes `bash -n`; the ci-local mirror checks pass (7); rules_gate exits 0. The web job's
  result is on this change's pull request.
- Every refusal from `startJudgeSession` and `deleteIncidentMediaNow` carries a stable `details.reason` beside its
  sentence, so a client maps the error code and the reason instead of the text (the web SDK adds the HTTP status to
  the message, which broke an exact match). The practice search: `not_signed_in`, `no_practice`, `hourly_limit`,
  `daily_limit` and `setup_busy`; the media delete: `bad_incident_id`, `not_signed_in` and `not_command`. The
  sentences are unchanged.
  Source: the web app's error mapping (an exact sentence match missed the setup-busy answer).
  Verified: the tests (each refusal's code and reason, and the media refusals' sentences) failed first, now pass;
  all 256 functions tests pass; functions typecheck exits 0.
- `docs/LIMITS.md` states the two practice-search gaps left after the round-3 fixes: a start that pauses between its
  last read and the role write can still put an older attempt's role over a newer winner's (the rules refuse the
  ended one's data and the next start fixes it), and a setup that resumes after its retired attempt was deleted can
  write the drill's copy again under an incident that no longer exists (no judge work, no reader, nothing links to
  it). It drops the line those fixes replaced.
  Source: review (round 3 on the functions: the two remaining mediums kept as stated limits).
  Verified: each line matches `functions/src/judgeSession.ts` as changed here; the public hygiene guard exits 0.
- `startJudgeSession` gives the command role only while the practice search is still the visitor's attempt
  (`judgeUsers/{uid}`), ready and not ended, read right before the role is written. A start that paused and finds a
  newer winner throws "still being set up" and leaves the winner's role alone, instead of writing its older
  attempt over it. The check replaces the separate publication read and also refuses an attempt whose window has
  ended. A whole older sandbox found without a pointer gets one in the same transaction.
  Source: review (round 3 on the functions: a late request could overwrite the winner's role).
  Verified: the new test (a start pauses, a newer attempt wins and is given the role, the paused start resumes) failed
  first with the older attempt written over the winner, now passes; all 22 judge-session tests pass; functions
  typecheck exits 0.
- Two tests pin that a visitor whose pointer (`judgeUsers/{uid}`) names a dead attempt gets a fresh practice
  search and never the dead one: an attempt the cleanup job has deleted, and an unfinished attempt whose window has
  ended. Both already held, so the pointer needs no separate pending field.
  Source: review (round 3 on the functions: the pointer can name an unfinished attempt and outlive it).
  Verified: both tests pass in the emulators.
- `docs/LIMITS.md` says what the practice search and the notices do and do not guarantee: each setup attempt has
  its own incident and a pointer names the one in use, and an older practice search is kept only with every one of
  the drill's ids; a start at the moment a practice search ends can give the role on the one that just ended (the
  rules refuse its data, so the visitor starts again); a team's plan notice goes once per version and never for a
  replaced plan; a family notice can arrive late, repeat a state the search returned to, or come after its question
  was answered, and only says to open the app; and anyone who knows an incident id can see when its search gets new
  tasks, starts, pauses or asks the family a question (a real search's id is never published; the drills' ids are in
  this repository). `docs/PRODUCTION-CHECKLIST.md` names the per-day counter documents.
  Source: review (round 2 on the functions: the gaps kept as stated limits).
  Verified: each line matches the code in `functions/src/judgeSession.ts` and `functions/src/notify.ts` as changed
  here; rules_gate and the public hygiene guard exit 0.
- A team's new-assignment notice goes once per plan version, and never for a plan that has already been replaced.
  `notifyPlanApproved` claims each team's notice (`pushBudget/plan-{version}-{team}`, which no client can read or
  write) before sending, so a redelivered event sends nothing twice; a send that fails gives its claim back, so the
  next delivery sends it. A plan whose next version already exists announces nothing, so a late event cannot send
  work a newer plan has replaced.
  Source: review (round 2 on the functions: a redelivery repeated the sends, and a late older plan could still
  announce).
  Verified: the tests (a second delivery sends nothing; plan 1 after plan 2 exists sends nothing while plan 2
  sends; a failed send is sent on the next delivery) failed first for the first two, the third passed before and
  after as the guard that a claim never blocks a retry; all 9 plan-notice tests pass; functions typecheck exits 0.
- The daily cap on new practice searches counts on one document per UTC day, `ops/judgeSessions-{YYYY-MM-DD}`.
  With one shared counter, a start that read the counter before midnight and committed after a start of the new day
  wrote yesterday's date back, and the new day's count began again from zero. Nothing else reads the counter.
  Source: review (round 2 on the functions: calls across midnight could reset the day's count).
  Verified: the tests (a full day refuses; a start on the next day counts on that day's document and never on the
  day before) failed first, now all 19 judge-session tests pass; functions typecheck exits 0.
- A practice search made before setup was tracked is kept only when it holds every one of the seed's segment and
  team ids (and the shared profile when the seed has one), and never without the seed. The check used to compare
  counts, so the right number of the wrong segments passed, and an empty sandbox matched an absent seed (0 and 0)
  and was promoted.
  Source: review (round 2 on the functions: check expected document ids, not counts, and require the seed).
  Verified: the tests (three segments with one wrong id is short; an empty or a whole legacy sandbox with no seed is
  refused, unflagged and given no role) failed first, now all 19 judge-session tests pass.
- A practice-search copy that throws part way closes its writer before the error leaves, so every write it started
  has finished before the setup is let go and a retry begins. Before, an error thrown while the copy was still
  reading the seed skipped `close()`, and its started writes could land after the claim was released.
  Source: review (round 2 on the functions: drain the writer on error).
  Verified: the new test (a writer that throws on its second write) failed first with the writer never closed, now
  passes: the writer is closed, the first write has landed and the setup is let go; all 17 judge-session tests pass.
- Each practice-search attempt gets its own incident id, so a late builder, the cleanup job and the media sweep can
  only ever act on their own attempt's data. Every build claim makes a fresh incident `judge-{uid}-{12 hex}`, and
  `judgeUsers/{uid}` names the attempt that won; only that one is handed back and given the command role. A setup
  that died is replaced by a fresh attempt for the same session (the same 24-hour window and the same slot of the
  daily cap) and the dead one is ended (expiry now, setup id retired), so the rules refuse it, its builder can no
  longer finish it, and the sweeps remove it. Builders no longer clear anything: a new attempt's incident is empty. A
  sandbox made before attempts had ids (`incidents/judge-{uid}`) is checked against the seed; a whole one is kept
  and pointed to, a short one is replaced by a fresh attempt instead of being rebuilt in place.
  Source: review (round 2 on the functions: a stalled builder could delete a ready sandbox's data, and the hourly
  cleanup could delete a replacement sandbox at the same id; a 2nd gen function keeps running after its timeout, so
  the fix removes the shared path rather than relying on the timeout).
  Verified: the tests (fresh ids and the pointer; a builder that stalls inside its copy and resumes after a takeover
  writes only its own retired attempt; a failed or failing copy is retried on a fresh id on the same slot; two starts
  at once use one slot; a legacy sandbox kept or replaced; cleanup removes an ended attempt and never the newer one)
  failed first, now all 16 judge-session tests pass in the emulators; functions typecheck exits 0; the web reads the
  id only from the callable's result and checks only its `judge-` prefix, and the iPhone and Android apps never read
  it.
- `startJudgeSession`'s timeout is one named constant, `JUDGE_SESSION_TIMEOUT_S` (120 s), used by `index.ts`, and a
  test pins the setup lease (`SETUP_STALE_MS`, 5 minutes) at more than twice it and reads `index.ts` to check the
  callable uses it. The lease is a margin, not a guarantee: a 2nd gen function runs on Cloud Run, which closes the
  request at the timeout but does not stop the code, so a builder can resume later.
  Source: review (round 2 on the functions: a stalled builder).
  Verified: all 14 judge-session tests pass in the emulators; functions typecheck exits 0.
- The Kennesaw drill was re-seeded at prior version 2 with the fixed tools (the same grid, point last seen, terrain
  and layer), so its segments now carry `priorVersion` and `ringPoa` and the iPhone can build its mission.
  `docs/evidence/drill/kennesaw-seed.md` records the re-seed and the check.
  Source: the iPhone app could not read the test drill's segments; the Kennesaw drill was seeded the same way.
  Verified: `segment_contract.py` on the live project: Kennesaw 339 docs at prior version 2, the test drill 68 at
  version 2 and the development drill 68 at version 5, all readable by the apps.
- `tools/seed/segment_contract.py` checks an incident's segment docs against the shape the apps decode. The field
  sets come from `shared/test-vectors/pack-segments-sample.json`, the real segment docs the iPhone's own tests
  decode. On top of them it checks segmentId equal to the doc id, finite non-negative `priorPoa` and `ringPoa`, one
  whole-number `priorVersion` equal to the incident's, area above 0, a numeric centroid, `geometryJson` as a string
  holding a Polygon or MultiPolygon, string lists, `nearFrac` between 0 and 1, a ROW doc, and a prior summing to 1.
  As a script it reads one live incident (exit 0 readable, 1 not, 2 cannot read). `seed_segments.py` runs it on
  the docs before writing anything and on the read-back after, and fails if either check fails.
  Source: the iPhone app could not read a seeded drill's segments; a seed must never produce one it cannot read.
  Verified: the contract tests (the sample passes; each unreadable shape is named; a MultiPolygon passes; the
  incident's version must match; a whole incident must sum to 1) and the seed tool's check pass, 32 seed tests in
  all; against the live project the development drill passes (68 docs at prior version 5) and the test drill and
  the Kennesaw drill fail on every segment, missing `priorVersion` and `ringPoa`, which is what the iPhone hit.
- A seeded drill's segments now have the same fields as segments the command post's prior rebuild writes, so the
  iPhone can build its mission from them. The grid builder's `--prior` adds `ringPoa` (the prior with every layer
  off, which the rebuild keeps beside the layered prior as its baseline) to each segment, and `seed_segments.py`
  writes `priorVersion` on every segment and on ROW, besides the incident. Before, a seeded segment had neither, and
  the iPhone refused the first segment ("The search area could not be read").
  Source: the iPhone app, joining the test drill.
  Verified: the tests (the builder's segment keys include `ringPoa`, equal to the layers-off prior, and ROW has
  none; every segment and ROW write carries the prior version; a missing or negative `ringPoa` is refused) failed
  first, now all 32 grid-builder and 16 seed-segment tests pass.
- `scripts/judge_seed_check.py` checks that the drill every judge practice search is copied from has not drifted:
  it reads the seed named by `JUDGE_SEED_INCIDENT` from the live project and compares what a copy takes (every
  incident field outside `NOT_COPIED`, both read from `functions/src/judgeSession.ts`; the segments, as a count and
  a hash; the teams; the shared profile) and a count and hash of the seed's events with the committed
  `scripts/judge_seed_baseline.json`. It names each difference and exits 1 on drift, and 2 when anything cannot be
  read, never 0. `docs/PRODUCTION-CHECKLIST.md` runs it before every hosting or functions deploy; `--write`
  refreshes the baseline after a deliberate change. The baseline was written from the live seed after its shared
  profile was put back (68 segments, 30 events). Its test runs in the gates job.
  Source: review (live tests had changed the judge seed's shared profile without anything noticing).
  Verified: the tests (the seed id and the skipped fields come from the function source; values read as plain
  JSON; the snapshot is the same in any order; a changed profile field, a new event and a changed segment are each
  named; a match passes, drift fails, and a missing document or baseline is a failed read) failed first with the
  module missing, now all 6 pass; against the live project the check exits 0.
- A test-only drill, `drill-test-1`, exists for the apps' live and device tests, so they never write to the drill
  every judge practice search is copied from. It has the development drill's grid, point last seen, terrain and
  near-feature layer, teams T1 and T2, and the same 68 segment ids; its join codes are in the macOS Keychain under
  account `drill-test-1`. `docs/evidence/drill/drill-test-1-seed.md` records the commands as run and the read-back.
  Source: review (live tests had written a test stamp and a tracking aid into the judge seed's shared profile).
  Verified: the read-back in the evidence file (incident fields, teams, 68 segments, ids equal to the development
  drill's, each Keychain code 8 characters, never printed).
- The root package accepts Node 22 or 24 (`"engines": { "node": ">=22 <25" }` in `package.json` and its lockfile
  entry), now that the Node 24 job runs the engine, the tools, the web app and the functions typecheck green on Node
  24. The functions package stays at Node 22, the Cloud Functions runtime. The README's requirements say the same.
  Source: review (the Firebase web SDK asks for Node 24.12; engines widen only once the Node 24 job is green).
  Verified: the Node 24 job passed on its pull request and on main; `npm ci` exits 0 with the new lockfile.
- The Android unit-test floor is 293, the suite's real count with the first-publish tests (it was 290), in
  `.github/workflows/android.yml` and `scripts/ci-local.sh`.
  Source: the Android app's report of its full suite after the first-publish fix.
  Verified: the Android job on this branch runs 293 tests with 0 failures and `count-tests --min 293` passes.
- The rules gate refuses web code that makes or prompts a built-in model session itself: `LanguageModel.create`,
  a session's `.prompt(` and `.promptStreaming(`, in plain, optional-chained and bracket forms, in any non-doc file
  under `web/`. The web reaches the browser's model only through Firebase AI Logic's hybrid mode, and before this the
  gate checked only the availability call. Docs may name them, and the iPhone and Android code is not affected.
  Source: review (the web's direct built-in model calls were unguarded, unlike the companion guard's).
  Verified: one test per call (each form fails the gate) failed first, now passes, with a control that a doc
  mention, a Swift session and the AI Logic builder pass; all 35 gate tests pass; the gate over the repository exits
  0 with 966 files walked.
- The public-hygiene guard keeps its word list as SHA-256 hashes, so neither `scripts/hygiene_guard.py` nor its test
  spells a word it protects. It splits the text into lowercased words and checks each word's hash (and the word
  without a trailing "s"), and the hash of each two- or three-word phrase joined exactly as written by "-", a space
  or "/". The review rule id, the work-stream-as-role form and the settings path stay as shapes, the author's
  surname is still allowed after the given name, and the floor, the self-exclusion and the public and private modes
  are unchanged. The test builds every planted term from parts.
  Source: review (the repository is public, so the guarded words were readable in the guard itself).
  Verified: the new tests (the guard holds each term's hash and spells none; a plural such as an upper-case word
  with a trailing "s" is found; every phrase in any case is found, and its parts alone or with another joiner are
  not) failed first on the old guard, now all 9 pass; the old and the new guard both walk 938 files with no hits.
- The web workflow installs ffmpeg before the component harness checks. The clip harnesses (the clip form, and the
  frame sampler's moving and still clips) make their test clips with ffmpeg, since the repository keeps every .mp4
  out, and the Ubuntu runner image does not ship it, so both tests failed at setup with "ffmpeg: not found" on the
  first real CI runs. The check that every workflow command runs in `scripts/ci-local.sh` treats the install as
  runner setup, as it does the Playwright browser install.
  Source: CI (the web job's harness step, the first run with Actions minutes available).
  Verified: the ci-local mirror check passes; the web job's result is on this change's pull request.
- The Android unit-test floor is 290, the suite's real count with the tracking-aids form and profile tests (it was
  274). `android/count-tests.py --min` fails a run whose results hold fewer tests, so a test class that stops running
  cannot pass as green. It is set in `.github/workflows/android.yml` and `scripts/ci-local.sh`.
  Source: the Android app's report of its full suite after the tracking-aids work.
  Verified: the Android job on this branch runs 290 tests with 0 failures and `count-tests --min 290` passes; the
  check that every workflow command runs in ci-local passes.
- A rules test pins the expression budget for profile/shared: the heaviest shared profile (five other names of 60
  characters with the nickname mirror, every text field at its schema maximum, every mobility aid, flag and
  approach-note id, all four tracking aids and an 80-character note) is accepted, so the tracking-aid checks fit
  beside the rest. The text limits and choices are read from the schema and the approach-notes constants, so the
  test follows them.
  Source: review (the rules' 1,000-expression limit; the plans worst case had no room).
  Verified: all 16 profile rules tests pass in the emulator.
- The engine gives the search card's tracking-aid lines: `trackingAidLines(shared)` reads
  `shared/constants/tracking-aids.json` (each aid's form label and card line, in card order, the "none" line and the
  note's 80-character limit), so every app shows the same words. It gives one line per aid the family named (a
  choice it does not know is skipped), then the family's note; nothing when the family has not said; and "No tracker
  or medical ID, as the family said." when it said none. `SharedProfile` gains the optional `trackingAids`, and
  `profileForSearchers` carries it into profile/shared; `profileForModel` never includes it.
  Source: expert input, with the card wording agreed with the web, iPhone and Android apps.
  Verified: the tests (absent gives nothing; empty gives the none line; the order, the skipped unknown choice and the
  trimmed note; profile/shared carries it only when given; the model profile never does; the constants' choices and
  note limit equal the schema's) failed first, now all 248 engine tests pass; typecheck and lint exit 0; TypeScript
  schema parity holds (Swift and Kotlin follow in their apps).
- The shared profile can carry the family's tracking aids (expert input): `trackingAids` = { `aids`: up to 4 distinct
  of `project_lifesaver`, `medicalert_id`, `gps_tracker` and `phone_location`; `note`: 0 to 80 characters with no
  digits }, optional, so a build that never sends it keeps saving. Absent means unknown; an empty list and note mean
  the family said none. It is for the search cards only and is never sent to a model. The schema gives the shape and
  the generated rule checks it; the profile rule adds each choice once and no digit of any script in the note
  (`\P{Nd}`, so fullwidth digits are refused too).
  Source: expert input (a state Alzheimer's association: Project Lifesaver runs in some Georgia counties, families
  use other trackers, and a medical ID matters when the person cannot say who they are).
  Verified: the rules test (a profile without the field, an empty one, all four, a note and an 80-character note are
  accepted; a repeat, an unknown choice, five, ASCII and fullwidth digits, 81 characters, an extra key, a missing note,
  a non-list and a number are refused) failed first, now all 139 rules tests pass; the generated block is current.
  Schema parity waits for the TypeScript, Swift and Kotlin types.
- A Node 24 job (`.github/workflows/node24.yml`) runs the engine, the grid builder, the public-run exporter and the
  web app (typecheck, tests and the placeholder build) and the functions typecheck on Node 24, beside the Node 22
  jobs, on pull requests to main and on main. The Firebase web SDK asks for Node 24.12; the root package's engines
  field stays at Node 22 until this job is green, and Cloud Functions keep the nodejs22 runtime. The check that every
  workflow command also runs in `scripts/ci-local.sh` covers the new workflow.
  Source: review (the web SDK's Node requirement; a fresh clone on Node 24).
  Verified: the ci-local and workflow-path tests pass (14); rules_gate and the public hygiene guard exit 0. The job's
  own result is on its pull request.
- CI runs `tools/extras/test_publish_drill_run.py` too (the drill-run publisher's tests, added with the drill-day
  work): the new check that every Python test file is in a pytest list found it on its first run after that work
  merged. It is added to the gates job's pytest line in `.github/workflows/ci.yml` and in `scripts/ci-local.sh`.
  Source: the check above.
  Verified: the check named the file and now passes; the gates job's whole pytest line passes locally.
- `NOTICE` credits the source of the dementia distance rings: ISRID figures from R. J. Koester, Lost Person
  Behavior, "Dementia (Alzheimer's)", p. 164, read from the publisher's public sample, and points to the evidence
  files that hold the figures as printed and the other published sources.
  Source: review (credit for the distance tables).
  Verified: the page, URL and wording match `docs/evidence/isrid-dementia-p164.md` and
  `shared/constants/engine-params.json`; rules_gate and the public hygiene guard exit 0.
- CI now runs the two test files under `tools/extras` (the elevation build and the scam-panel publisher, 32 tests),
  which were named in no pytest list and so had only run by hand. They are added to the gates job's pytest line in
  `.github/workflows/ci.yml` and to the same line in `scripts/ci-local.sh`, and a new test in
  `scripts/test_ci_local.py` fails when any Python test file git would ship is named in no workflow's pytest command
  (by its path or a parent folder), so a new test file cannot be missed again.
  Source: review (a test file outside every CI list).
  Verified: the new test failed first naming the two files, now passes, with a companion test that it finds an
  unlisted file; the gates job's whole pytest line passes locally (185 tests).
- The rules gate now refuses speech recognition on every platform and says why, and keeps the system voice allowed.
  It already refused Apple's Speech framework and the webkit-prefixed browser recognizer; it now also refuses
  Android's speech recognizer, Android's recognize-speech intent (by class name and by its action string) and the
  browser's unprefixed recognizer. The gate's comment states the rule: recognition reads the user's speech with a
  model outside Firebase AI Logic; the system text-to-speech voice (the iPhone app's fallback when the cloud voice
  cannot be reached) speaks text the app already holds. The README says the same, and that iPhone keyboard
  dictation gives the app typed text.
  Source: review (the speech rule, made to agree across the project's guards).
  Verified: the new test (six recognizer uses across Swift, Kotlin and TypeScript each fail the gate) failed first,
  the system-voice test (AVSpeechSynthesizer, TextToSpeech, speechSynthesis pass) passes; all 31 gate tests pass;
  the gate over the repository exits 0 with 936 files walked.
- The README says what is true now rather than what is planned: the judge page replays a published drill run and
  says "No published run yet." until one exists; the iPhone app's public TestFlight link and the Android app's
  release asset are named as not published yet; and the status line says the project was built for #BuildHybridAI
  2026 with made-up drill data.
  Source: review (README tense).
  Verified: the judge page's wording matches `web/src/judge/JudgePage.tsx`; `gh release list` shows no release;
  rules_gate and the public hygiene guard exit 0.
- A rules test pins that the command post's photo tray can list a search's photos: command and family list
  `photos/{incidentId}` (the read rule on the files under it covers the list), and a searcher cannot; a searcher can
  list clips. A review had read the tray's list as having no matching rule.
  Source: review (cross-model, rules range, a finding to verify).
  Verified: the test lists a stored photo as command and as family and is refused for a searcher; all 14 storage
  rules tests pass in the emulator.
- A plan holds at most 8 assignments and a drill at most 8 teams (both were 10), and each assignment's segment ids
  must be a list, so an empty string or a map no longer passes for one. The list check costs one more rules
  expression per assignment; with it, the heaviest plan no longer fit 10 even on a drill, and the worst case (a judge
  incident, whose expiry and setup are checked, with a blocked wording route) fits 9 and not 10. So 8 keeps one
  assignment of room. `tools/seed/seed_drill.py` refuses more than 8 teams to match, and `docs/LIMITS.md` says why.
  Source: review (cross-model, rules range: segment ids not checked as a list; the expression budget's worst case).
  Verified: the tests (an empty-string and a map segment id refused; the heaviest 8 on a drill and on a judge incident
  with a blocked route accepted; 9 assignments refused; 9 teams refused by the seed tool) failed first where they
  test new refusals, now all 138 rules tests and 23 seed tests pass; measured in the emulator, the worst case fits 9
  assignments and not 10; rules_gate passes.
- The family push carries only the kind and the incident id: the question's id no longer leaves Firestore, and the
  family app lists unanswered questions from Firestore when it opens. A searching or paused notice now also needs the
  incident to be open and not past its end, so a late event after the search ends spends no budget and sends
  nothing. `docs/LIMITS.md` says both.
  Source: review (cross-model, round 1, mediums; privacy by default).
  Verified: the tests (every kind's whole message without a question id; no searching or paused notice for a found,
  closed or expired incident, and no budget doc written) failed first, now all 17 push tests pass; functions
  typecheck exit 0.
- `startJudgeSession`'s copy is checked write by write and by owner. Every write's own result is collected (a failure
  is caught as it happens and thrown after the writer closes, since `BulkWriter.close()` resolves even when a write
  failed), so a short copy is never marked ready. Before clearing and before copying, the build checks that it still
  owns the setup, so a builder that stalled while another took over never clears or writes the newer sandbox. A live
  sandbox made before setup was tracked is checked against the seed (as many segments and teams, and the shared
  profile if the seed has one): a complete copy gets its flag and keeps its judge's work, a short one is rebuilt on
  the slot it already used.
  Source: review (cross-model, round 1, high 2 and a medium).
  Verified: the tests (a write that fails leaves the sandbox not ready and grants nothing, and a retry finishes it; a
  stalled builder resuming after a takeover leaves the newer sandbox and its judge's event alone; a legacy sandbox
  with nothing copied is rebuilt, one with a full copy is handed back with its event) failed first, now all 13 judge
  session tests pass with no unhandled error; functions typecheck exit 0.
- `docs/evidence/drill/kennesaw-seed.md` records the Kennesaw drill as seeded: park staff confirmed by email on
  2026-11-19 that the training exercise needs no Special Use Permit and suggested the trails south of Dallas Highway;
  the incident `drill-kennesaw-1` (teams T1 to T3, urban terrain marked as the default and not verified for this site,
  the point last seen on the Kolb Farm Loop Trail) and the exact commands that built and seeded it.
  Source: the drill's seeding.
  Verified: every command and value matches the run and its read-back (339 segment documents, prior version 1 with
  `priorBuiltAt`, the export passes every check); no person or address is named.
- The Kennesaw Mountain drill grid sits on the trails south of Dallas Highway, as park staff suggested: 338
  segments, 4.21 km2 over the Kolb's Farm, Cheatham Hill and Old John Ward trails, its northern edge about 100 m below
  the road. Before, its window was around the Visitor Center and the summits, all north of the road. Its route graph
  (644 edges) and basemap tiles (Protomaps 2026-11-18) are committed beside it, and `shared/grid/README.md` records
  how each was made with its sha256.
  Source: review (park staff's advice for the drill).
  Verified: the grid tests now cover both sites' graph and tiles (the graph indexes in the engine and is bounded by
  the grid's box; the tiles are PMTiles v3 covering it) and pin the grid below 33.945 north; they failed first, now
  all 9 pass; the engine suite passes; rules_gate passes.
- `.gitignore` ignores `android/.kotlin/`, the Kotlin compiler's cache that Gradle builds leave in the Android
  project, so it no longer shows as an untracked folder after a local build or gets walked by the repository gates.
  Source: review (seen after the merge point's Android build).
  Verified: `git check-ignore android/.kotlin` matches and `git status` no longer lists it.
- The Android unit-test floor is the real count, 274, in both `android.yml` and `scripts/ci-local.sh` (it was 150), so
  losing even one test class fails CI and the local mirror instead of passing quietly.
  Source: review (a floor far below the count would not notice a dropped class).
  Verified: the merge point's full local mirror counted 274 Android unit tests, 0 failures, 0 skipped; `count-tests.py
  --min 274` passes on those results and `--min 275` fails; the ci-local mirror test still finds the two commands equal.
- `scripts/heavy.sh <command...>` runs any heavy command (a full vitest or Playwright suite, a Gradle or Xcode test
  run) in one of the machine's two heavy-suite slots, with the same rules `ci-local.sh` follows: take a free slot at
  once, or wait on slot 1 naming the process that holds it every 5 minutes, give up after 90 minutes, and never wait
  on itself (a caller already in a slot, or a run started under lockf on a heavy-suite lock, runs directly). The
  command's exit code comes back. `ci-local.sh` now re-runs itself through it, so there is one implementation.
  Source: review (direct heavy runs still took the old single lock, which did not count against the two slots).
  Verified: the new test (a command runs in a slot with `PLS_HEAVY_LOCK` set and its exit 3 comes back; with both
  slots held it names the holder and runs when one frees; a hand-wrapped nested run does not wait; no command is
  refused) and the ci-local slot tests pass, 10 in all, on a temporary lock folder; `bash -n`, rules_gate and
  hygiene_guard pass.
- A plan's doc id must be its version in exactly one form: four digits, zero-padded (`0016`), or the plain number
  from 10000 up, so `00016` or `016` can no longer stand beside `0016` as a second plan of the same version. Each
  segment id in an assignment must be text: splitting the joined ids must give back the same list, which refuses a
  number (join() would turn it into text) and an id holding a comma. `docs/LIMITS.md` drops the gap it named and says
  10 assignments is the most that fits.
  Source: review (cross-model, round 1, mediums).
  Verified: the tests (`00016`, `012345` and `016` refused, `0016` and `12345` accepted; a numeric segment id alone or
  among text ids refused, at the first and the tenth assignment) failed first, now all 136 rules tests pass in the
  emulator, the heaviest 10-assignment plan with a wording route among them; with room for an 11th, 11 heavy
  assignments do not fit the expression limit (measured, then the rules file restored).
- A judge practice search still being set up is closed to its members until the copy finishes: the Firestore rules
  (`liveFor`), the Storage rules (`notExpired`) and `deleteIncidentMediaNow` refuse a judge incident whose
  `setupReady` is false, so a returning judge, whose claims still name `judge-{uid}`, cannot read or write a sandbox
  while it is rebuilt. A sandbox made before setup was tracked has no flag and counts as ready. `setupReady`,
  `setupId` and `setupStartedAtMs` are server-owned: no client may change them. The media delete now also requires a
  judge sandbox to carry a timestamp expiry, as the rules do.
  Source: review (cross-model, round 1, high 1).
  Verified: the tests (a member with live claims cannot read the incident or a segment or write an event while setup
  is false, and can once it is true or absent; command cannot write any setup field; a family upload is refused while
  setup is false; the media delete refuses a sandbox being set up or one with no expiry, and works once ready) failed
  first, now the 43 roles, storage and media delete tests pass in the emulator; functions typecheck exit 0.
- `scripts/ci-local.sh` takes one of two heavy-suite slots (`/tmp/heavy-suite-1.lock`, then `-2.lock`) without
  waiting, and only when both are busy waits on the first, printing which process holds it every 5 minutes and giving
  up after 90 minutes. It never waits on itself: a run already holding a slot (`PLS_HEAVY_LOCK`) or started by hand
  under `lockf` on a heavy-suite lock skips the slots. Before, a hand-wrapped run held the one lock while the script's
  own re-run waited on it forever, which stopped every other suite on the machine for 2.5 hours.
  Source: review (the single lock deadlocked under a hand wrap; two full suites at once keep the load reasonable).
  Verified: the tests (a hand-wrapped nested run finishes; with one slot busy the run takes the other at once; with
  both busy it names the holder's PID while it waits, then runs) failed first, now all 9 ci-local tests pass, using a
  temporary lock folder so the machine's slots are never touched (skipped where lockf does not exist, as on CI);
  `bash -n`, rules_gate and hygiene_guard pass.
- The published drill run served at `/evidence/published-run.json` carries the engine's urban ring column. The run
  was exported before the urban terrain existed, so its stored engine params lacked `rings.urban`, and once the
  engine defaults gained it the replay reader refused the run (a field of the wrong type). The column is filled
  with the constants' value, the exporter's own rule for an incident made before a field existed; nothing else in
  the run changes.
  Source: the merge of main into the field-expert branch (the web test of the served run failed).
  Verified: the file differs from main's only by the added column (6 lines; every other value equal when parsed);
  the web test of the served run (2 tests) and the exporter's reader check on the file pass.
- `seed_segments.py` binds its commit to the incident version it validated. The same read that checks the
  incident's stored ring column returns its `updateTime`. The incident write is now the first write, with that
  `updateTime` as its precondition, so if anyone changed the incident between the read and the commit, the first
  commit fails and no segment is written. Before, it wrote segments first and the incident last, with only
  "exists" as the condition.
  Source: review (round 3).
  Verified: the tests (the incident write is first and carries the read's updateTime; no other write has a
  precondition; a call without the updateTime is a TypeError; the existing order, mask, ring column and batch
  tests updated to match) failed first, now 22 seed tests pass; `bash scripts/ci-local.sh` exit 0.
- The ISRID ring prior refuses ring masses that are empty, negative, not finite, or add up to 0 or more than 1,
  naming the masses. Before, an empty radii column with empty masses passed the length check and built a prior
  with all the mass outside the rings.
  Source: review (round 3).
  Verified: the test (an empty pair, a negative mass, a NaN mass, masses adding to 1.2, and a zero sum are each
  refused; masses adding to exactly 1 build) failed first, now all 235 engine tests pass; typecheck exit 0.
- `scripts/ci-local.sh` takes the machine-wide heavy-suite lock itself: when `PLS_HEAVY_LOCK` is not set and `lockf`
  is there, it re-runs under `lockf -k /tmp/heavy-suite.lock` and waits its turn, so only one full suite runs on the
  machine at a time (several worktrees running full suites at once had pushed the load past 170 and made
  timing-based browser tests flake). `--help` and a bad option never wait; a runner without `lockf` (CI) runs as is.
  Source: review (a shared rule for every worktree on this machine, kept as a check rather than a habit).
  Verified: the test (the script re-runs under the lock unless it already holds it, and only after the options are
  read) failed first, now all 6 ci-local tests pass; a run with the variable unset showed the waiting line and ran
  under `lockf`; `bash scripts/ci-local.sh --gates` exit 0 through the lock.
- The root CHANGELOG, a test comment and an evidence note are reworded where the public-repository guard found
  build-process words (four review sources, a work stream named as a role).
  Source: review (public-repository hygiene).
  Verified: `python3 -I scripts/hygiene_guard.py . --public` reports no hit in CHANGELOG.md, scripts/, docs/ or any
  other folder this file covers.
- `scripts/hygiene_guard.py` also refuses, in a public repository, more words of the build process and of private
  notes, and a build work stream named as a role; its `PATTERN` lists them. Git branch names such as lane-web and
  lane-android do not match.
  Source: review (public-repository hygiene: a rule kept as a check, not a memory).
  Verified: the test (13 planted phrases, one per pattern, each fail with `--public`; branch names in git commands and
  ordinary uses of "lane" pass) failed first, now all 7 guard tests pass; `--public` on main lists 152 hits, none in
  this file's folders; `bash scripts/ci-local.sh --gates` exit 0.
- The root CHANGELOG is reworded for the public repository in plain engineering words: the parts of the product
  (the backend, the command post, the iPhone app, the Android app, the judge extras) instead of the build's internal
  names for its work streams and branches, "adversarial review" and "decision" instead of the build process's words,
  and the header says which folders the file covers. Entries keep their facts, commits and verification; no history
  is rewritten.
  Source: review (public-repository hygiene pass).
  Verified: a grep for those internal names and the review tools' names finds none; 119 lines changed, no
  dashes or curly quotes; `bash scripts/ci-local.sh --gates` exit 0.
- `scripts/ci-local.sh` runs web.yml's harness and extras browser checks too (`CI=1`, so Playwright's Chromium as on
  the runner), and a new test fails whenever any workflow runs a command ci-local does not: it reads every `run:`
  step of the six workflows, leaves out runner setup (installs, the gitleaks download), and treats CI's
  regenerate-and-diff of the test vectors as the generator's `--check`.
  Source: review (web.yml gained two steps that the local mirror did not run).
  Verified: the new test failed first, naming exactly the two missing commands, now passes, and a synthetic
  workflow with an extra step is reported; `bash scripts/ci-local.sh --web` exit 0 (22 no-backend, 93 harness and 42
  extras browser checks), `--gates` exit 0.
- A rules test pins the command post's family question listener: command and family list `familyQuestions`
  ordered by `createdAt`, newest first, and a non-member cannot. A command update of `searchState` alone was already
  pinned.
  Source: review (the command post's Family section).
  Verified: all 8 family question rules tests pass in the emulator; the live drill incident has status `open` and
  no stored conditions, so a `searchState`-only update passes its rule there; `bash scripts/ci-local.sh --gates
  --rules` exit 0.
- `docs/LIMITS.md` says how the one gap the plan rule leaves (a numeric segment id) is closed: the command post reads
  each stored plan field by field (`planFromDoc`) and sets aside, and names, any record that is not a plan.
  Source: review (the command post now decodes plans on read).
  Verified: matches `web/src/data/plans.ts` (a segment id that is not text returns null); no dashes or curly quotes.
- The security rules drop the `planDrafts` read path: no function writes plan drafts and, since the command post
  removed its draft listener (now deployed), nothing reads them. Reads and writes there are now refused by default.
  Source: review (a read-only path to a collection nothing uses).
  Verified: the test (a searcher and command reading a plan draft are refused) failed first, now all 122 rules tests
  pass in the emulator; no app code names `planDrafts`; `bash scripts/ci-local.sh` exit 0, including the 13
  no-backend browser checks.
- `docs/SECURITY.md` has a Dependencies section: no high or critical `npm audit` findings, why the gRPC override
  is there, and the four moderate findings that remain (`glob` and `minimatch` inside `vite-plugin-pwa`'s
  `workbox-build`), which run only while the service worker is built, on the repository's own patterns, and are
  never shipped.
  Source: review (a fresh clone's `npm audit`: fix or document each finding).
  Verified: the versions, advisories and dev-only status match `npm audit --json` and `package-lock.json`;
  `bash scripts/ci-local.sh --gates` exit 0.
- An incident has at most 10 teams, so every team can be planned for: the security rules no longer let any client
  create, change or delete a team (none does; the web only reads them), and `tools/seed/seed_drill.py`, where teams
  are made, refuses more than 10, a repeated id, `family` or an id a push cannot reach (letters, digits or `_`, up
  to 32). The practice search copies its teams from the seed. Before, command could write any number of teams,
  and an 11th could never be planned for under the 10-assignment rule.
  Source: review (the web's plan card found plans capped at 10 while teams were not).
  Verified: the tests (command's create, change and delete of a team are refused; 11 teams, no team, `T-1`,
  `family`, `Family`, a 33-character id and a repeat are refused; 1 and 10 teams pass) failed first, now pass, with
  all 122 rules tests in the emulator; `bash scripts/ci-local.sh --gates --rules` and `--ts` exit 0.
- `npm audit` reports no high findings: an npm override moves the Firebase web SDK's Firestore from
  `@grpc/grpc-js` 1.9.16 (two advisories, GHSA-m9gg-hp2v-232j and GHSA-f596-whhp-79r4) to 1.14.7, the version
  `firebase-admin` already uses, so no new package enters the tree. That gRPC client only runs in Node (the
  functions' rules tests); the browser bundle has none.
  Source: review (a fresh clone's `npm ci` reported 4 high findings).
  Verified: `npm audit` went from 4 high and 4 moderate to 0 high and 4 moderate; `npm ls` shows one
  `@grpc/grpc-js` at 1.14.7; all 220 functions tests pass, including the rules tests that drive the Firestore
  Node client over gRPC in the emulator; the placeholder web build has no gRPC code and its 9 browser checks pass;
  `bash scripts/ci-local.sh` passes every check it runs.
- The README says up front that the live `/judge` is the way to try it and that running the apps needs your own
  Firebase project. It gives the toolchain with versions (Node 22 with the Firebase SDK's Node 24.12 warning,
  Python 3.12 or later, Java 21 or later, the Firebase CLI 15, gitleaks 8, Xcode 27 with XcodeGen 2.45, the Android
  SDK), how to run every check or one platform with `ci-local.sh` and what its exit codes mean, and ten numbered
  steps for a developer's own project: Blaze plan, Anonymous sign-in, Firestore and Storage, the Gemini Developer
  API, the three apps and their config files, App Check providers and debug tokens, deploy, template and Remote
  Config publish, seeding a drill, and running each app.
  Source: review (a fresh clone, following only the README, found no word that a Firebase project is needed).
  Verified: each command and file name exists in the repository; the providers match `ios/PLS/App/PLSApp.swift`
  and `android/app/src/release/.../AppCheckSetup.kt`; the versions are the ones installed where every check
  passes; `bash scripts/ci-local.sh --gates` exit 0.
- `scripts/ci-local.sh` takes `--gates`, `--ts`, `--rules`, `--web`, `--ios` and `--android` to run one platform's
  checks (no flag runs them all), and a missing tool no longer stops the run: its section says "NOT RUN, <tool> is
  not installed" and the script ends with exit 2 and the list of what did not run, never "all checks passed". Exit
  0 means every check ran and passed, 1 that a check failed. The web section now also runs web.yml's no-backend
  browser checks against its placeholder build, once `web/e2e/ci.config.ts` can preview a temp folder
  (`PLS_PREVIEW_DIR`); until then they are listed as not run.
  Source: review (a fresh clone stopped at the first missing tool and could not run one platform; the browser
  checks were not mirrored).
  Verified: the tests (`--help` names every flag; an unknown flag exits 64; `--ios` with swift hidden exits 2 with
  the NOT RUN line and no pass line) failed first, now pass; a full run exits 2, listing only the browser checks,
  with every other check passing; the browser checks pass separately on the placeholder build (9 passed).
- `scripts/rules_gate.py` and `scripts/hygiene_guard.py` work on a copy with no `.git` (a ZIP download): they say
  "not a git checkout" and walk the files on disk, skipping dependency, build and cache folders, instead of failing
  on `git ls-files`. Every check still applies, and the walked-file floors still refuse an empty walk.
  Source: review (whole repo: a ZIP download could not run the gates).
  Verified: the tests (with no git, a clean tree passes with the note, a banned import or an internal name fails,
  and the same in `node_modules` is skipped) failed first, now all 35 gate tests pass; on a `git archive` copy of
  HEAD with no `.git`, rules_gate walks 865 files with 0 problems and hygiene_guard 846, both exit 0, the same
  counts as the checkout; `bash scripts/ci-local.sh` exit 0.
- Rules tests pin two command post writes. A placement of a family sighting: a new command sighting naming the
  family event, in the command post's own builder output, 25 fields, kept as a fixture. And a confirmation of a
  family camera sighting: one batch that moves the prior to the next version with the family clip among its inputs,
  whose only event is command's confirmation. Both are accepted as the rules stand; a family or searcher seat cannot
  write the placement.
  Source: review (the command post's new "Place on map" and family clip confirm).
  Verified: all 43 event and prior rules tests pass in the emulator; `bash scripts/ci-local.sh` exit 0.
- `startJudgeSession` grants command only on a sandbox that finished setting up, and setup is safe to fail,
  retry and race. One transaction decides each start: a live, ready sandbox is handed back; one still being set
  up answers "unavailable, try again in a moment"; a missing or ended one, or a setup that died (5 minutes with
  no finish, or released by a failed copy), is claimed by this call, which alone clears what is under it, copies
  the seed and marks it ready. Only a new sandbox takes a slot of the daily cap, inside that transaction, so two
  starts at once use one slot. A sandbox made before setup was tracked counts as ready. Before, a sandbox whose
  copy failed still granted command on the next start, and two starts at once could each take a slot.
  Source: review (whole repo).
  Verified: the tests (a failed copy grants nothing and a retry finishes the same sandbox on the same slot; a
  start during another's setup waits and grants nothing; two starts at once use one slot and end ready with all
  segments; a legacy live sandbox is handed back without copying) failed first where they test new behaviour, now
  all 11 judge session tests pass; typecheck exit 0; `bash scripts/ci-local.sh` exit 0.
- The security rules check a plan's shape as it is written (`plan.schema.json`): exactly its eight fields; the doc
  id is the version zero-padded to at least 4 digits; integer versions; the event-set hash's form; the approval time
  is the server's; the wording route is null or a route record; and at most 10 assignments. Each assignment has
  exactly its four fields, a team id a push can reach, up to 6 segment ids of grid form with no comma or empty id,
  and texts within 200 characters. Rules cannot loop, so each assignment is checked by its index, written for few
  rules expressions. Before, a plan create checked only who approved it. `docs/LIMITS.md` gives the 10-assignment
  cap and the one gap (a numeric segment id).
  Source: review (whole repo).
  Verified: the tests (the heaviest 10-assignment plan with a wording route is accepted; a wrong or unpadded doc id,
  extra or missing fields, a bad hash, a client approval time, bad versions, a bad wording route, and each bad
  assignment at the first and the tenth place, plus 11 assignments, are refused) failed first where they test new
  refusals, now all 119 rules tests pass in the emulator. Measured in the emulator: 11 heaviest assignments still
  fit, 18 lighter ones did not before the checks were trimmed. `bash scripts/ci-local.sh` exit 0.
- `docs/LIMITS.md` and `docs/SECURITY.md` say what the family push carries, and why: Firebase Cloud Messaging does not
  check who subscribes to a topic, so every push holds only fixed wording and ids, never an outcome. They also give
  the family push's limits (20 a day, once per event, no stale state, no retry once its slot is taken).
  Source: review (family channel, round 1).
  Verified: each statement matches `functions/src/notify.ts` and its tests; no dashes or curly quotes.
- Family pushes go out once per trigger event and only while still true. One transaction reads the incident, claims
  the event (by a hash of its id) and takes the day's budget slot, so a redelivered event sends nothing and uses no
  budget. A question needs an incident that is still open, and a searching or paused push needs the incident to
  still hold that state, so a late event for a state already left is dropped. A question id must be a Firestore
  auto-id, and the incident id must make a valid topic, both checked before any budget is used. Logs keep ids
  and text out.
  Source: review (family channel, round 1).
  Verified: the tests (the exact message for all three kinds, sent from a stored question with distinctive text that
  never appears; a repeated event id sends once and counts once; a stale state sends nothing; the cap is the
  literal 20; malformed question and incident ids send nothing and write no budget doc; a found incident gets no
  question push) failed first, now all 16 push tests pass; typecheck exit 0; `bash scripts/ci-local.sh` exit 0.
- A family question's id must be a Firestore auto-id (20 letters and digits), so nothing a person types can ride a
  push as an id, and command can ask only while the incident's status is `open` (before, anything but `closed`, so
  a found incident could still take a question).
  Source: review (family channel, round 1).
  Verified: the rules tests (`q1`, 19 and 21 characters, a `-`, an `_` and a name-like id are refused; a found or
  closed incident takes no question) failed first, now all 114 rules tests pass in the emulator;
  `bash scripts/ci-local.sh` exit 0.
- The web workflow also typechecks and tests the public-run exporter, since its tests run exports through the
  replay reader in `web/src/extras/replay`; a change to the reader now re-runs that cross-check.
  Source: review (a reader change would otherwise skip the exporter's tests).
  Verified: `bash scripts/ci-local.sh` exit 0; the step runs the same two commands as the engine workflow.
- The public-run exporter imports the judge replay reader's contract (`web/src/extras/replay/runContract.ts`:
  fields, pseudonym shapes, the 1,000-event cap) instead of keeping a copy, and a new test runs an exported run
  through the reader's own full check (`fromPublishedRun`). A negative control proves that check refuses a run with
  a field the contract lacks. `PLS_RUN_FILE=<file>` runs the same check on a real export before it is published.
  The exporter's typecheck now has the DOM, JSX and Vite types the reader's modules need.
  Source: review (exporter and reader must not drift apart).
  Verified: 22 exporter tests pass, including the reader check on the shared fixture and on a fresh read-only
  export of drill-dev-1 (68 segments, 24 events, 18 plans); the export command still runs; typecheck exit 0;
  `bash scripts/ci-local.sh` exit 0.
- The rules workflow also runs when `shared/constants/**`, `shared/schemas/**`, `shared/templates/**` or
  `storage.lifecycle.json` change, since the functions code and tests read them. A new guard,
  `scripts/test_workflow_paths.py`, finds every such file the functions code and tests name and fails when the
  workflow's filter misses one, or when its push and pull-request filters differ. ci-local and CI both run it.
  Source: review (a models.json or template change skipped the functions tests).
  Verified: the guard failed first, listing 6 files outside the filter (models.json, three schemas, a template,
  the lifecycle file), now passes; `bash scripts/ci-local.sh` exit 0.
- The plan and family push tests compare the whole message with `toEqual`, so a name, a place, a task or a
  question's text added to a push fails them. Before, `toMatchObject` let any extra field through.
  Source: review (a privacy assertion must fail on extra fields).
  Verified: with a `place` field added to the plan push's data and a `name` field to the family push's, both
  tests failed; with notify.ts restored, all 13 push tests pass.
- Hosting answers a missing `/tiles/` or `/evidence/` file with a real 404. The app-shell rewrite's source is now
  `!/@(tiles|evidence)/**` instead of `**`, so a basemap, route graph or published run that a deploy left out can no
  longer come back as `index.html` with status 200, which read as "no streets", "walkers off" or "no published run"
  with nothing pointing at the missing file.
  Source: review (a judge walk of the live site).
  Verified: the config test (the only `/index.html` rewrite has exactly that source) failed first, now passes; on
  the Hosting emulator `/`, `/judge` and `/command/x` return the shell with 200, and `/tiles/missing.pmtiles`,
  `/tiles/a/b.graph.json` and `/evidence/published-run.json` return 404; `bash scripts/ci-local.sh` exit 0.
- The development site's route graph (`shared/grid/piedmont-park-dev.graph.json`) and basemap tiles
  (`shared/grid/piedmont-park-dev.pmtiles`) are now in the repository beside its grid, so a deploy from a clean
  checkout can carry them to `/tiles/`. Before, they lived only on build machines, and a clean-worktree deploy
  served the app shell at both paths: no streets on the map and no walkers. The graph rebuilds byte for byte from
  the committed grid and its OpenStreetMap extract; the tiles are a Protomaps Basemap extract (basemap 4.15.2,
  OpenStreetMap data as of 2026-11-18 04:00 UTC), kept because daily builds expire. `shared/grid/README.md` records
  how each was made with its sha256, and `NOTICE` names them under ODbL, with the Protomaps and Natural Earth credit.
  Source: review (a judge walk of the live site found both files missing).
  Verified: the tests (the graph names the same grid, is bounded by its box, has over 100 edges, credits
  OpenStreetMap and indexes in the engine; the tiles are PMTiles v3 whose bounds cover the grid's box) failed
  first, now pass; the rebuilt graph is identical to the committed one; `bash scripts/ci-local.sh` exit 0.
- A searcher's join names a team a push can reach: letters, digits or `_`, at most 32 characters, and never
  `family` (any case), whose topic is the family's. Before, any id up to 128 characters joined, including ones with
  `-`, which no plan push reaches.
  Source: review (the family topic `pls-{incident}-family` and the team topic share a form).
  Verified: the test (`dev-1`, a 33-character id, `family` and `Family` are each refused as invalid-argument, even
  when the team exists) failed first, now 21 join tests pass; every team id in the live project (20 teams, T1 and
  T2) still passes; `bash scripts/ci-local.sh` exit 0.
- Family pushes. `notifyFamilyQuestion` (on `familyQuestions/{questionId}` create) and `notifyFamilySearchState`
  (on incident update, when `searchState` becomes `searching` or `paused`) send one push to the topic
  `pls-{incidentId}-family`, with fixed wording and ids only: `{kind, incidentId}` plus `questionId` for a question.
  The question's text never travels in the push; the phone reads it from Firestore. No kind for an outcome exists,
  and no other incident change (its status included) sends anything. At most 20 family pushes per incident per UTC
  day, counted in a server-only `pushBudget` doc; none in a judge practice search. A team named `family` never gets
  a plan push, since its topic would be the family's.
  Source: review (a family push channel that never carries outcomes).
  Verified: the tests (topic, wording and payload, with no question text; one push per new question; pushes only
  on a change to searching or paused, not on a repeat, a status change or "found"; the daily cap across both kinds
  and a new day; none in a judge sandbox; a "family" team skipped; both triggers registered; no member reads or
  writes the budget) failed first where they test new behaviour, now pass; `bash scripts/ci-local.sh` exit 0
  (218 tests).
- Firestore rules for the family channel. `incidents/{id}/familyQuestions/{questionId}`: command asks, while the
  incident is open, with exactly `text` (1 to 280 characters), `createdByUid` (itself) and `createdAt` (server time);
  a family member answers once with `answer` (1 to 500 characters), `answeredByUid` (itself) and `answeredAt`
  (server time), changing nothing else; every member reads; nobody deletes. The incident's new `searchState`, which
  command sets, may only be `searching` or `paused`: what the family may be told about the search, never an
  outcome.
  Source: review (a family push channel that never carries outcomes).
  Verified: the tests (command asks and every member reads; family and searchers cannot ask; an empty, 281-character
  or numeric text, someone else as asker, a client time, an extra field and malformed ids are refused; only
  family answers, once, as itself, at server time, within 500 characters and without touching the question;
  nobody deletes; searchState takes searching or paused only, from command only) failed first, now all 112 rules
  tests pass in the emulator; `bash scripts/ci-local.sh` exit 0.
- The public-run exporter holds the judge replay reader's shape and size rules too: `engineParams` is written in
  exactly the engine's shape (an incident created before a field existed gets the constants' value; a stored value
  is kept; nothing the constants lack), a route is an exact route record or null, an effect has the engine's exact
  shape and names only segments the run exports, no id is `__proto__`, `constructor` or `prototype`, every server
  time lies between 2000 and 2100 and within 7 days of the rest, and a run has at most 1,000 events. A breach of
  any refuses the write.
  Source: review (the extras reader's rules at aa5bbf7).
  Verified: the tests (the filled params match the engine's keys and keep the stored sweep width; a partial params
  object, a route with an extra or a missing field, an effect with an extra field, a missing `why` or a segment
  the run lacks, the three unsafe ids, times in 1999 or 2100 or 8 days apart, and 1,001 events are each refused)
  failed first, now 19 exporter tests pass; typecheck exit 0; a read-only export of drill-dev-1 still passes every
  check (68 segments, 24 events, 17 plans); `bash scripts/ci-local.sh` exit 0.
- The README is written for judges first: the judge page's link at the top and what it offers today (a practice
  search, and which models the command post uses; the replay after the drill), what ships on each platform and how
  to try it (the command post's URL, TestFlight once the public build exists, a signed APK as a GitHub release
  asset), and a setup from a clean checkout. It now says how the models are called: cloud reads through Firebase
  AI Logic, on-device reads on the web and Android through AI Logic's hybrid inference, and on iPhone through Apple
  Foundation Models (`SystemLanguageModel`). It no longer claims that every model call goes through Firebase AI
  Logic, which the iPhone's on-device reads do not.
  Source: review (the backlog audit: an untrue line, and a README that was not written for a judge).
  Verified: the live site and `/judge` answer HTTP 200; the judge page's replay flag is off on main
  (`REPLAY_LIVE`); the model paths match `ios/PLS/AI/ModelSessionFactory.swift`,
  `android/.../ai/AiClient.kt` and `web/src/ai/client.ts`; `bash scripts/ci-local.sh` exit 0.
- `docs/LIMITS.md` says that the judge replay's reader is a second check, not the privacy boundary (its user-id scan
  is best effort; the exporter's pseudonyms are the guarantee), that it parses a whole file before its size checks,
  and that its check compares each segment's percent and centroid, not its polygon. A new section on push
  notifications says FCM topics are open, so a push carries no private content, and that iPhone delivery waits on an
  APNs key.
  Source: review (the judge extras' reader limits; the push security review).
  Verified: each line matches the shipped code (`tools/export-run`, `functions/src/notify.ts`) or the reader's
  stated checks; `bash scripts/ci-local.sh` exit 0.
- `notifyPlanApproved` pushes only to team ids made of letters, digits and `_` (no `-`). Incident ids hold `-`, so
  a team id with `-` could build another incident's topic: in incident `I1`, team `dev-1-T1` gives
  `pls-I1-dev-1-T1`, which is incident `I1-dev-1`'s team `T1`. With no `-` in team ids, the last `-` in a topic is the
  separator, and the topic format the apps subscribe to is unchanged.
  Source: automated security review of 8083aa3 (topic collision across incidents).
  Verified: the test (a team `dev-1-T1` that exists in the incident is refused) failed first, now 190 functions
  tests pass in the emulators; `bash scripts/ci-local.sh` exit 0.
- `notifyPlanApproved` reads plan doc ids as the web writes them, zero-padded (`plans/0015`), and finds the previous
  plan at the padded id too. It had accepted only unpadded ids, so it would have sent no push for any real plan.
  Source: found before the first live push test (the drill's plan ids are `0001` to `0015`).
  Verified: the tests now use padded ids (and `0000`, `-1` and `draft` send nothing), failed first, now 6 notify
  tests pass in the emulators; `bash scripts/ci-local.sh` exit 0.
## 2026-11-18

- `tools/seed/seed_segments.py` keeps an incident's own ring column: it writes `engineParams.rings.<terrain>` only
  when the incident has none, leaves a column that already holds the sourced radii alone, and refuses to seed an
  incident whose own radii differ, because the prior it would install was built from the sourced radii.
  Source: review of PR #21 round 2 (finding 2: reseeding overwrote a stored override).
  Verified: the test (the same radii: nothing written to engineParams; different radii: refused naming the
  terrain) failed first, now 21 seed tests pass; a read-only check of drill-dev-1 found no urban column and a
  temperate flat column equal to the constants; `bash scripts/ci-local.sh` exit 0.
- The engine builds a ring prior only from a usable ring column: one radius per ring mass, each finite, positive
  and larger than the last. An empty stored column (for example `urban: []`) used to pass and put all the mass
  outside the map; it, a short or long column, a zero, a negative, a repeat, a decrease, NaN or infinity now each
  refuse by name.
  Source: review of PR #21 round 2 (finding 4).
  Verified: the test (nine bad columns refused naming the terrain; the sourced column builds) failed first, now 234
  engine tests pass; engine typecheck and lint exit 0.
- Two shared-profile rules tests now fail only on the rule they target: the searcher's write uses a complete valid
  profile, so only the role gate can refuse it, and each bad other-names list keeps a valid first name the
  nickname mirrors, so only the list rule can refuse it (with valid controls for the five-name and 60-character
  limits).
  Source: review of PR #21 round 2 (finding 6: both passed for the wrong reason).
  Verified: with the profile write opened to any member, and with the list cap raised to six, each test fails;
  restored, 14 profile tests pass in the emulator.
- `tools/seed/seed_segments.py` records when it installs a prior: the incident update sets `priorBuiltAt` to the
  server's time (a REQUEST_TIME transform), so a seeded drill's replay can place its prior.
  Source: review (the replay needs the prior's build time).
  Verified: the test (the incident write carries the server-time transform and no client value) failed first, now
  20 seed tests pass; `bash scripts/ci-local.sh` exit 0.
- `tools/seed/seed_segments.py` writes the ring column for the incident's terrain (`engineParams.rings.<terrain>`
  from the constants, by field path), so an incident created before that terrain existed can build its prior and
  its other stored engine values stay as they were.
  Source: review of PR #21 (finding 2).
  Verified: the test (an urban seed updates `engineParams.rings.urban` only, not `engineParams`, with the
  constants' values) failed first, now 19 seed tests pass.
- The engine refuses, by name, a terrain its params hold no rings for ("No distance rings for terrain
  "urban" in these engine params"), instead of failing on an undefined ring list. `withEngineDefaults(stored)`
  fills what an incident's stored params predate (a ring column added later, such as urban) from the sourced
  constants and keeps every stored value; loaders call it before building a prior.
  Source: review of PR #21 (finding 2: an urban grid on an incident created before urban existed broke its
  ring rebuild).
  Verified: the tests (an urban prior from old params throws naming urban; withEngineDefaults adds the urban
  column, keeps an overridden flat column and sweep width, and returns the constants for no params; the filled
  params build) failed first, now 233 engine tests pass; engine typecheck and lint exit 0.
- Firestore rules enforce the nickname mirror: when the shared profile carries `otherNames`, `nickname` must be its
  first name, or "" for an empty list, so every reader shows the same name. A profile saved before the list keeps
  any nickname.
  Source: review of PR #21 (finding 5).
  Verified: the test (nickname "Mom" with ["Mom", "Peggy"] accepted; "Peggy" with ["Mom"] or with [] refused; a
  profile with no list keeps "Peggy") failed first, now 112 rules tests pass in the emulator.
- A cleared effect belongs to a cleared event only. The event rules refused nothing on an event's effect kind by
  type, so a family member could write a sighting carrying a cleared effect for a segment and use it to claim
  that segment's debrief. Event creation now ties a cleared effect to the cleared type (the engine counts it on
  no other type), and the debrief rule also checks that the event it points at is a cleared event.
  Source: review of PR #21 (finding 1).
  Verified: the tests (a searcher's sighting or clue with a cleared effect is refused while a cleared event is
  accepted; a family member's own sighting with a cleared effect does not qualify a debrief) failed first, now
  111 rules tests pass in the emulator.
- New incidents start urban: the drill seed writes `terrain: "urban"`, and `build-grid --prior` accepts
  `--terrain urban`. Command can still change the terrain (with the next prior version). Judge practice
  searches copy their seed's terrain, so they follow the seed drill.
  Source: review (field expert: a suburb or a big park around Atlanta is urban).
  Verified: the seed test (a new drill is urban) and the CLI test (an urban prior builds and records its terrain)
  failed first, now 18 seed tests and 26 grid-builder tests pass; grid-builder typecheck exit 0.
- `shared/test-vectors/search.json` regenerated: each case's embedded engine params gain the urban rings (47
  blocks; no other change).
  Source: the urban terrain commit.
  Verified: `python3 -I tools/vectors/make_vectors.py --check` exit 0; the vector tests pass.
- An "urban" terrain for the prior: the ISRID dementia urban distances from the IPP, 0.3, 1.1, 3.2 and 12.6 km
  at 25, 50, 75 and 95% (n = 336), from Lost Person Behavior p. 164 (the publisher's public sample
  https://www.dbs-sar.com/LPB/Dementia.pdf, read 2026-11-18), in both the ring prior (km) and the walkers (m).
  The same table holds our temperate columns exactly, and the rings' source line now cites it. A Georgia SAR
  lead treats a suburb or a big park around Atlanta as urban.
  Source: review (field expert).
  Verified: the PDF's distance table read with `pdftotext -layout` (temperate mountain 0.3/0.8/1.9/8.3 km, n = 95;
  temperate flat 0.3/1.0/2.4/12.8 km, n = 175; urban 0.3/1.1/3.2/12.6 km, n = 336). The engine tests (urban rings
  equal the table; the source line cites it; every terrain's walker distances equal its rings; urban mass differs
  from flat) failed first, now 231 engine tests pass; engine typecheck exit 0.
- Segment debriefs: `incidents/{id}/debriefs/{segmentId}` holds how long the clear took (`tookMinutes`, 0 to
  1,440) and what worked or did not (`worked`, `didNotWork`, up to 500 characters each), written by `byUid` at
  server time. Command writes any; a searcher writes only for a segment they cleared, pointing `clearedEventId`
  at their own cleared event (rules cannot search events, so the pointer is how they check it). Command alone
  edits, keeping the writer, time and pointer; nobody deletes, so only incident cleanup removes one. Members read
  them. The engine never reads them, so no coverage claim comes from a debrief. Schema
  `shared/schemas/debrief.schema.json` with the TS type `Debrief`; the iOS type is pending.
  Source: review (field expert: a debrief after each segment).
  Verified: the rules tests (command writes any; the clearing searcher writes theirs; another searcher, the wrong
  segment, no pointer, a missing event and family are refused; bounds, exact keys, writer and server time
  enforced; only command edits and keeps the writer, time and pointer; nobody deletes; members read; a second
  member create is refused) failed first, now 109 rules tests pass; schema parity checks `Debrief` in TS (6
  fields); engine typecheck exit 0.
- A new approach note, `stop_calling_name`: "If they may not come when called, stop calling their name." It shows
  whenever `may_not_respond` shows (the default), third after the two notes the spec puts first, and comes from
  search teams. The rules' list of note ids is regenerated from the notes file, and the shapes test now derives
  its too-long list from that file.
  Source: review (field expert: a person who may not come when called).
  Verified: the engine test (third by default; hidden with `may_not_respond` when the family says she answers;
  the exact text, condition and source role) failed first, now 229 engine tests and 103 rules tests pass;
  engine typecheck exit 0. In `bash scripts/ci-local.sh`, schema parity still waits for the iOS and Android
  `otherNames` types, and the web test that pins exactly two default notes waits for the web change; both land
  in this same pull request.
- The shared profile carries `otherNames`: up to five other names she may answer to, each 1 to 60 characters,
  optional so profiles saved before it stay valid. Writers mirror the first name into `nickname` ("" for an
  empty list); readers call her by `namesToCall` (the list, else the nickname). Firestore rules take the new
  key, regenerated from the schema.
  Source: review (field expert: get every name the person may answer to).
  Verified: the rules test (none, an empty list and five names accepted; six names, an empty name, 61
  characters, a number, a string, a map and null refused) and the engine tests (shared as listed with the
  nickname mirrored; an older profile keeps its nickname and adds no key; readers fall back) failed first, now
  103 rules tests and 228 engine tests pass; engine typecheck exit 0. `bash scripts/ci-local.sh` fails only on
  schema parity until the iOS and Android `SharedProfile` types add the field, which lands in this same pull
  request.
- The rules validator generator checks lists of up to five items one by one (was four), for the shared
  profile's list of other names. A longer list is still refused at generation time.
  Source: review (field expert: get every name the person may answer to).
  Verified: the generator test (a five-string list is checked item by item; six is refused) failed first, now
  10 generator tests pass; `bash scripts/ci-local.sh` exit 0.
- `notifyPlanApproved` bounds its pushes: a plan is written by command (and every judge is command in a practice
  search), so it pushes only to team ids the incident has under `teams`, with plain ids (letters, digits, `_` and
  `-`, at most 32), at most 20 a plan, and never in a judge practice search, where no phone is on a team.
  Source: automated security review of 6f2b7fc (unbounded push fan-out from plan content).
  Verified: the test (a plan naming a real team, a missing team and a path-like id pushes to the real team only;
  30 changed teams give 20 pushes; a practice search sends none) failed first, now 190 functions tests pass in the
  emulators; `bash scripts/ci-local.sh` exit 0.
- A photo's cloud-read consent lives no longer than the photo: `deletePhotoConsentOnPhotoDelete` (Storage trigger on
  object deletion, retry on) deletes `incidents/{id}/photoConsents/{sha256}` when `photos/{id}/{sha256}.jpg` is
  deleted, whether by command, by the media delete or by the 30-day lifecycle. Photos are create-only, so a
  re-upload of the same bytes follows a delete and needs the family's consent again. A consent written just after a
  re-upload can be removed by the old object's delete event; the read then waits for a new consent, which fails
  closed.
  Source: review of PR #20 (a re-uploaded photo passed with the old consent; the media delete already removed
  consents since 54d6323, but a single photo deleted by command or by the lifecycle did not).
  Verified: the tests (the deleted photo's consent goes and another incident's stays; clips, packs, a PNG, a
  non-hash name, a nested path and a path without an incident are ignored; the trigger registers on object
  deletion) failed first, now 189 functions tests pass in the emulators; `bash scripts/ci-local.sh` exit 0.
- `notifyPlanApproved` (Firestore trigger on `incidents/{id}/plans/{version}` create) sends one push per team whose
  assignment is new, changed or dropped since the previous plan, on the team's topic `pls-{incident}-{team}`. The
  push names no person, place or task ("Your team has a new task. Open Point Last Seen to see it.", titled
  "Training drill: new assignment" on a drill or practice search), collapses per incident and lives 2 hours
  (Android collapse key and TTL; APNs collapse id and expiration). No model is involved. A plan id that is not a
  positive integer sends nothing. iOS delivery waits for an APNs key in Firebase Cloud Messaging.
  Source: plan task 32 item 2 (P-06).
  Verified: the tests (new, changed and dropped assignments count and identical ones do not; the topic, collapse
  key, TTL and wording; one push per changed team against the previous plan; the first plan notifies every team;
  a non-version id sends nothing; the trigger registers on create) failed first, now pass in the emulators;
  functions typecheck exit 0; `bash scripts/ci-local.sh` exit 0.
- `docs/PRODUCTION-CHECKLIST.md` lists the steps before and after enforcing App Check on Firestore and Storage:
  the 24-hour verdict read, the probe with its token, an App Check debug token for every local dev session (the
  reCAPTCHA Enterprise key allows only the two hosting origins), the checks within 15 minutes of each flip and the
  rollback.
  Source: review (the enforcement plan; the command post's read of the site key's allowed domains).
  Verified: the domains are as read with `gcloud recaptcha keys describe` by the command post on 2026-11-19;
  `bash scripts/ci-local.sh` exit 0.
- `docs/evidence/drill/kennesaw-seed.md`: how to rebuild the Kennesaw grid and seed its drill incident, step by
  step, marked NOT RUN until the park gives written permission (the Piedmont drill is the fallback). It states the
  urban terrain, with temperate mountain as the alternative command can pick.
  Source: review (keep the second drill ready, not live).
  Verified: the commands match the tools' usage (`build-grid --site-from-osm`, `--query`, `--prior`, `--graph`;
  `seed_drill.py`, `seed_segments.py`); `bash scripts/ci-local.sh` exit 0.
- `shared/grid/kennesaw-mountain-drill.grid.json`: a second drill grid, ready but not used: Kennesaw Mountain
  National Battlefield Park (OpenStreetMap relation 143353) inside a 2.4 km window around the Visitor Center and
  the two summits, 285 segments and 3.76 km2, the park's inholdings kept out as holes. Built from an OpenStreetMap
  extract read on 2026-11-19 (data as of 02:06 UTC). `shared/grid/README.md` gives its source, window and credit
  (ODbL). The grid test now checks both grids, including that each fits one prior batch (480 segments).
  Source: review (a second drill site in case the park permits it).
  Verified: the grid test failed first (file missing) and now passes for both grids; the build printed 285
  segments and a route graph of 549 edges; `bash scripts/ci-local.sh` exit 0.
- `build-grid --site-from-osm <overpass.json> --relation <id> [--window <south,west,north,east>] --out <site.geojson>`
  builds a drill site from an OpenStreetMap park relation: its outer ways stitched into rings, its inner rings
  (private inholdings) kept as holes, clipped to a window, with the relation and window recorded. Grid building
  refuses a site of more than 480 cells, because the web writes a rebuilt prior in one Firestore batch (every
  segment, ROW, the incident and up to two events) and a batch holds at most 500 writes.
  Source: review (a drill grid for a second, larger park).
  Verified: the tests (two outer ways stitched with a hole kept and the source recorded; a window clip with its
  window recorded; a missing relation, an open ring and a window outside the park refused; a 3 km square refused
  at 480 cells; the CLI writes the site and refuses a missing relation or a malformed window) failed first, now 30
  grid-builder tests pass; typecheck exit 0; `bash scripts/ci-local.sh` exit 0.
- `deleteIncidentMediaNow` also deletes the incident's photo consent records, with the photos and their
  readings.
  Source: the photo consent rules (consents are deleted with the media).
  Verified: the delete test (the consent goes, another incident's stays; the counts include it) failed first,
  now 181 functions tests pass in the emulators.
- Firestore rules for a photo's cloud-read consent, `incidents/{id}/photoConsents/{sha256}`: created only by a
  family member, for themselves, with exactly `storagePath` (this photo's `photos/{incident}/{sha256}.jpg`),
  `cloudProcessing` (`byUid` the writer, `atMs` a number, as in the clip consent), `createdByUid` (the writer) and
  `createdAt` (server time). Command and family read it, so command can check it from the server before any cloud
  read of the photo; nobody changes it; only its creator deletes it, which withdraws the consent.
  Source: review of PR #20 (the command post's cloud photo read needs a server-side consent per photo).
  Verified: the tests (the family member records it; command and family read it and a searcher cannot; command
  and searchers cannot create one; another incident's path, another photo's, a clip path, someone else's consent,
  a non-numeric or missing time, someone else as creator, a client time, an extra field and a non-hash id are
  refused; no update or overwrite; only the creator deletes) failed first, now pass in the emulator;
  `bash scripts/ci-local.sh` exit 0.
- `docs/SECURITY.md` row 14: App Check on Firestore and Storage is UNENFORCED (monitoring only, nothing refused)
  since 2026-11-19 01:33 UTC, read back by GET; enforcement follows a 24-hour read of verified against unverified
  requests per app; the rollback is to set the mode back.
  Source: the approved monitoring step before enforcement.
  Verified: both services' GET returned UNENFORCED at 01:33:35 and 01:33:36 UTC; a token-less ops/storage read
  still passed afterwards; `bash scripts/ci-local.sh` exit 0.
- The live probe workflow gives the media check the CI App Check debug token, so its `ops/storage` read carries a
  token.
  Source: the media probe fix.
  Verified: the workflow change only adds the step's environment; `bash scripts/ci-local.sh` exit 0. The first run
  after this push is checked below in the probe's run log.
- The media probe sends an App Check token with its `ops/storage` read when it has the CI debug token
  (`APPCHECK_DEBUG_TOKEN_CI`), exchanged for the web app from the hosting origin, so the daily check keeps working
  once App Check is enforced on Firestore. The token is never printed; the probe says whether it read with one.
  Source: review (enforcing App Check on Firestore would have broken the probe's token-less read).
  Verified: the tests (the read carries the token when given and no header otherwise; the debug token comes from
  the environment) failed first, now 8 probe tests pass; run locally, the probe passed with a token and without
  one; `bash scripts/ci-local.sh` exit 0.
- The incident may record when its current prior was built, `priorBuiltAt`, for the drill replay: the rules
  allow it only in a write that moves `priorVersion` up by exactly 1, and only as the server's time of that write
  (`request.time`). It is optional, so writers that do not send it are unaffected. The public-run exporter emits
  it as `priorBuiltAtMs`.
  Source: review (the replay needs to place the prior exactly).
  Verified: the tests (refused without a version step and with a client-chosen time; accepted with the next
  version and the server's time, alone or in a full prior batch) failed first, now 104 rules tests pass in the
  emulator; `bash scripts/ci-local.sh` exit 0.
- `docs/LIMITS.md` says what the published drill run leaves out and the one link it keeps: event ids stay as
  stored, so someone who already holds a participant's uid could check which events are theirs (uids are never
  published; every published run is a drill on team-owned devices). It also describes the media revoke marker,
  and no longer says the sandbox media sweep waits for a rules deploy: it has been live since 2026-11-18.
  Source: review (the exporter's event-id finding, kept and documented; the fact-sheet audit).
  Verified: the sweep's `ops/storage` heartbeat read green earlier on 2026-11-18; `bash scripts/ci-local.sh`
  exit 0.
- `docs/evidence/model-latency.md` records why live cloud paths use the flash-lite family: one sample of
  `gemini-3.8-flash` took 116,071 ms (333 thinking tokens) on 2026-11-17, against a flash-lite median of 839 ms
  (925 ms with cloudGuard) over 10 warm calls on 2026-11-18. It says plainly that the slow figure is one sample and
  that its raw record is local evidence, not in the repo.
  Source: review (the film fact-sheet audit: a code comment cited "116 s" with no evidence file).
  Verified: the figures copied from the 2026-11-17 test notes and the 2026-11-18 live check output;
  `bash scripts/ci-local.sh` exit 0.
- `shared/constants/models.json` names the speech model's caller as the server prompt template `pls-voice-v1`;
  the retired Remote Config key `tts_model_ios` is gone from it.
  Source: review (the film fact-sheet audit).
  Verified: no other shipped file names `tts_model_ios` (`git grep`); `bash scripts/ci-local.sh` exit 0.
- `docs/SECURITY.md`'s table of cloud calls now lists all eight, with whether each is a server prompt template or a
  direct call: it adds the web clip read (direct, because a template cannot pass the clip window) and the iOS
  spoken assignment change (template `pls-voice-v1`), and replaces "None is templated today" with which three are.
  Source: review (the film fact-sheet audit: the table contradicted row 6 and left two calls out).
  Verified: each row checked against the calling code (`web/src/ai/clipRead.ts` cloud only;
  `ios/PLS/AI/AssignmentSpeaker.swift`; the template ids in `shared/templates/`); `bash scripts/ci-local.sh` exit 0.
- The gates job runs `scripts/test_firebase_config.py`, and `scripts/ci-local.sh` mirrors it.
  Source: the hosting fix.
  Verified: `bash scripts/ci-local.sh` exit 0.
- Hosting no longer routes `/pack/**` to a `pack` function that was never built; packs come through Storage. A
  test fails if any hosting rewrite names a function that `functions/src/index.ts` does not export.
  Source: review (the film fact-sheet audit).
  Verified: the test failed first on the `pack` rewrite and passes without it; `bash scripts/ci-local.sh` exit 0.
- `deleteIncidentMediaNow` marks the incident revoked before it removes any file: it writes
  `incidents/{id}.mediaRevokedAt` (server time, a new value on every call), so every open command seat can clear
  its photos and clip results and ignore a reload that started earlier. The rules make `mediaRevokedAt`
  server-owned (a client update that changes it is refused), and a judge practice search does not copy it from its
  seed. It is separate from `mediaDeletedAt`, which the ended-sandbox sweep stamps once.
  Source: review (a delete on one command seat left the media readable on another).
  Verified: the tests (the incident is marked before the first file is listed, with a later time on a second
  delete and nothing on another incident; a refused caller marks nothing; command cannot write it; a practice
  search does not inherit it) failed first, now 176 functions tests pass in the emulators;
  `bash scripts/ci-local.sh` exit 0.
- The search math constants cite their public sources. `docs/evidence/search-math-sources.md` gives the reference
  and a verbatim quote for the sweep and hasty speeds (Hashimoto, Aung, Koester and Abaid, PLoS One 21(6):
  e0339541, 2026: "Median speeds were 0.53 m/s (IQR 0.26 − 0.87) for hasty searches and 0.39 m/s (IQR 0.20 −
  0.63) for sweep searches") and for the sweep width factor (Koester et al. 2014, as reproduced in Koester's 2018
  thesis: "It was found on average W ≈ 1.645 × Rd with a strong correlation (R2 = .827)."). The constants' source
  lines name these works instead of a private notes file.
  Source: review (the film fact-sheet audit: a citation with no copy in the repository).
  Verified: both quotes re-read at the source on 2026-11-18 (the PLoS One article page and the thesis PDF); the
  vectors are current; `bash scripts/ci-local.sh` exit 0.
- The public-run exporter never places a camera: a camera sighting's position (`positionSource: "camera_pin"`)
  is usually the family's own camera, at home, so it is written as null like a destination's, and the checks
  refuse a run that places one.
  Source: automated security review of 6c90281 (a camera pin published a likely home position).
  Verified: the tests (a camera sighting is written with no position while a GPS position stays; a planted camera
  position is refused) failed first, now 14 exporter tests pass; typecheck exit 0; `bash scripts/ci-local.sh`
  exit 0.
- CI runs the public-run exporter's typecheck and tests in the engine workflow's `ts` job, and
  `scripts/ci-local.sh` mirrors it.
  Source: the exporter commit.
  Verified: `bash scripts/ci-local.sh` exit 0, with the exporter's typecheck and 12 tests in its log.
- `tools/export-run` exports a drill incident as the public run the judge replay reads:
  `npm run export -w tools/export-run -- --incident <id> --out <file>`. It reads the incident, segments, teams,
  devices and their read timings, events and plans through the Firestore REST API, writes only the contract's
  fields (`src/contract.ts`, a copy of the reader's `RUN_FIELDS` until that file is on main), and refuses to
  write unless every check passes. Every author and device becomes a pseudonym (`author-N`, `device-N`, one alias
  per device everywhere); report text is null on every event; a reading survives only on a camera sighting, cut
  to its clip start, clock check, presence, first and last seen and key-frame time; a destination never has a
  position (it can be a previous home); server time, plan approval and the prior's build time are numbers. No
  string anywhere may hold a uid-shaped token.
  Source: review (the extras contract, and the reader's two privacy findings: no uid, no home position).
  Verified: the tests (a run from drill docs on the real Piedmont Park grid passes the checks; only contract
  fields; no uid with aliases matching between events and devices; text dropped, camera reading cut, destination
  unplaced; times as numbers; a planted uid in a team name, a measurement, the run id or an author, a planted home
  position, report text, a full camera reading, an extra incident field and a raw device id are each refused;
  REST values decode, timestamps to milliseconds) failed first, now 12 pass; typecheck exit 0. A live read-only
  export of drill-dev-1 to a scratch file wrote 68 segments, 24 events and 15 plans with every check passed; an
  independent scan of that file found no uid-shaped token, no text and no destination position.
  `bash scripts/ci-local.sh` exit 0.
- `docs/evidence/isrid-dementia-p164.md` keeps the source table behind the prior's rings: the ISRID dementia
  distances from the IPP (all five columns, km and the urban miles) and the find-location shares, copied as
  printed on Lost Person Behavior p. 164 (the publisher's public sample). The urban find-location shares
  (structure 35%, road 36%) are kept for a later layer; no engine code reads them.
  Source: review (keep the unused urban shares in a note).
  Verified: values re-read from the `pdftotext -layout` extraction of the PDF; `bash scripts/ci-local.sh` exit 0.
- cloudGuard's trigger tests build their template call from the published sighting template's own config in
  `shared/templates/`, instead of a copied token limit, and check that the template sets a limit within the text
  cap; a template that loses its limit now fails here as well as in the template tests.
  Source: review of 5e1d56d..ebd96a9 (the test hardcoded the template's cap).
  Verified: with `maxOutputTokens` removed from the sighting template, the new test fails; restored, 21
  cloudGuard tests pass; `bash scripts/ci-local.sh` exit 0.
- Firestore rules accept a command camera sighting only when the prior's input ids are a list that contains it.
  `in` also matches the keys of a map, so a map keyed by the sighting's id could have stood in for the list.
  Source: review of d5d6176.
  Verified: the test (a Confirm batch whose incident carries the ids as a map keyed by the sighting's id is
  refused) failed first, now all 102 rules tests pass in the emulator; `bash scripts/ci-local.sh` exit 0.
- `docs/SECURITY.md` records the probe's positive read and its control (run 44420234691 on the real site passed
  both App Check steps; run 44420309943 against a wrong site failed both), a table of the secrets the checks use
  (names and places only, revoke by 2026-12-17), and rows 6 and 6a as they now stand: three calls use server
  prompt templates (web sighting note, Android clip read, iOS voice), the photo template is published but not yet
  called, and AI Logic enforces each template's declared inputs.
  Source: review (record the CI token and both run ids; row 6 still said no templates were used).
  Verified: live on 2026-11-18 a 2,001-character note, an empty note, a PNG sent to the JPEG-only photo template
  and a call with no inputs were each refused with HTTP 400 and a 2,000-character note was answered; the two runs
  read back with `gh run view`; `bash scripts/ci-local.sh` exit 0.
- The live probe's positive read fails, instead of skipping, when the CI App Check token is missing: the
  repository secret `APPCHECK_DEBUG_TOKEN_CI` exists since 2026-11-18, so a missing one means it was lost or
  renamed, and a skip would report green with nothing checked.
  Source: review (a guard under CI must fail, not skip).
  Verified: the test (no token: exit 1, no network call) failed first, now 13 probe tests pass;
  `bash scripts/ci-local.sh` exit 0.
- The live probe takes a `site` input on a manual run: the wrong-URL control. Pointed at a wrong site, both App
  Check steps must fail, which proves they can fail. Scheduled runs pass the empty input and keep the real site.
  Source: review (each monitor needs a control that proves it can fail).
  Verified: the test (a set `PLS_SITE` replaces the site; empty or unset keeps the real one) failed first, with
  the constant restored to a fixed site it fails again, now 13 probe tests pass; locally the no-token step exits
  1 against `https://wrong-site.invalid` and 0 against the real site; `bash scripts/ci-local.sh` exit 0.
- Firestore rules close the duplicate camera Confirm. An incident update that changes any prior input (the
  input event ids, the start point and its source, the prior's layers, terrain, model, seed or engine
  settings) must raise `priorVersion` by exactly 1 in the same write. A camera sighting created by command must
  sit in the batch that moves the incident to the next version and lists that sighting among the prior's inputs.
  Two seats confirming the same clip from the same version build identical probabilities with different event
  ids; the second batch is now refused whole instead of landing a duplicate sighting and replacing the input
  list. The family app's own clip confirm (which never moves the prior) is unchanged.
  Source: review (a second seat's identical Confirm batch landed at the same version).
  Verified: the tests with the real Confirm batch shape (segments, ROW, the incident and both events; each seat
  first in turn, the second refused whole and no duplicate written; a confirm from the newer version lands;
  command's camera sighting alone or not listed is refused; the family confirm still lands; each prior input
  changed without a step or with +2 is refused) failed first, now all 101 rules tests pass in the emulator;
  `bash scripts/ci-local.sh` exit 0.
- `docs/SECURITY.md` row 12 records cloudGuard as on: deployed from ebd96a9 at 22:57 UTC on 2026-11-18, which calls
  it covers (every generateContent call, templated or not), the large-media exception with the measured sizes,
  what it does not cover by Google's design (streaming, which our iOS report read uses, and the Live API) and
  the measured added latency.
  Source: review (claim the trigger exactly as deployed).
  Verified: live after the deploy, all 11 checks passed: the four templates kept their schemas (the voice template
  returned audio); a direct structured call kept its keys; candidateCount 4 gave one candidate; gemini-3.8-flash
  was refused; median added latency 86 ms over 10 warm calls; six 13.8 MB clip calls at once all answered; an
  oversize call asking for 50,000 tokens was refused by the guard; a 13.8 MB clip through its template returned
  all 15 fields. `bash scripts/ci-local.sh` exit 0.
- cloudGuard refuses a request above the inline-media limit unless its own settings already comply: only listed
  setting names, and a token limit within the cap or none (a template call carries none; its template sets it).
  A request that asks for more output, extra candidates or a thinking budget is refused with invalid-argument
  instead of passing unchanged. The web clip read (response type and schema only) and template clip reads comply.
  Source: automated security review of 62b56c2 (an oversize request skipped the cap whatever it asked for).
  Verified: the test (above the limit, a 50,000 or 0 token limit, candidateCount and thinkingConfig are each
  refused) failed first, now 20 cloudGuard tests pass; functions typecheck exit 0; `bash scripts/ci-local.sh`
  exit 0.
- cloudGuard leaves a request with more than 9,000,000 base64 characters of inline media as sent, after the model
  check. Measured live on 2026-11-18 with the guard forcing a rewrite: requests of 1.6, 5.9 and 11.3 MB went
  through, 15.8 MB failed with HTTP 500 from the AI Logic proxy, and an 18.4 MB request left as sent went
  through. Without this, every long clip read failed, since template calls always arrive without a token limit
  and so are rewritten. Such a request keeps the model allow-list but not the output cap; the log line reports
  its media size in MB.
  Source: the live burst check after the redeploy (six 13.8 MB clip calls, all HTTP 500) and the size sweep.
  Verified: the tests (left as sent above the limit and rewritten at it; an off-list model still refused; the
  log line reports `mediaMB` and no rewrite) failed first, now 18 cloudGuard tests pass; functions typecheck
  exit 0; `bash scripts/ci-local.sh` exit 0.
- cloudGuard keeps a server prompt template's output schema. The log line showed that live template calls
  arrive with no template name (`data.template` null) and carry the schema in generationConfig as
  `_responseJsonSchema`, with no token limit; the guard dropped that key, so the sighting template invented field
  names. The key is now kept, and template calls get the text cap like any direct call. A call that does name
  its template is still left as sent after the model check.
  Source: the cloudGuard log line on the live W2 call at 22:33 UTC (configKeys `_responseJsonSchema`,
  `responseMimeType`, `temperature`; path direct; rewritten true).
  Verified: the two tests built from that live shape (the rule function and the exported trigger keep the schema
  and add the cap) failed first, now 15 cloudGuard tests pass; functions typecheck exit 0;
  `bash scripts/ci-local.sh` exit 0.
- cloudGuard writes one log line per call: the path it took (template or direct), the template's name, the
  request's and generation config's setting names, and whether it rewrote the request. Names only, never the
  prompt, inputs, media or values. Redeployed at 22:24 UTC on 2026-11-18 (6d29d80), the guard again made the
  sighting template answer with made-up field names although template calls are now left as sent; it was
  deleted again at 22:26 UTC. The log line shows which path a live template call takes before the next deploy.
  Source: the live check after the redeploy.
  Verified: the log-line tests (path, template, sorted setting names and the rewrite flag; no prompt text, media,
  MIME type or values in the line) failed first, now 13 cloudGuard tests pass; functions typecheck exit 0;
  `bash scripts/ci-local.sh` exit 0.
- cloudGuard runs with 1 GiB of memory, a full CPU and up to 6 requests at once per instance (10 instances at most,
  none kept warm). A clip read carries up to 14 MB of video as base64, about 100 MB in flight with the raw body,
  the parsed string and a rewritten reply; at the default 256 MiB and 80 requests per instance, a burst of clip
  reads could exhaust the instance and fail every AI call behind it.
  Source: review (concurrent clip reads could exhaust the trigger's memory).
  Verified: the endpoint test (1,024 MB, CPU 1, concurrency 6, 10 instances, no minimum instances) failed first,
  now 11 cloudGuard tests pass; functions typecheck exit 0; `bash scripts/ci-local.sh` exit 0. A live burst
  follows the redeploy.
- cloudGuard's tests send events through the exported trigger, as AI Logic does: a template call is answered with
  no request (so the template's own config, schema included, stands), a direct call that asks too much is
  answered with the bounded request, and an off-list model is refused with permission-denied (code 7, HTTP 500
  from the trigger) whether or not it is a template call.
  Source: review (the earlier tests called the rule function directly and missed the live template defect).
  Verified: with the template line removed from `guardRequest`, the trigger-level template test fails; restored,
  10 cloudGuard tests pass; `bash scripts/ci-local.sh` exit 0.
- Firestore rules move the prior one version at a time. An incident update that changes `priorVersion` must
  raise it by exactly 1, and a segment (or ROW) write that changes `priorPoa` or `priorVersion` lands only in
  the batch that moves the incident to the next version, taking that version. Two command seats that rebuild
  from the same version can no longer both land: the second batch, built from older inputs, is refused instead
  of overwriting the newer prior.
  Source: review (walker results could race across two laptops).
  Verified: `functions/test/rules/prior.test.ts` (a fresh rebuild lands and a second seat's rebuild from the
  same version is refused; +2 and a decrease are refused, a status change is allowed; a segment cannot take a
  version the incident lacks; a full-size 68-segment batch with ROW and the incident passes) failed first
  (3 of 4), now all 95 rules tests pass in the emulator; `bash scripts/ci-local.sh` exit 0. The live
  access-call limit is checked after deploy.
- `shared/grid/piedmont-park-dev.grid.json`: the development site's grid (Piedmont Park, Atlanta; 67 segments
  built from an OpenStreetMap extract on 2026-11-18), the same grid the drill incident and every judge's
  practice search use, committed so the terrain work can build against a real site before the drill site is
  chosen. `shared/grid/README.md` gives the credit ("Map data © OpenStreetMap contributors", ODbL 1.0, with
  the copyright link); the file's own `attribution` field carries it too.
  Source: review (the judge extras' terrain task needs a site grid on main).
  Verified: the test (the file parses as the engine's Grid: unique ids, positive areas, centroids inside the
  box, neighbours that exist, no ROW, and the OpenStreetMap credit) failed first (file missing), now passes;
  engine typecheck exit 0; `bash scripts/ci-local.sh` exit 0.
- Every server prompt template bounds its own output (`maxOutputTokens` 2,048 for text, 4,096 for speech, the
  same caps cloudGuard applies to direct calls), because cloudGuard leaves a template call's config as the
  template sets it.
  Source: review (template calls must be bounded too).
  Verified: the test (every template's bound within its cap) failed first, now 10 template tests pass; the dry
  run plans four updates; `bash scripts/ci-local.sh` exit 0.
- cloudGuard leaves a template call's request alone after checking its model. Deployed at 21:47 UTC on
  2026-11-18, it set a generationConfig on template calls, which replaced the template's own config: the
  sighting template answered with made-up field names (`directionOfTravel`, `topColour`). It was deleted
  (`firebase functions:delete cloudGuard`) at about 21:55 UTC, the template answered correctly again, and this
  fix comes back through the same deploy and live checks. The live run also showed the latency gate holds
  (median 1,060 ms against an 839 ms baseline over 10 warm calls, +221 ms) and that an off-list model is
  refused: the function logged permission-denied (403) and the AI Logic proxy answered the client 500.
  Source: the live check after the first deploy.
  Verified: the template-call test (a template call is checked for its model and left as sent) failed first,
  now 7 cloudGuard tests pass; functions typecheck exit 0; `bash scripts/ci-local.sh` exit 0.
- The rules gate fails CI when shipped code (web, iOS, the Android app's main sources, functions) names a
  model host outside Firebase AI Logic: Google's Gemini API host, Vertex AI REST, OpenAI, Ollama (including
  localhost:11434), Hume, Mistral, Cohere, Hugging Face inference, Replicate, Groq and other vendors' SDKs. A direct call
  would skip App Check, authenticated-users mode, the per-user limit and cloudGuard. Docs and tests may name
  them; AI Logic's own host does not match.
  Source: review (calling a model host directly is outside the hackathon's rules).
  Verified: the test (six planted hits across the four trees each fail; a clean tree with AI Logic's host, a
  doc and a test mention passes) failed first, now 28 gate tests pass; the repo walks with 0 problems;
  `bash scripts/ci-local.sh` exit 0.
- cloudGuard bounds output whatever the request asks for: only the speech model gets the speech cap (4,096
  tokens); any other model gets the 2,048-token text cap even when the request asks for audio. It keeps only
  the generation settings our apps use (token limit, temperature, top-p and top-k, stop sequences, the response
  type and schema, modalities and voice) and drops the rest, so extra candidates or a thinking budget cannot
  multiply the output past the cap, even when the token limit is already within it.
  Source: automated security review of dd365d1 (a client-set audio modality skipped the cap; candidateCount
  and thinkingConfig multiplied output).
  Verified: the 2 new tests (speech cap only on the TTS model, audio asked on a text model gets the text cap;
  extra settings dropped within the cap) failed first, now 6 cloudGuard tests pass; functions typecheck exit 0;
  `bash scripts/ci-local.sh` exit 0.
- The photo and clip templates give every enum field `"type": "string"`. The shared schemas leave the type off
  enum fields, and without it the template reads `{"enum": [...]}` as an object with a field named "enum": the
  live photo and clip reads answered `"placeType": {"enum": "unknown"}`, which the clients' validation refuses.
  A test now requires a type on every output field at every depth.
  Source: the live check of the published templates (2026-11-18).
  Verified: the typed-fields test failed first (it listed the clip and photo enum fields), now 9 template tests
  pass; the dry run plans two updates; `bash scripts/ci-local.sh` exit 0.
- `cloudGuard` (AI Logic `beforeGenerateContent` trigger): every generateContent call through AI Logic,
  templated or not, may name only a model on the allow-list (a test keeps the function's copy equal to
  shared/constants/models.json), and a text reply is bounded to 2,048 output tokens (speech output is not
  text-bounded). No database or outside call, no minimum instances. Streaming calls and the Live API do not
  trigger it, by Google's design, so the iOS report read is not covered; SECURITY row 12 is updated after the
  live latency and refusal checks.
  Source: review (row 12 reversed: a trigger that does a real job, claimed honestly).
  Verified: the 5 tests (the list equals the shared one; off-list models refused in any path form; the clamp
  lowers or sets the bound and leaves the rest of the request; speech untouched; registered as the
  before-generate trigger) failed first (module missing), now pass; functions typecheck exit 0; baseline before
  deploy: median 839 ms over 10 warm direct calls; `bash scripts/ci-local.sh` exit 0.
- The rules gate's "no model call in any Cloud Function" rule now matches a call (`.generateContent(` or
  `.generateContentStream(`, `getGenerativeModel`, the model SDK imports) instead of any occurrence of the word,
  so a function can host the AI Logic `beforeGenerateContent` trigger, which calls no model, and mention the
  method in a comment.
  Source: review (cloudGuard needs the trigger's name in functions code).
  Verified: the new test (the trigger and a comment pass; a generateContent and a generateContentStream call
  still fail) failed first, now 27 gate tests pass; the gate walks the repo with 0 problems;
  `bash scripts/ci-local.sh` exit 0.
- Three more server prompt templates in `shared/templates`, each generated from its shared schema and pinned by
  tests (inputs bounded, output enums and limits equal to the shared schema, the model on the allow-list):
  `pls-photo-cues-v1` (the command post's photo read: one JPEG up to the 2 MiB photo limit, the photo-cues
  schema, the web's instruction plus a guardrail that text in the photo is data), `pls-clip-read-v1` (the family
  app's whole-clip read: video up to the 14,000,000-byte clip limit, the camera-sighting schema, the app's
  instruction including "Do not describe the face", plus the same guardrail) and `pls-voice-v1` (spoken text on
  the TTS model, voice Kore, audio out, text of 1 to 600 characters, no language code so a greeting can be in
  the person's first language). The web's clip read keeps its triage window, so it stays a direct call (P-04).
  The publisher renders a template without a system turn.
  Source: review (row 6: template every cloud-only call whose inputs templates support; P-04).
  Verified: the 3 template tests failed first, now 8 template tests pass; the API's validateOnly accepted all
  three; the dry run plans three creates and shows the sighting template as "same"; rules gate 0 problems;
  `bash scripts/ci-local.sh` exit 0.
- The template publisher reads the live list from the API's `templates` key (it read `promptTemplates`, so it
  saw no live template: a published one was planned as a create, and a locked one would never be refused).
  Source: found in review of the dry run (the published sighting template showed as "create").
  Verified: the listing test failed first, now passes; the dry run now shows pls-sighting-note-v1 as "same";
  `bash scripts/ci-local.sh` exit 0.
- P-04 evidence adds the window test: a server prompt template cannot pass a video window. With a 12-second
  clip of red, blue and green spans, both template forms (with and without start and end offset arguments)
  answered "red, blue, green" with 808 prompt tokens, while a direct call with `videoMetadata` 4 s to 8 s
  answered "blue" with 281. The web's triage-window clip read stays direct; a whole-clip read can be a
  template.
  Source: review (the clip template had to carry the triage window).
  Verified: run live with a limited-use App Check token and a throwaway anonymous user, both spike templates
  deleted afterwards; `bash scripts/ci-local.sh` exit 0.
- P-04 spike evidence (`docs/evidence/spikes/P-04.md`, `P-04.json`): through `templateGenerateContent` on the
  live project, a server prompt template takes an inline image (200, 1.6 s), a 13,788,183-byte inline MP4 just
  under our clip limit (200, 18.7 s) and returns text-to-speech audio (200, `audio/wav`, 318,750 bytes), with
  the media type and data passed as request variables. So the web photo read, both clip reads and the iOS
  cloud voice can each become a template.
  Source: review (P-04: which cloud calls can be templates).
  Verified: run with a limited-use App Check token and a throwaway anonymous user's ID token (both deleted or
  expired), the spike templates deleted afterwards; the evidence holds no key or token; `bash
  scripts/ci-local.sh` exit 0.
- The App Check control signs in anonymously before its model calls and sends the Firebase ID token, because
  AI Logic's authenticated-users mode (on since 2026-11-18 19:30 UTC) refuses a call without one; the
  throwaway user deletes itself afterwards. New `--ci` mode: the same positive read with the debug token from
  `APPCHECK_DEBUG_TOKEN_CI` and no evidence file; without that variable it prints "no CI token" and makes no
  call. The daily probe has the step, which skips until the secret exists (adding the secret needs the
  owner's yes). The local run on 2026-11-18 21:15 UTC is committed as evidence.
  Source: review (a positive daily read; the auth-mode change had broken the full control's 200 half).
  Verified: the 3 tests (--ci skips with no network call, the token source, the model headers) failed first,
  now 12 control tests pass; the local full run passed (no token 401, signed-in limited-use 200 with an
  answer, replay 401, user deleted) with no key or token in the evidence; a --ci run with the token in the
  environment passed and printed no token; the workflow pin lists the --ci step; `bash scripts/ci-local.sh`
  exit 0.
- `startJudgeSession` (callable, App Check enforced): a signed-in visitor gets their own practice incident,
  `incidents/judge-{uid}`, copied from the development drill on the Piedmont Park grid (its grid, IPP,
  terrain, prior and engine settings, segments, teams and shared profile; never its events, command profile
  or consent records), labelled "Training drill. Practice search; nobody is missing.", ending 24 hours after it
  starts, with the command role set on the caller. A visitor who returns while it is live gets the same one; a
  new one is allowed once an hour per visitor and at most 50 a day (counted in the admin-only
  `ops/judgeSessions`). `deleteEndedSandboxesJob` (hourly) deletes each sandbox, with everything under it, a
  day after it ends. LIMITS, SECURITY row 14 and the checklist describe it; the rulings are ledgered.
  Source: review (P0: no judge could use the site), plan Task 23a.
  Verified: the 7 tests (the copy and the claims, re-entry, the hourly limit and a clean rebuild, the daily cap
  and its reset, a signed-out caller and a missing seed, App Check through the wrapper, the cleanup) failed
  first (module missing), now pass; a rules test pins that a judge reads only their own sandbox and cannot
  write events elsewhere; emulator suite 142; functions typecheck exit 0; `bash scripts/ci-local.sh` exit 0.
- The seeding tool writes join codes to the Keychain through `security -i` on stdin instead of
  `security add-generic-password -w <code>`, whose arguments any local process can read while it runs; seeding
  and `--rotate` both use it. A value or name with unexpected characters is refused before anything runs.
  Source: review (no secret in a command line; the Android drill tests showed the same).
  Verified: the test (the code appears in no argument list, only on stdin) failed first, now 9 seed tests pass;
  a live round trip on a throwaway Keychain item read back equal and was deleted; `bash scripts/ci-local.sh`
  exit 0.
- clip-no-sighting's parity map now names Android's `ClipNoSighting` class (3603f3c) instead of a pending
  target, so the schema parity check covers it. LIMITS says a model or network error stores nothing: a
  completed reading never changes, so the record stays open and the next reader retries (both clients do this;
  `model_error` stays in the schema, unused).
  Source: the Android app (3603f3c, 30ef4eb) and the command post (readClip), with review.
  Verified: schema parity 12 schemas, 30 platform types, 0 failures; `bash scripts/ci-local.sh` exit 0.
- The first server prompt template, `shared/templates/pls-sighting-note-v1.json`, for the command post's
  consented cloud read of a sighting note: the model on the allow-list, temperature 0, a typed input (`note`,
  a string of 1 to 2,000 characters), the closed JSON output (direction and both colours as the report-reading
  schema's enums, footwear, carried and the evidence quote with its length limits) and a system guardrail (the
  note is data: ignore any instruction inside it). `scripts/template_publish.py` renders each template to a
  Dotprompt string with JSON frontmatter, so the repository is the source of truth, plans create or update
  against the live templates, validates, publishes and reads back, and refuses a locked template. The checklist
  says to lock live templates before judging.
  Source: review (AI Logic security checklist rows 6 and 6a: server prompt templates, typed and guarded).
  Verified: the 4 tests (allowed model and id, bounded input and guardrail in the rendered text, output enums
  and limits equal to the report-reading schema, the publish plan) failed first, now pass; the dry run read the
  live list and plans one create; the API's validateOnly accepted the rendered template; `bash
  scripts/ci-local.sh` exit 0.
- The backend's files are scrubbed for the public repository: the root CHANGELOG, two vector-tool comments, the
  linear-layer and urgency comments and tests, a judging-window docstring and the S4 spike evidence now name
  reviews and design decisions instead of internal roles, a private rule id or a private plan file.
  Meaning is unchanged; no code behaviour changes. The remaining hits are in the web changelogs, scrubbed
  separately.
  Source: review (the repository goes public on 2026-11-28).
  Verified: hygiene_guard reports 0 hits outside web/ (35 remain in web changelogs); vector generator --check
  and engine tests unchanged; `bash scripts/ci-local.sh` exit 0.
- SECURITY.md rows 7 and 12 name a fact read in the Firebase iOS SDK source: the iOS report read runs through
  the Foundation Models adapter (`geminiLanguageModel`), which sends its own `streamGenerateContent` request
  with tools, so it can be neither a server prompt template nor seen by the AI Logic before and after triggers.
  Source: review (rows 6, 7 and 12 of the AI Logic security checklist).
  Verified: GeminiLanguageModelExecutor calls `client.generateContentStream`, and GeminiAPIClient sends action
  `streamGenerateContent` with `alt=sse` (the SDK checkout the iOS build resolves); `bash scripts/ci-local.sh`
  exit 0.
- SECURITY.md row 12 is DECIDED-NO with the reason quoted from Firebase's page (generateContentStream and the
  Live API do not trigger the before and after functions, so a model allow-list there could be skipped) and
  the accepted risk named (another model through our project, at most 20 calls a minute, within the $25 cap).
  Row 10 records the quotas read for a judge surge and the reCAPTCHA cost of limited-use tokens; the project
  has no organization, so a shared free allowance is NOT VERIFIED.
  Source: review (rows 10 and 12 of the AI Logic security checklist).
  Verified: the quoted sentences read from firebase.google.com/docs/ai-logic/pre-and-post-request-scripts on
  2026-11-18; quotas read by the Cloud Quotas API; the project's parent read by gcloud (empty);
  `bash scripts/ci-local.sh` exit 0.
- `scripts/hygiene_guard.py` (CI gates job and ci-local): repository text must name no internal build process,
  private rule id, private playbook or notes, or private path. It walks tracked files plus untracked files that
  .gitignore does not exclude, skips itself and its test by pathspec, and fails below a 300-file floor. It
  reports hits while the repository is private and fails CI once it is public, armed off GitHub's
  `github.event.repository.private`. File contents only; history is not rewritten. Whole-word and
  case-insensitive, so a type such as ReadOrchestrator, the owner's name in NOTICE and the project id do not
  match.
  Source: review (the repository goes public on 2026-11-28).
  Verified: the 5 tests (public-only failure, whole-word patterns and the allowed names, untracked versus
  ignored files, the guard skipping itself, the floor) failed first, now pass; on this repo it walks 620 files
  and reports 91 hits, and with --public it exits 1 (proven red before the scrub); `bash scripts/ci-local.sh`
  exit 0.
- `shared/test-vectors/pack-segments-sample.json`: three segment docs (AC, ordinary; AA, with upstream or
  downstream links; and ROW) and the incident fields a pack carries (gridId, ipp, terrain, priorVersion), read
  from the drill incident on 2026-11-18 in Firestore's typed REST form, so integer and double values keep the
  types they are stored with. Labelled ODbL with the grid's own OpenStreetMap attribution. Synthetic drill data.
  Source: the iPhone app (decoding test for the iPhone's pack segments).
  Verified: read back by API from incidents/drill-dev-1 (68 segments; 19 with flow links; ROW present);
  `bash scripts/ci-local.sh` exit 0.
- `scripts/check_rc_keys.py` (a CI gate in the gates job and ci-local): exit 0 only when every Remote Config
  template key is read by some client, every key a client reads is in the template (declared defaults on web,
  iOS and Android, and direct reads such as getString("key")), and no engine number (a name in
  engine-params.json or walker-params.json, compared in snake_case) is in Remote Config, so search-model
  constants cannot be tuned remotely. Finding no key in code fails instead of passing empty. The production
  checklist names it.
  Source: plan Task 21a.
  Verified: the 6 tests (agreeing keys pass; an unread template key, a key read in code but missing from the
  template, an engine number in the template, and a repo with no defaults found each fail; this repo passes)
  failed first, now pass; this repo reads 10 keys, all in the template; `bash scripts/ci-local.sh` exit 0.
- LIMITS no longer says a record left by a reinstalled app needs command to clear it: since fc6e005 the new
  anonymous user takes the record over with their own consent.
  Source: review (doc drift after fc6e005).
  Verified: the takeover test in fc6e005 covers that case; `bash scripts/ci-local.sh` exit 0.
- Clip readings can no longer stall: the reading must be a valid CameraSighting or a typed no-sighting result
  (`{status: "no_sighting", reasons}`), with a valid RouteRecord, instead of any map, so a could-not-read
  result completes and caches the record. While the reading is null, any command or family member of the
  incident can take the record over: they set createdByUid to their own uid, give fresh consent marks of
  their own, createdAt at server time and expiresAt 31 to 33 days out; the clip's path never changes (the
  creator renewing is the same case). Before, only the creator could renew or complete it, so a second seat,
  a family phone or the same person after a new anonymous sign-in got "The clip was not read" for 32 days.
  The camera sighting fixture moves to the shared test fixtures. LIMITS describes both.
  Source: review on the command post's live finding.
  Verified: the typed-reading test (a junk map, an unknown reason, another status, no reasons, an extra key
  and a bad route refused; a no-sighting result accepted, once) and the takeover test (another incident's
  member, a takeover keeping the old owner, and a searcher refused; another family member and then command
  allowed; command completes; no takeover after a reading) failed first, now pass; the existing completion
  tests use schema-valid shapes; emulator suite 134; `bash scripts/ci-local.sh` exit 0.
- `shared/schemas/clip-no-sighting.schema.json` and the TypeScript `ClipNoSighting`: a clip reading that found
  no usable sighting, `{ status: "no_sighting", reasons: [...] }`, with 1 to 11 reasons from a closed list (the
  shared camera check's codes plus "unreadable_reply" and "model_error"), so a could-not-read result can be
  stored as the reading and cached. Android's mirror is marked pending in the schema's parity map.
  Source: review on a stalled clip reading (the command post found it on the live site).
  Verified: schema parity 12 schemas 0 failures; engine typecheck exit 0; `bash scripts/ci-local.sh` exit 0.
- Four route reasons for clip triage on the web: "on_device_triage_flagged" (the cloud read of a span the
  laptop's model flagged), "on_device_triage_no_person" and "triage_no_motion" (nothing sent; trace only), and
  "user_override_after_triage" (the consented cloud read anyway after such a result). Added to the route-record
  schema and the TypeScript RouteReason; the generated rules' bound on route.reason grows from 21 to 26
  characters. iOS decodes an unknown reason as `unknown` and keeps the event.
  Source: the command post (clip triage on Chrome), approved by review.
  Verified: the rules test (an event with each reason) failed first, now passes; emulator suite 132 including
  the heaviest events; schema parity 11 schemas 0 failures; `bash scripts/ci-local.sh` exit 0.
- `deleteIncidentMediaNow` also requires, as the security rules do, that the incident exists and has not ended
  (expiresAt absent or in the future): custom claims outlive an incident, so claims alone no longer let a
  stale command delete media. An ended judge sandbox is swept by deleteIncidentMedia.
  Source: automated security review of e80aced (sibling gate parity, stale claims).
  Verified: the test (an ended sandbox and a missing incident refuse even their command, with nothing deleted;
  a live sandbox's command deletes 4) failed first, now passes; emulator suite 131; functions typecheck exit 0;
  `bash scripts/ci-local.sh` exit 0.
- A test pins that the repo's `storage.lifecycle.json` passes the exact rule the live health check demands
  (Delete at 30 days on exactly clips/, photos/ and packs/), so the file applied to the bucket and the check the
  daily probe reads cannot drift apart. It completes Task 18a's lifecycle test.
  Source: plan Task 18a.
  Verified: a pin (the file was already right): with the file's age changed to 29 the test failed, restored it
  passes; its control (age 31 in memory) is refused; `bash scripts/ci-local.sh` exit 0.
- `deleteIncidentMediaNow` (callable, App Check enforced, command only): removes an incident's clips and
  photos and their reading documents at once, for example when a family withdraws consent, instead of waiting
  for the 30-day lifecycle. The caller's claims must name the incident and the command role; a malformed id is
  refused before anything is listed. This is the spec's command-only `deleteIncidentMedia` callable under a new
  name, because that name is the scheduled sandbox sweep. SECURITY.md row 14 and LIMITS name it.
  Source: plan Task 18a (spec section 6.5).
  Verified: the 4 tests (command removes its files and readings and nothing of another incident; searcher,
  family, another incident's command and a signed-out caller refused with nothing deleted; malformed ids
  refused; the exported callable refuses a signed-in request with no or a bad App Check token, capped at 5
  instances in us-central1) failed first, now pass; emulator suite 128; functions typecheck exit 0;
  `bash scripts/ci-local.sh` exit 0.
- The raw-callable test harness (a request through the Functions wrapper, and an Auth emulator ID token) moves
  from the join tests into `functions/test/callable.ts`, so other callables can prove App Check enforcement the
  same way. The caller now names the function it calls. No behaviour change.
  Source: plan Task 18a (the command-only media delete callable needs the same proof).
  Verified: emulator suite 124 (the join tests unchanged in what they assert); functions typecheck exit 0;
  `bash scripts/ci-local.sh` exit 0.
- SECURITY.md rows read back again on 2026-11-18: the iOS API key is restricted to `app.pointlastseen.field`,
  the only target that calls Firebase (row 3 now covers all three keys); the per-user limit is 20 generate
  requests a minute in every region, with the estimate behind the number (row 9); both budgets on the billing
  account, with their alert thresholds (row 11); and the Android release build's App Check exchange is
  refused until the app is linked in Play Console (row 1c).
  Source: review (AI Logic security checklist rows 1c, 3, 9 and 11).
  Verified: each key's restrictions read back by API after the change; a signed-in cloud read and the cloud
  voice from the iOS simulator, the drill end-to-end run (debug certificate) and the release probe (release
  certificate) on Android, and the deployed web set all passed with no API_KEY error; `bash scripts/ci-local.sh`
  exit 0.
- The daily probe also reads the Firebase AI Logic models page (`scripts/models_probe.py`, credential-free)
  and fails if any model named by the Remote Config template or shared/constants/models.json is missing, is
  in the Shutdown stage, or has a shutdown date on or before 2026-12-17. A model can be withdrawn earlier than
  its documented date, so this page check pairs with the full signed call run on the Mac. It fails, rather
  than passing empty, if the page yields fewer than 10 model records (24 on 2026-11-18). It retires after
  2026-12-17, pinned with the other probes, and a new test pins that the workflow runs every probe script.
  The workflow's comment now says 20 minutes for the sweep, as the probe checks.
  Source: review (a model can disappear before its documented date; the no-token check would still pass).
  Verified: the 6 probe tests and the workflow pin failed first, now pass; the live run read 21 distinct
  records and both named models (gemini-3.5-flash-lite, gemini-3.8-flash-lite-tts) are listed with no
  shutdown date; `bash scripts/ci-local.sh` exit 0.
- LIMITS names two sign-in limits a drill can hit: Firebase Auth's anonymous sign-up limit per network
  address (HTTP 400 TOO_MANY_ATTEMPTS_TRY_LATER, auth/too-many-requests on the web) and joinIncident's 10
  join attempts per user per one-hour window from the first attempt, with what to do on drill day.
  Source: the command post (both hit or checked on 2026-11-18).
  Verified: the join limit, window and message read in functions/src/join.ts; the web's current sign-in
  message read on main; `bash scripts/ci-local.sh` exit 0.
- `docs/SECURITY.md`: Firebase's AI Logic security checklist, row by row, with the state read back from the
  live project on 2026-11-18, and how anyone can check it: a keyless call a stranger can paste (with the site's
  Referer it answers 401 "Firebase App Check token is invalid."; without it the key answers 403
  API_KEY_HTTP_REFERRER_BLOCKED), App Check and replay protection enforced on AI Logic, authenticated-users
  mode on, the browser and Android keys restricted, the 27-API allowlist kept (DECIDED-NO on narrowing, with
  the reason), template-only mode DECIDED-NO (the SDK fact that forces it), Model Armor DECIDED-NO (Gemini
  Developer API backend), the per-user limit still at the default 100, App Check on Firestore and Storage not
  enforced yet with the plan, and every cloud model call with its mode and trigger.
  Source: review (the sponsor's AI Logic security checklist as a requirement list).
  Verified: each code claim grepped on main (providers, backends, limited-use wiring, enforceAppCheck, SDK
  signatures in firebase/ai 3.1.0); both keyless answers sent with the same URL, headers and body from Python
  on 2026-11-18 (curl is blocked on this machine); `bash scripts/ci-local.sh` exit 0.
- The daily media probe sends the hosting origin as its Referer on the public ops/storage read, and a test pins
  that the App Check control already does, ahead of restricting the browser API key to the hosting origins.
  Source: review (API key application restrictions, AI Logic security checklist).
  Verified: the probe's Referer test failed first, now 6 probe tests and 9 control tests pass; the probe passed
  live with the header; `bash scripts/ci-local.sh` exit 0.
- `tools/seed/seed_drill.py --rotate <project> <incidentId> <role>` replaces one role's join code: the new code
  (distinct from every current code) is kept in the Keychain before anything changes, then one atomic commit
  creates its joinCodes doc only if absent and deletes the old doc only if present, so a failure leaves the old
  code working; no code is printed. Used on 2026-11-18 to rotate the drill-dev-1 family code after it appeared
  in a local session output.
  Source: review (a code shown in a local tool output counts as exposed).
  Verified: the commit-shape and fresh-code tests failed first, now 8 seed tests pass; after the rotation the
  only family joinCodes doc for drill-dev-1 is the new code's hash, a live join with the new code answered 200
  and a wrong code 403 PERMISSION_DENIED (throwaway anonymous user, deleted after); `bash scripts/ci-local.sh`
  exit 0.
- The App Check control's full mode asks the debug-token exchange for a limited-use token
  (`{"debugToken": ..., "limitedUse": true}`) and adds a replay half: the same token used a second time must
  be refused with 401. App Check replay protection was enforced on AI Logic on 2026-11-18, after which the old
  session-token exchange made the 200 half fail. The run on 2026-11-18 is committed as evidence: no token 401
  "Firebase App Check token is invalid.", fresh limited-use token 200 with an answer, the same token again 401
  with the same message.
  Source: review (replay protection enforced on AI Logic).
  Verified: the exchange-body and replay tests failed first, now 8 control tests pass; the live full run passed
  and its evidence file holds no key or token; `bash scripts/ci-local.sh` exit 0.
- `deleteClipOnConsentEnd` (Firestore delete trigger on incidents/{incidentId}/clipReadings/{sha256}, retry on)
  deletes clips/{incidentId}/{sha256}.mp4 when its consent record is deleted, by the TTL, by command or
  otherwise, so a clip never outlives its consent by more than the trigger's delay; before, only the 1-day
  margin over the lifecycle covered that, about the size of the lifecycle's own delay. It also clears the clip
  of a stale record that command deletes. Only a 64-hex-digit id names a clip; anything else touches nothing,
  and a missing clip is not an error. LIMITS names it as the mechanism.
  Source: review (follow-up low after round 3).
  Verified: the 4 tests (the one clip deleted and nothing else, a missing clip, non-hash ids touching nothing,
  the trigger's path, delete event and retry) failed first, now pass; emulator suite 124; functions typecheck
  exit 0; `bash scripts/ci-local.sh` exit 0.
- The emulator port wait asks ps for unlimited width (`ps -wwAo`). On the Linux CI runner under pytest, ps cut
  each line at 80 columns, dropping the "--port N" the wait looks for, so the wait reported the ports free
  while an emulator process still held one. The CI gates job had failed on this test since f8d1547, and the
  same cut would have hidden a real lingering Firestore JVM on Linux.
  Source: CI failure on main (gates job), reproduced in a Linux container.
  Verified: the process-holder test, now run with COLUMNS=40, failed in a python:3.12 Linux container (the ps
  line ended "fake-firestore-") and passes there after the fix (11 tests; the lsof test needs lsof, which the
  container lacks and the runner has); 12 emulator-config tests pass locally; `bash scripts/ci-local.sh` exit 0.
- Remote Config can no longer be replaced by a partial template. `remoteconfig.template.json` holds every key
  the three clients read, with the intended values (kill_cloud false, limited-use tokens on, every model key on
  the allow-list, the iOS voice model set), and a test fails if any client's default key is missing from it.
  `firebase.json` no longer names the template, so a plain `firebase deploy` cannot publish it; the new
  `scripts/rc_publish.py` reads the live template and its ETag first, lists what it adds, changes and removes,
  refuses any changed or dropped live value unless the key is named with `--allow`, validates, then publishes
  with If-Match. It asks for gzip, because the API sends the ETag only then (found in the first dry run).
  Source: review round 3 (medium: publishing the one-key template could clear a kill_cloud pause).
  Verified: the 7 tests (every client key present, intended values, no template in firebase.json, the plan's
  refusals for a changed, dropped or conditional value, an empty live template, gzip and ETag) failed first,
  now pass; the dry run against the live project read an empty template and planned 10 additions, nothing
  published; rules gate 0 problems; `bash scripts/ci-local.sh` exit 0.
- Generated rules check each item of a short string list by index (segment ids, carried items): the list is
  padded with valid placeholders, so no size guard is needed, and each item gets one regex for type and length.
  The comma-joined regex is gone, so "ABCDEFGHIJKLMNOP,Q" is refused as one 18-character id and a carried item
  may hold a comma ("bag, bottle") or a newline. To stay under the 1,000-expression limit, every bounded string
  in shape mode is now one regex (`matches('(?s)^.{lo,hi}$')`, which errors on a non-string, so the rule
  denies) instead of a type check plus size comparisons; the largest camera sighting fits again.
  Source: review round 3 (low).
  Verified: the generator tests and the comma, newline, comma-joined id and non-string id cases failed first
  (the per-index form without the string change went over the limit on the largest camera sighting), now 9
  generator tests and 120 emulator tests pass, including every heaviest-event test; `--check` exit 0;
  `bash scripts/ci-local.sh` exit 0.
- The emulator port wait treats an unreadable process list (ps failing or printing nothing) as unknown: it
  keeps waiting and then fails, naming the cause, instead of reporting the ports free. `--who-holds` says
  "unreadable" in that case rather than "none".
  Source: review round 3 (low).
  Verified: the test with ps returning exit 1 and exit 0 with empty output failed first (the wait printed
  "emulator ports free"), now 12 emulator-config tests pass; `bash scripts/ci-local.sh` exit 0.
- The media sweep covers every ended judge sandbox whose last sweep was not empty, however old, and a missing
  stamp counts as unstamped (one equality query on mode; the sandbox count is small), replacing the 7-day
  window that missed an old sandbox with a stale stamp or no stamp field. Any failure inside one sandbox,
  including a rejected Firestore write, is caught and reported, and the next sandbox is still swept.
  `runMediaSweep` writes the ops/storage heartbeat in a finally block on every run (a sweep that throws counts
  as one failure and is rethrown after the write), and the daily probe now fails when the heartbeat is over 20
  minutes old (four missed 5-minute runs) instead of 2 hours. LIMITS and the checklist name the 5-minute
  schedule and the new probe limits.
  Source: review round 3 (two mediums).
  Verified: the old-sandbox test (stale stamp and missing stamp swept, a done sandbox left alone), the failed
  write test (NOT_FOUND on one sandbox, the next still swept), the two heartbeat tests (clean run, thrown
  sweep) and the 20-minute probe tests failed first, now pass; the held-clip test now also checks the retry
  deletes the clip; emulator suite 119; 5 probe tests; functions typecheck exit 0;
  `bash scripts/ci-local.sh` exit 0.
- Clip consent is checked where it matters, at upload: Storage takes a clip only while its consent record
  expires at least 31 days after the upload, whenever the consent was written, so the consent always outlives
  the clip (deleted 30 days after upload) and an old 30-day record can no longer authorize an upload. The
  24-hour createdAt rule is gone. The 31 to 33 day window on write stays (clients write 32). The creator can
  renew the consent (consent, expiresAt and a server createdAt only, in the same window) while the clip has no
  reading, so an interrupted upload is not stranded. LIMITS and the release checklist say an APK older than
  c05f679 cannot read clips.
  Source: review round 3 (two mediums).
  Verified: the upload-time test (30 days 23 hours refused, 31 days 1 hour accepted on a 3-day-old consent),
  the retry test (refused, renewed, then accepted) and the renewal test (another user, an expiry outside the
  window, a moved storagePath, a client createdAt and a renewal after the reading all refused) failed first,
  now pass; emulator suite 116; judging-window test 3; `bash scripts/ci-local.sh` exit 0.
- `simulateWalkers` takes an optional `onProgress(done)`, called after every 1,000 walkers and once at the end,
  so the web worker can show progress on a long run. It reads no random draw and never changes the table.
  Source: the command post (Task 37c progress every 1,000 walkers).
  Verified: the test (2,500 walkers report 1,000, 2,000, 2,500, and the table equals a run without the
  callback) failed first, now 198 engine tests pass; lint exit 0; `bash scripts/ci-local.sh` exit 0.
- `build-grid --graph <grid.json> --osm <overpass.json> --out <site.graph.json>` writes the stored route graph
  for walkers from the same Overpass extract as the grid, bounded by the grid's box (the box the extract was
  queried on), so a site's graph is one command after its grid. The Piedmont Park dev graph built this way has
  1,549 edges, 1,203 nodes and 130 exits (local evidence, not in the repo).
  Source: the command post (Task 37c needs the drill's route graph).
  Verified: the CLI test (graph written with the grid's id and box, edges and projection present, exit 2
  without --osm) failed first, now 25 grid-builder tests pass; typecheck exit 0; a 2,000-walker run on the dev
  graph through the engine's indexRouteGraph returned sample tracks; `bash scripts/ci-local.sh` exit 0.
- `indexRouteGraph` (with `routeGraphExtent` and `ROUTE_SNAP_M`) moves from the grid builder into @pls/engine,
  so the web worker and the grid builder index the same stored RouteGraph file the same way (exits from its
  stored bounds, the stored projection) instead of the web keeping a second loader or a second file format. The
  grid builder imports it back, with its tests unchanged.
  Source: the command post (Task 37c walkers on the web need the drill's route graph).
  Verified: the new engine tests (exit on the stored bounds, stored projection, refusal without bounds) failed
  first, now 197 engine tests pass; 24 grid-builder tests pass; both typechecks and lint exit 0; rules gate 0
  problems; `bash scripts/ci-local.sh` exit 0.
- A reading's segment ids (and a camera sighting's carried items) are checked per item again: one regex over the
  comma-joined list bounds each item's length (1 to 16 for segment ids), at about the cost of the joined-length
  bound it replaces, so the heaviest events still fit the expression budget. A 17-character or empty segment id
  is now refused (an empty list is told apart from [""] by its size when items have a minimum length). An
  item that itself contains a comma is read as two shorter items; real ids are two letters or ROW.
  Source: review round 2 (low: a 17-character segment id passed).
  Verified: the generator test failed first, now 9 pass; the 17-character and empty id cases are refused;
  emulator suite 114 including the heaviest events; `bash scripts/ci-local.sh` exit 0.
- The App Check control's answer check requires the text to be a non-empty string: a part whose text is null
  or a number no longer counts as an answer (null used to read as the string "None").
  Source: review round 2 (low).
  Verified: the null and number cases failed first, now 6 control tests pass; `bash scripts/ci-local.sh` exit 0.
- The lifecycle health check compares the prefixes as an exact set, each of clips/, photos/ and packs/ once
  (no string join), and fails when any other Delete rule in the bucket policy is younger than 30 days, touches
  one of those prefixes, or covers the whole bucket, since any of those would delete drill media before the
  promised 30 days. Rules with other actions (storage class changes) do not count.
  Source: review round 2 (medium).
  Verified: the undercutting-rule and duplicate-prefix test failed first, now passes; emulator suite 114;
  functions typecheck exit 0; `bash scripts/ci-local.sh` exit 0.
- ops/storage keeps a sweep failure streak (consecutive sweeps with any failed sandbox, reset by a clean sweep),
  and the daily probe fails when it reaches 2, so a stuck delete (a hold, a permission change) is reported
  instead of retried silently for days. One failing sweep still passes, so a single transient error does not
  page anyone.
  Source: review round 2 (medium).
  Verified: the streak test (two failing records then a clean one) and the probe test failed first, now pass;
  emulator suite 113; 5 probe tests; `bash scripts/ci-local.sh` exit 0.
- The media sweep, redesigned from the second review round: it lists only sandboxes ended in the last 7 days
  plus any not yet stamped (a failed sweep writes mediaDeletedAt: null so the equality query keeps finding it),
  instead of the whole history every 5 minutes; each of a sandbox's three prefixes is listed and deleted on its
  own (allSettled), so a held clip never stops that sandbox's photos and packs or the next sandbox; and a
  sandbox is skipped only once it is stamped and its previous sweep found nothing (mediaSweepEmpty), replacing
  the 24-hour cutoff that could miss a late file. mediaSweepEmpty joins mediaDeletedAt as server-only in the
  rules. Sandbox creation (Task 23) must write mediaDeletedAt: null so an unswept sandbox older than 7 days is
  still found.
  Source: review round 2 (two mediums and a low on the sweep).
  Verified: the late-file, held-clip and history-scope tests failed first, now pass; the command
  mediaSweepEmpty write is refused; emulator suite 113; functions typecheck exit 0;
  `bash scripts/ci-local.sh` exit 0.
- Clip consent window, redesigned so a fresh consent is never refused and always outlives its clip: a clip
  reading's expiresAt must be 31 to 33 days after the server's time (clients write 32, which tolerates clock
  skew both ways), and storage.rules accept a clip upload only while its consent record is under 24 hours old.
  The lifecycle deletes the clip 30 days after upload, so the consent's TTL never runs first. The previous
  window (at least 30 days) refused the Android client, which wrote exactly now plus 30 days, so every fresh
  consent and its upload would have failed; the 30.5-day test fixture hid it. The fixture now writes 32 days,
  as the clients do.
  Source: review round 2 (high).
  Verified: the boundary tests (31 days minus and plus a minute, 33 days minus and plus a minute, 30 days, the
  past) and the 24-hour upload test failed first, now pass; emulator suite 113; the judging-window test still
  pins at least 30 days; `bash scripts/ci-local.sh` exit 0.
- The incident doc gains `conditions` for the urgency chip: shared/schemas/incident-conditions.schema.json
  (tempF a number from -80 to 140 or null, wet a boolean or null, setAtMs), the IncidentConditions type and
  `urgencyFromConditions` in @pls/engine (no conditions gives no chip), and a generated rules validator applied
  whenever a command update carries the field. The iOS twin is marked pending in the parity map for the iPhone app.
  Source: the iPhone app (P-12 urgency chip inputs).
  Verified: the engine test (no function) and the rules test (any shape accepted) failed first, now pass; schema
  parity ok (11 schemas, 27 types); engine 195 tests, typecheck and lint exit 0; emulator suite 112 (refusal
  cases use updateDoc, since a merging setDoc deep-merges the map); `bash scripts/ci-local.sh` exit 0.
- A route record's stage may be "picklist": a person picked the report from a list, so no model ran. Added to
  shared/schemas/route-record.schema.json and the TypeScript ReadStage union (parity checks the TS values; the
  Swift and Kotlin types follow in those apps). The rules already bound stage by length, so the generated block
  is unchanged; a new rules test pins that a picklist route is accepted. No vector: the router never computes
  this stage.
  Source: the iPhone app (P-12 / pick-list reports).
  Verified: schema parity ok (10 schemas, 26 types); generator and vectors checks current; the new rules test
  passes (it passed at once, since stage was already length-bounded); emulator suite 111;
  `bash scripts/ci-local.sh` exit 0.
- The iOS cloud voice model is named only through Remote Config: `remoteconfig.template.json` (wired in
  firebase.json, deployed with the next production deploy) sets `tts_model_ios` to gemini-3.8-flash-lite-tts,
  whose in-app default is empty (on-device speech only). The model joins the allow-list in
  shared/constants/models.json: Stable, no shutdown date, billing not required, as read on the live models page
  on 2026-11-18. The rules gate checks the template's model ids against the list like any source file.
  Source: the iPhone app (spoken assignment changes; the model name lives in Remote Config only).
  Verified: the gate passes on the tree (589 files, 0 problems) with the template naming the listed model;
  firebase.json parses and its emulator config tests pass; `bash scripts/ci-local.sh` exit 0.
- The rules gate bans gemini-3.8-flash by whole model id, not by substring: the TTS models whose ids start with
  the same text (gemini-3.8-flash-lite-tts) are different models and no longer trip it.
  Source: the iPhone app (the substring check would have failed the TTS model everywhere).
  Verified: the new test failed first, now 26 gate tests pass; the gate walks 588 files with 0 problems;
  `bash scripts/ci-local.sh` exit 0.
- The emulator port wait also waits for any running emulator process whose arguments name a port in this
  worktree's block, and `--who-holds` prints those processes and the kernel's sockets on the block (TIME_WAIT
  included). The one-off WebChannel bind failure reproduced here: a bind on this worktree's own Firestore port
  failed seconds after the previous emulator run returned, with no other worktree's block overlapping, which
  points at `emulators:exec` returning before the Firestore JVM has released its ports. The wait tests now pick a
  test worktree whose block is free, so a live emulator cannot make them fail.
  Source: the iPhone app's flake report and its reproduction in this worktree.
  Verified: the process test failed first, now 11 emulator_config tests pass; `--who-holds` prints all three
  sections; `bash scripts/ci-local.sh` exit 0.
- The App Check control counts the debug-token call as passed only when the 200 carries a non-empty answer
  (candidates with text); a 200 with {} or no text now fails the control.
  Source: review of 2bdb778..dc762be (low).
  Verified: the new test failed first, now 6 control tests pass; `bash scripts/ci-local.sh` exit 0.
- media_probe compares the sweep's age in raw seconds: 120 min 30 s now fails the 120-minute limit (it used to
  floor to 120 and pass).
  Source: review of 2bdb778..dc762be (low).
  Verified: the new test failed first, now 4 probe tests pass; `bash scripts/ci-local.sh` exit 0.
- Command can no longer write `mediaDeletedAt` on an incident; only the media sweep (admin) sets it, so a
  command member cannot mark a sandbox's media as deleted and hide that it is still stored.
  Source: review of 2bdb778..dc762be (low).
  Verified: the new test failed first, now passes; emulator suite 110; `bash scripts/ci-local.sh` exit 0.
- A clip reading's expiresAt must be 30 to 31 days after the write (before, anything from a minute to 31 days
  passed), so the TTL on the consent record can no longer delete it while the clip it covers lives up to 30
  days. The test fixture writes 30.5 days.
  Source: review of 2bdb778..dc762be, finding M5.
  Verified: the new expiry cases (a minute out and 29 days out are refused) failed first, now pass; the
  judging-window test still pins at least 30 days; emulator suite 109; `bash scripts/ci-local.sh` exit 0.
- Swift core CI also runs when the iOS view sources change (ios/PLS/**, ios/PLSWidgets/**, ios/PLSShared/**):
  PLSCore's FieldTextSizeTests scans them for text styles below Title 3 or fixed point sizes, so a view-only
  change must not skip it.
  Source: the iPhone app request (c8ec85a adds the test).
  Verified: both path lists carry the three folders; `bash scripts/ci-local.sh` exit 0.
- profile/shared must be written whole: all 20 keys the schema requires (the schema always required them; the
  rules allowed partial writes). A nickname-only write was accepted and then crashed readers that expect every
  field (the web approach card on approachNoteIds; the iOS decoder on answersTo). The web and Android writers
  already send all 20 keys; a shared `sharedProfile()` test fixture replaces the partial ones.
  Source: review of 2bdb778..dc762be, finding M4 (readers on each platform also default missing fields).
  Verified: the partial-write test failed first (a nickname-only doc and a doc without approachNoteIds were
  accepted), now refused; emulator suite 109; `bash scripts/ci-local.sh` exit 0.
- Event positions keep their range check and refuse NaN again: in shape mode a symmetric range compiles to one
  comparison (`lat * lat <= 8100`, `lon * lon <= 32400`), which also refuses NaN and infinity. To pay for it
  under the 1,000-expression limit: an integer enum in even steps (cameraFacingDeg 0 to 315 by 45) compiles to
  a range and a step instead of a list literal; a patterned string skips the redundant "is string" (matches()
  already denies a non-string); and the confirmation clause no longer re-checks targetEventId and decision,
  which are validated earlier in the same rule.
  Source: security review of the previous rules commit (Position had become type-only, which accepted NaN and
  out-of-range values).
  Verified: generator tests for the even-step enum and the symmetric range failed first, now 9 pass; the
  position test again refuses lat 91, accuracy -1 and NaN; the heaviest real events still pass; emulator suite
  108; `bash scripts/ci-local.sh` exit 0.
- Rules validators, review findings M3 and generator drift: each keyFrame.box2d entry must be an integer from 0
  to 1000 (before, only the count of 4 was checked), a reading's `kind` must be one of the schema's values, and
  a route's latencyMs must be 0 or more. To fit the heaviest real events under Firestore's 1,000-expression
  limit per request (a camera sighting with a GPS position and a route record went over), validEvent reads
  the incident once, reads the event type once and drops a redundant signed-in check, and shape mode keeps
  the kind enum, latencyMs and array item ranges while other string enums stay length-bounded, other numbers
  type-only, short string lists bounded by joined length, and Position type-only. Clients and engines
  validate those values; the rules guarantee every field's type and size.
  Source: review of 2bdb778..dc762be (M3; low: generator drift).
  Verified: generator tests rewritten first (8 pass); the heaviest-event tests went over the limit until the
  cuts, now the emulator suite passes 108; the position test now refuses an extra key, a missing key and a
  wrong type (ranges no longer checked, recorded as a decision); `bash scripts/ci-local.sh` exit 0.
- deleteIncidentMedia runs every 5 minutes (still one Cloud Scheduler job), so "a sandbox's media is deleted
  within 15 minutes of its end" (docs/LIMITS.md) holds even when a run starts late; a 15-minute schedule
  could not keep a 15-minute promise. The timeout drops to 240 s so a run ends before the next starts.
  Source: adversarial review of 2bdb778..dc762be, finding M2 (review preferred 5 minutes).
  Verified: the schedule test (reads the function's own endpoint metadata) failed first with "every 15
  minutes", now passes; emulator suite 108; `bash scripts/ci-local.sh` exit 0.
- deleteIncidentMedia handles each ended sandbox on its own: a failed delete (a Storage hold, a transient
  error) is logged with the incident id, counted in ops/storage (`sweepFailures`, a count only since the doc
  is public) and left unstamped so the next run retries it, and the other sandboxes are still cleaned. Before,
  one throw left every later sandbox's media in place. A sandbox stamped and ended more than 24 hours ago is
  no longer listed, so the work stays flat as sandboxes pile up; inside the 24 hours an upload in flight at the
  end is still caught.
  Source: adversarial review of 2bdb778..dc762be, finding M1 (verified in review and against
  the code).
  Verified: 2 new tests (a held sandbox does not stop the next and stays unstamped; a long-stamped sandbox is
  not listed) and the updated ones failed first, now pass; emulator suite 107; functions typecheck exit 0;
  `bash scripts/ci-local.sh` exit 0.
- The lifecycle check behind ops/storage (and so the daily probe) accepts only the exact rule LIMITS promises:
  action Delete, condition keys exactly age and matchesPrefix, age exactly 30, prefixes exactly clips/, photos/
  and packs/ in any order. Before, a bucket-wide or shorter delete, an extra condition such as isLive, or a
  fourth prefix read as OK while deleting drill media early or not at all.
  Source: adversarial review of 2bdb778..dc762be, finding M6 (verified in review and against
  the code).
  Verified: the new exact-rule test failed first (the 7-day bucket-wide rule read OK), now passes; emulator
  suite 105; `bash scripts/ci-local.sh` exit 0.
- A stored RouteGraph now carries its own extract `bounds` (or an explicit null for a graph with no exits) and
  its `projection` (metres per degree at the origin). `indexRouteGraph(graph)` takes no outside bounds and
  refuses a graph without either field. Before, a reload without the second argument silently marked every
  node as not a boundary, so walkers that should exit the area into ROW stayed on the graph; and each load
  recomputed the projection with Math.cos, which can differ in the last bit across engines. Schema, TS type
  (the only parity target) and the builder change together.
  Source: merge point 2 review of the walkers branch (a fresh review, medium design finding and a low
  determinism finding); the bounds decision at merge point 2.
  Verified: 3 graph tests failed first (round trip without the bounds argument, null bounds, refused reload),
  now 24 grid-builder tests pass; both typechecks exit 0; schema parity ok (10 schemas, 26 types);
  `bash scripts/ci-local.sh` exit 0.
- LIMITS: the Android on-device structured-output path (generateObject), whether it fills response.text, and
  whether wire-named enum constants survive ML Kit's on-device schema translation are marked NOT VERIFIED (no
  Gemini Nano phone); a mismatch is refused by the closed-schema check, not used.
  Source: the Android app.
  Verified: docs only; `bash scripts/ci-local.sh` exit 0.
- The `android` job and ci-local also compile the instrumented tests (`compileDebugAndroidTestKotlin`, no
  emulator needed), so a broken androidTest fails at merge instead of only when the Android app runs it by hand.
  Source: the Android app.
  Verified: `./gradlew --no-daemon compileDebugAndroidTestKotlin` BUILD SUCCESSFUL on main's android/;
  `bash scripts/ci-local.sh` exit 0.
- Checklist: the judging-window model line now points at the gate's allow-list and asks for a re-read of the
  live models page on or after 2026-11-28, moving any newly retiring id to `banned` and updating `readOn`;
  Remote Config values get the same check before the template is published.
  Source: review (turn the model line into a test; re-read the page on Nov 28).
  Verified: docs only; `bash scripts/ci-local.sh` exit 0.
- Model allow-list: `shared/constants/models.json` lists the model ids the project may name (today only
  gemini-3.5-flash-lite: Stable, released 2026-07-21, no shutdown date) and the banned ones
  (gemini-3.1-flash-tts-preview, shut down 2026-11-17), read from the live Firebase AI Logic models page on
  2026-11-18, to be re-read by 2026-11-28. The rules gate fails on any model id in source that is not listed,
  and on a banned id anywhere outside docs, tests included; test files may name other ids as data.
  Source: review (judging-window audit: a model shutting down inside the window would break the cloud
  route; read of the models page 2026-11-18).
  Verified: 2 gate tests failed first, now 25 pass; the gate passes on this tree and on the iOS, web,
  Android, walkers and extras branches (each walked with this gate and list);
  `bash scripts/ci-local.sh` exit 0.
- P-12 urgency chip: `shared/constants/urgency.json` (coldF 40, the CDC sentence it rests on, its URL and the
  date it was read), `urgencyLevel(tempF, wet)` in @pls/engine, and shared vectors in
  `shared/test-vectors/urgency.json` from the Python reference so web (the command post) and iOS (the iPhone app) agree: cold at
  or below 40 F, cool_wet above it when typed wet, none otherwise. Clothing does not enter. Decision: no typed
  temperature gives none (no chip without data) and an unanswered wet question counts as dry. The vectors sit
  in their own file because the Swift vector test refuses unknown sections in search.json.
  Source: review (P-12), design decisions.
  Verified: the CDC sentence was found word for word on the live page (reviewed 2026-08-25, read 2026-11-18);
  the urgency tests failed first (no constants file), now 183 engine tests pass with the 7 vectors;
  search.json unchanged; 16 generator tests pass; `make_vectors.py --check` covers the file; the
  vectors-parity job diffs it and runs its TS test; `bash scripts/ci-local.sh` exit 0.
- NOTICE credits anime.js 4.5.0 (Julian Garnier, MIT), imported only by web/src/motion/engine.ts (the rules
  gate enforces that); it arrives with the command post's merge (dependency 657d96b, engine cf627b4).
  Source: plan Task 39.3, the command post hand-over.
  Verified: `npm view animejs@4.5.0` reports license MIT, author Julian Garnier, repository
  juliangarnier/anime; `bash scripts/ci-local.sh` exit 0.
- NOTICE lists the three web fonts under the SIL Open Font License 1.1 (DINish v4.007, Ioskeley Mono v2.2.0,
  DSEG7 Classic v0.46) with their repositories and commits; the files arrive with the command post's merge.
  Source: plan Task 39, the command post hand-over.
  Verified: each tag resolves to the stated commit and each repository's license reads OFL-1.1 through the
  GitHub API (2026-11-18); `bash scripts/ci-local.sh` exit 0.
- Rules gate, Task 39: the font names "Berkeley Mono" and "Digital-7" fail outside docs (only the OFL fonts in
  web/public/fonts ship); animejs may be imported only by web/src/motion/engine.ts (dynamic imports and
  require included; package.json may list it); and web/index.html and web CSS may not load a font from a
  remote host (Google Fonts, Typekit, Bunny, fonts.com, cdnfonts, Adobe).
  Source: plan Task 39, the command post hand-over.
  Verified: 3 gate tests failed first, now 23 pass (one test assertion was tightened to file:line, since the
  message itself names engine.ts); the gate walks 420 files with 0 problems; the web and extras branches show no
  match; `bash scripts/ci-local.sh` exit 0.
- docs/LIMITS.md gains "On-device safety (Android)": the family app's on-device path (firebase-ai-ondevice
  16.0.0-beta08 over the ML Kit GenAI Prompt API and AICore), Google's own statements about its safety
  filters and the 4,000-token input window (three quotes, each with its URL), our own checks on every path, the
  byte bound for our largest request, and what was not tested (no Gemini Nano phone; non-English notes).
  Source: the Android app hand-over (promotion item F5); the "128K" figure from the talk is left out, as the Android app
  found it in no Google doc.
  Verified: a fetch found all four quoted passages word for word on the three live pages (2026-11-18);
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
  flagged in review).
  Source: review 2026-11-18 on the Piedmont Park dev grid (nearFrac at least 0.927 everywhere).
  Verified: 2 engine tests failed first (no function; a dense grid was not neutral), now 174 pass with the 5
  prior vectors; search.json byte-identical (no existing expected value changed); 15 generator tests pass;
  `make_vectors.py --check` covers both files; the vectors-parity job diffs both and runs both TS vector tests;
  `bash scripts/ci-local.sh` exit 0.
- Production checklist, Android: raise the Remote Config key `minimum_version_android` only after the repo is
  public (not before 2026-11-28) and the release APK is a GitHub Release asset, because the family app's
  update screen opens the repo's latest release, a 404 while the repo is private; the line names the two `gh`
  checks to run first. The in-app default stays 0 (the Android app's RcValuesTest pins it).
  Source: the Android app hand-over (J10), ruled in review.
  Verified: text as handed over; no code change.
- `docs/PRODUCTION-CHECKLIST.md`: a Judging window (2026-12-10 to 2026-12-16) section lists every time-based
  value on a judged path (Storage lifecycle, clipReadings TTL, judge sandbox limits, App Check token TTLs and
  enforcement, the published run, the media sweep, the daily probe, GitHub's 60-day cutoff, the Actions and
  Gemini budgets, model shutdown dates, image cleanup), what it does on Dec 10 and Dec 16 and what guards
  it, with pre-submit lines for the ones a test cannot pin (sandbox copies get a fresh expiresAt, the daily
  cap key exists, the Gemini burn rate fits the cap, no model shuts down before Dec 17, the probe workflow is
  active and recent, December's Actions budget). The Firebase project section gains the lifecycle and TTL
  read-back lines.
  Source: review (judging-window audit).
  Verified: App Check token TTLs read back 3600 s on all four app configs; the Remote Config server template
  has no parameters; `bash scripts/ci-local.sh` exit 0.
- The clipReadings TTL policy was missing in production although the spec and LIMITS promise it: it is now
  enabled on `clipReadings.expiresAt` and declared in firestore.indexes.json as a field override, so the
  merge point 2 index deploy keeps it. `scripts/test_judging_window.py` (gates and ci-local) pins three
  values judging depends on: the lifecycle age cannot delete anything before 2026-12-16 (project created
  2026-11-17), the TTL is declared and the rules allow at least 30 days, and both probes retire only after
  2026-12-16.
  Source: review (BYT's stale-data finding; judging-window audit).
  Verified: the TTL test failed first (no override), now 3 tests pass; `gcloud firestore fields ttls update`
  exit 0, state CREATING (re-checked at merge point 2); `bash scripts/ci-local.sh` exit 0.
- ci-local: when the emulator suite fails, it now prints who holds this worktree's emulator ports
  (`scripts/emulator_config.py --who-holds`, lsof over the 10-port block) and still fails with exit 1.
  The iPhone app saw one WebChannel bind failure ("Address already in use") on its websocketPort right after the
  port wait said the block was free; the cause is not known yet, so this records evidence instead of
  hiding the flake with a retry or a longer timeout. A new test shows the wait already counts a socket held
  on the 0.0.0.0 wildcard as busy, so the wildcard is ruled out.
  Source: the iPhone app flake report (ledgered as a flake).
  Verified: the who-holds test failed first, now 10 emulator_config tests pass (the wildcard test passed at
  once, which is its finding); `bash scripts/ci-local.sh` exit 0.
- `scripts/media_probe.py` reads ops/storage with the site's public key and fails if the 30-day lifecycle rule
  is gone or the sweep is more than 2 hours stale (which also catches a dead scheduler).
  `.github/workflows/probe.yml` runs it and the App Check no-token check daily at 13:23 UTC on a pinned
  runner, credential-free; each step runs even if the other fails, and both scripts retire after 2026-12-17.
  Source: review (daily checks for two security defaults that can change silently).
  Verified: 3 probe tests written with the script pass; the live probe exits 1 today (ops/storage 403, rules
  not deployed yet), as it must until merge point 2; `bash scripts/ci-local.sh` exit 0.
- Storage health record: each 15-minute deleteIncidentMedia run also reads the bucket's lifecycle and writes
  `ops/storage` (lifecycleOk, the rule's age, a server time); a new rules match makes that one doc readable
  without sign-in and no ops doc writable, so a probe can check it with no credential.
  Source: review (a privacy check that fails if the lifecycle rule ever disappears).
  Verified: 3 emulator tests failed first (the lifecycle check cases, the ops/storage write, the public-read
  rule), now pass; suite 104; `bash scripts/ci-local.sh` exit 0.
- `scripts/appcheck_control.py`: a live App Check control for Firebase AI Logic on the deployed project. A
  raw generateContent call with no App Check token must be refused with 401 "Firebase App Check token is
  invalid."; only then is a debug-token call made, which must answer 200. Evidence goes to
  docs/evidence/appcheck-control/ with every key and token redacted. `--no-token-only` is the credential-free
  daily half (config from the site's /__/firebase/init.json, no model call) and retires itself after
  2026-12-17. Firebase's documented automatic App Check enforcement for AI Logic did not happen on a project
  created 2026-11-17, so this control proves the manual enforcement is still on.
  Source: review (a finding upstream, gap SA:86).
  Verified: 5 tests failed first (no module), now pass; the live run gave 401 then 200 (evidence
  2026-11-18T08-55-34+00-00.json, 0 key matches in it and in the logs); the App Check API reads
  firebaseml ENFORCED since 2026-11-17T18:32Z; `bash scripts/ci-local.sh` exit 0.
- `deleteIncidentMedia` (scheduled every 15 minutes, us-central1, one instance, no model call) deletes every
  clip, photo and pack of each judge sandbox whose expiresAt has passed and stamps mediaDeletedAt once; it
  re-checks all ended sandboxes each run, so an upload in flight at the end is caught next time. Drills, live
  sandboxes and look-alike prefixes (J1 vs J10) are left alone. Deleting the file is what ends a member's
  no-sign-in download link (docs/LIMITS.md). Not deployed yet: it deploys with the rules at merge point 2,
  and LIMITS stays PLANNED until the deploy is read back.
  Source: rules audit 2026-11-18, finding (c); review go (build now, not with Task 23).
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
  Source: rules audit 2026-11-18 (two minors folded into the fix, with review's go).
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
  Source: rules audit 2026-11-18 (a fresh audit with the Firebase rules-auditor checklist: events and
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
  Source: review (development prior for drill-dev-1; the same tool seeds Stephen's site later).
  Verified: 9 tests failed first (no module), now pass; `bash scripts/ci-local.sh` exit 0.
- Grid builder `--prior <grid.json> --ipp <lat,lon> --terrain <...> [--linear] [--bearing <deg>] --out <file>`
  writes the segment docs the apps read under incidents/{id}/segments: one per segment (geometry as a GeoJSON
  string, centroid, area, neighbours, stream links, nearFrac, feature classes) with the engine's own
  `buildPrior` result, ROW last with the mass outside the mapped area, plus the inputs (gridId, ipp, terrain,
  layers, bearing, attribution). A malformed IPP or an unknown terrain prints usage and exits 2.
  Source: review (seed a development prior so the map, replan and POA beats run against deployed data).
  Verified: 4 new tests failed first (no module), now 18 grid-builder tests pass (one doc per segment and ROW
  last; the prior sums to 1 within 1e-12; cells wholly inside the 300 m first ring have equal mass per m2 and
  the far corner cell less than half); typecheck exits 0; `bash scripts/ci-local.sh` exit 0.
- `ci-local.sh` builds the web app with CI's placeholder config (the same values as web.yml) into a temp folder,
  so every branch can run the web step without a web/.env.local, and no worktree's real web/dist (built from its
  .env.local and deployed from there) is overwritten. Vite lets variables already in the environment beat .env
  files, which is why the output folder moves too.
  Source: the iPhone app's ci-local stopped at "Missing build config" after merging main.
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
  Source: plan Task 37a; built on a separate branch, then reviewed.
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
  Source: plan Task 37a; built on a separate branch, then reviewed.
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
  Source: plan Task 37a; built on a separate branch from a written spec, reviewed against the
  spec line by line.
  Verified: the 10 engine tests failed first (missing API), then pass: straight road 25.33 percent stop
  within 300 m and ROW 4.79 percent (seed 1), fork stream share 0.6641 (seed 2), wedge 0.8360 (seed 3),
  attractor 0.5956 (seed 4), low mobility max 2,400 m and ROW 0 (seed 5), all 10,000 walkers and inside
  the plan's tolerances; engine suite 177 passed; `bash scripts/ci-local.sh` exit 0 on the series head.
- Merge point 1, the command post: merge main into the web branch. The only conflict was
  `package-lock.json` (the web branch added the web workspace, main added tools/grid-builder and moved the functions
  test toolchain to the root). npm's own conflict resolver crashed (arborist "edgesOut"), so the lockfile was
  merged as JSON three ways from the merge base 2bc711c: no key changed on both sides; every entry from both
  parents kept its version.
  Verified: `npm ci` accepts the merged lock; `bash scripts/ci-local.sh` exit 0 in the integration worktree with
  CI's placeholder web config (166 engine, 134 vector, 85 emulator and 211 web tests; web build).
- Widen the platform workflows now that every app is on main (merge point 1): Swift core also runs when
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
  Source: the command post's live command post finding; the joinIncident deploy.
  Verified: `gcloud storage buckets update --cors-file` exit 0; the bucket's cors_config read back equals the
  file (it was empty before). An unauthenticated request cannot prove it (error responses carry `*` for any
  origin), so the command post's authorized live read is the proof. `bash scripts/ci-local.sh` exit 0.
- `scripts/emulator_config.py --wait-ports SECONDS` waits, bounded, until every port in this worktree's emulator
  block can be bound on 127.0.0.1 and ::1, and exits 1 naming the busy ports when the time runs out.
  `ci-local.sh` runs it (180 s) before the emulator suite, because a socket left from the previous run made the
  Firestore WebChannel server fail to bind ("Address already in use"). Local only: a CI runner starts clean.
  Source: the command post's ci-local finding (two failed runs, back to back, on its own block).
  Verified: 3 new tests (free block passes at once; a held port fails and is named; a port released after
  1.5 s passes after waiting) failed first, now 8 of 8 pass; `bash scripts/ci-local.sh` exit 0.
- Every workflow (CI, Engine, web; Swift core, Android and Rules already did) now runs only on pull requests
  to main and on pushes to main, never on feature branch pushes; pushes to one pull request cancel each other.
  Each branch verifies each commit with `bash scripts/ci-local.sh` and records its bare exit code in its changelog
  entry; CI verifies each branch once at each merge point through one pull request. This entry's own commit
  and the one before it are pushed together, so CI runs for the head SHA only.
  Source: review, after the Actions budget was reached (300 runs today); Stephen set the November
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
- The `android` job counts the Android unit tests after the Gradle run (`android/count-tests.py`, the Android app's
  standard-library script): it fails on zero tests, on fewer than 150, or on any failure, error or skip, so
  the job log proves the tests ran. Mirrored in `ci-local.sh` inside the android guard. The job only runs
  once android/ is on main or on a pull request that carries it.
  Source: review request via the Android app (the Android app measured 181 tests; empty, missing, failing and --min 500
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
  Source: plan Task 35a; spec sections 10.4, 13.2 and 13.3. The command post (web form) and the iPhone app (iOS card) build on it.
  Verified: the 11 new tests failed first (no module), now 166 engine tests pass; typecheck and lint exit 0;
  the shared keys match the rules' profile/shared allowlist; ci-local exits 0. The plan's device check
  (step 5) is the iPhone app's.
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
  the web, iOS and Android branches; ci-local exits 0.
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
  are marked pending until the iPhone app builds them). The check found and this commit fixes a real drift:
  `sdk_fallback` was in route-record.schema.json but not in the TS RouteReason type.
  Source: fresh-context review I5.
  Verified: 4 new parity tests failed first (enum alias, inline union, missing file with root, real repo),
  now 15 pass; dry runs against the iOS, Android and web branches: 0 failures; ci-local exits 0.
- Clip readings are written before the upload and the model call (decision I9): `clipReadings/{sha256}` is
  created by command or family with exactly the spec section 7 fields plus `createdByUid`, the three required
  consents (person in clip, footage owner, cloud processing; each `{byUid, atMs}` recorded by the writer),
  `publicUse` null or a consent, `reading` and `route` null, a timestamp `expiresAt` and a server
  `createdAt`; only its creator may then add `reading` and `route`, once, with the consents untouched.
  Storage refuses a clip upload unless the uploader's own clip reading with those consents exists.
  Source: review I9 (the Android app found a clip could be uploaded and never read, with no consent record).
  Verified: 3 new tests (create needs the consents and no reading; one creator-only update; upload needs the
  uploader's own reading) failed first, now 84 emulator tests pass; ci-local exits 0.
- A camera_sighting event carries its clip reference in `reading` (new schema def CameraSightingReading,
  TS type of the same name): the model's CameraSighting, `clipSha256`, `clipStartMs`, `clockConfirmed`
  and `cameraFacingDeg` (one of the 8 compass headings, or null when the family set no facing). The rules
  check that exact shape and that `clipReadings/{clipSha256}` exists. Command places and confirms the
  sighting from it; no extra event field is added.
  Source: review I10 (the Android app found the camera sighting had no link to its clip reading).
  Verified: 2 new tests (valid readings accepted; null reading, unknown clip, bad hash, 10-degree facing,
  text clock flag, extra key, missing parts and a text sighting refused) failed first (1 of 2), now 81
  emulator tests pass; schema parity checks 14 TS types (0 failures); typecheck and ci-local exit 0.
- The App Check test now sends a valid Auth emulator ID token and varies only the App Check header (none,
  and a bad token): both get 401 with the wrapper's "Unauthenticated" message, never the handler's sign-in
  message, and no claims are set. A control sends the same request through a callable built without
  enforcement and gets 200 with the family claims, so the 401 can only come from App Check.
  Source: adversarial review M8 and the fresh-context review I4 (the old test sent no Auth token
  either, so it passed with enforcement off).
  Verified: with `enforceAppCheck: false` in functions/src/index.ts the new test fails (1 of 19 join tests),
  restored it passes; 79 emulator tests pass; ci-local exits 0.
- joinIncident hardening: a code must be 8 Crockford symbols after normalization (refused before any
  read); each caller spends one attempt from an atomic budget of 10 per rolling hour before the lookup
  (`joinAttempts/{uid}`, admin only; the 11th call is refused even with the right code); every failed join,
  including an unknown team, gets the same permission-denied message; an invite may carry `expiresAt` and
  `maxUses`, with uses counted in a transaction. Test fixture codes no longer use I, L, O or U.
  Source: adversarial review M7.
  Verified: 3 new tests (one refusal for unknown team and wrong code, the attempt budget with a second
  caller unaffected, invite expiry and single use) failed first, now 78 emulator tests pass; functions
  typecheck exits 0; ci-local exits 0.
- `docs/LIMITS.md` gains a media retention section: expiry locks a judge sandbox's media at once through
  the rules; deleting the stored objects at expiry (`deleteIncidentMedia`, Task 23) and the 30-day drill
  lifecycle file (Task 18) are marked PLANNED, not built; no app uses Storage download URLs.
  Source: adversarial review round 3, item 2 (the function itself lands with Task 23 and its tests).
  Verified: wording checked against the repo (no deleteIncidentMedia or storage.lifecycle.json yet);
  ci-local exits 0.
- Rules gate bans Storage token URLs (`getDownloadURL`, `downloadURL`, `downloadUrl`) in web/, ios/ and
  android/ code: a download URL carries a token that bypasses Storage rules, so a URL saved before a judge
  sandbox expires would keep serving its clip. Client reads go through getBytes/getBlob, which evaluate the
  rules. Docs may name the calls.
  Source: adversarial review round 3 (MEDIUM), items 1 and 3.
  Verified: the new gate test failed first, now 18 gate tests pass; the gate is clean on main and a grep
  finds 0 uses on the iOS, web and Android branches; ci-local exits 0.
- Clips and photos are create-only at their hash names: `clips/{incidentId}/{sha256}.mp4` and
  `photos/{incidentId}/{sha256}.jpg` must match a lowercase 64-hex name with the right extension, and no
  object may already exist there (`resource == null`; the emulator allowed an overwrite under the create
  rule alone). A cached reading or consent record tied to a hash can no longer point at replaced bytes.
  Rules cannot hash the bytes, so the reader checks the SHA-256 of what it reads (Task 18). Storage tests
  clear the bucket before each test.
  Source: adversarial review M6.
  Verified: 2 new tests (replacing a clip and a photo refused; four bad clip names and a .png photo
  refused) failed first, then the overwrite case still passed until `resource == null` was added; now 75
  emulator tests pass; ci-local exits 0.
- Packs are per team: the pack record `packs/{teamId}` and the bundle are readable by command and by that
  team only. Bundles move to `packs/{incidentId}/{teamId}/v{n}.bundle` (the spec's `{teamId}-v{n}.bundle`
  file name could not be matched by team in Storage rules); the pack function (Task 12) writes this path.
  Source: adversarial review M5.
  Verified: 2 new tests (another team's record and bundle refused, own team and command allowed, family
  refused) failed first, now 73 emulator tests pass; ci-local exits 0.
- Profile documents take only their own fields: `profile/shared` (readable by every member and carried in
  packs) accepts only the 20 shared fields of spec section 13.2, with the 18 flag names as booleans, free
  text at most 200 characters and at most 40 approach note ids; `profile/command` accepts only its 5 fields.
  A field-mapping slip can no longer put previous addresses, places, past wandering, water, vehicle or
  medication text where searchers read it.
  Source: adversarial review M4; fresh-context review minor 4.
  Verified: 2 new tests (9 leaking writes to shared and 2 to command refused, valid writes accepted) failed
  first, now 71 emulator tests pass; ci-local exits 0.
- Add the `web` CI job (`.github/workflows/web.yml`, the command post's snippet): npm ci, web typecheck, Vitest, and a
  Vite build with placeholder config (no real value in the repo; the build refuses to run without config).
  Runs on every branch push touching web/**; until web/ is on main that is its only trigger (widen to
  shared/**, the lockfile and the workflow at the the command post merge). Mirrored in `ci-local.sh` behind a
  web/package.json guard.
  Source: review (the command post's 112 unit tests, tsc and build never ran in CI); the command post handover.
  Verified: action SHAs are the ones already pinned in engine.yml; `bash scripts/ci-local.sh` exits 0 here
  (web skipped on main). First run expected on the next web branch push.
- Give the emulator step a per-worktree TMPDIR (`scripts/emulator_config.py --tmpdir`). The Storage
  emulator keeps uploaded blobs under $TMPDIR/firebase, which was shared by every worktree, so another
  worktree's run starting or stopping its Storage emulator deleted blobs mid-upload (ENOENT, 30 s timeouts).
  Source: the command post report of two storage test timeouts during a parallel run.
  Verified: the new test failed first, now 5 emulator-config tests pass; the suite wrote its `firebase`
  folder into the per-worktree temp dir and passed 69; ci-local exits 0.
- README and NOTICE no longer name `shared/grid/`, which does not exist yet: they say the drill-site map
  data, when added with the site grid, is ODbL with its own README. Task 10's data commit adds the folder.
  Source: review sweep (a README path that does not exist is a checkable claim).
  Verified: `grep -n shared/grid README.md NOTICE` finds nothing; ci-local exits 0.
- Incident lifecycle is server-owned: no client creates an incident; command may edit an open incident but
  never `mode` or `expiresAt` (a judge sandbox cannot be extended or a drill relabelled), and closing is final
  (no reopen, no edit). A judge sandbox must carry a timestamp `expiresAt` in the future for every member
  read and write (Firestore and Storage rules) and for joinIncident; other incidents may have none.
  Source: review M3, the fresh-context review I1 and the C1 re-review item 2.
  Verified: 5 new tests (rules: no mode or expiry change, no reopen, judge without a timestamp locked out;
  storage: judge upload needs a future expiry; join: judge needs a future expiry) failed first, now 69
  emulator tests pass; ci-local exits 0.
- The seeding tool draws all three role codes and checks they are distinct (drawing again if not) before
  any Keychain entry or Firestore doc is written.
  Source: re-review of the C1 fix.
  Verified: the new test (a forced collision on the first draw) failed first, now 6 seed tests pass;
  ci-local exits 0.
- Run the rules suite under a per-worktree demo project id (`demo-pls-` + 8 hex of the worktree path, from
  `scripts/emulator_config.py --project-id`); test helpers read it from GCLOUD_PROJECT. Separate ports alone
  still let the emulator hub report "running multiple instances of the emulator suite for project demo-pls"
  when two worktrees ran at once.
  Source: the iPhone app report from its ci-local runs.
  Verified: the new test failed first, now 4 emulator-config tests pass; the suite ran as demo-pls-68ccce04
  and passed 63; ci-local exits 0.
- joinIncident tests that fail on the pre-fix handler: a legacy two-role code doc grants neither role, with
  claims checked unchanged after each refusal; the cross-incident test now uses I1's command code with the
  right role against another OPEN incident (I2), so only the incident comparison can refuse it.
  Source: re-review of the C1 fix (only one new test failed on the old code; the cross-incident test
  stopped at the role check).
  Verified: with join.ts from 6c4dc21 (the parent of 406f97f) swapped in, 2 of 14 join tests fail (both
  legacy-doc tests); on HEAD all 63 emulator tests pass; ci-local exits 0.
- Firestore rules recompute every event's id: `eventIdOf(incidentId, request.auth.uid, seq)` with the same
  text framing as the engines (hashing.sha256 over decimal byte length, ":" and value per field) must start
  the document id, and seq must be a whole number of 0 or more. A member can no longer occupy another
  device's future event id, and an id derived from another seq, device or incident is refused. Event tests
  now write every event at its derived id (fixtures compute it independently with node:crypto).
  Source: adversarial review H1 and the fresh-context review I2 (the earlier deviceId binding alone did
  not stop squatting; the 2026-11-18 rules entry above overstated it).
  Verified: the 3 new H1 tests failed first (squatting at a victim's seq-5 id succeeded), now 62 emulator
  tests pass; ci-local exits 0.
- Detection range is measured-first: the team's measured visual range sets the sweep width, and a stated
  (model-read) range is used only when the team has no measurement (`rdBasis` "stated"). Spec 10.4: "Sweep
  width always uses the visual detection range." A model-read number can no longer raise POD above a
  hidden-target measurement. Reference, vectors (160; new cases measured_range_beats_stated and
  stated_range_used_without_measurement replace stated_detection_range_basis_stated), README and the TS
  engine in one commit (vectors alone would turn the Engine job red).
  Source: fresh-context review; the decision was sent for review and reversed.
  Verified: the new anchor failed first, now 14 generator tests pass; the TS vector case failed first, now
  155 engine tests pass; typecheck and lint exit 0.
- Change the eventId framing so the security rules can recompute it: SHA-256 over the UTF-8 string made of,
  per field (incidentId, deviceId, decimal seq), the decimal UTF-8 byte length, ":" and the value (example:
  ("ab", "c", 1) hashes "2:ab1:c1:1"); first 32 lowercase hex characters. eventSetHash and convergenceCode
  keep their binary framing. Reference generator, regenerated vectors (159; ids now include an epoch-ms seq
  case; the ("ab","c") vs ("a","bc") pair and the UTF-8 byte-length case stay), README and the TS engine
  change in ONE commit, because the vectors alone would turn the Engine job red on their own SHA.
  Source: adversarial review H1 (a member could occupy another device's future event id), option 1
  approved in review after an emulator probe showed rules can compute hashing.sha256 over this
  string; recorded in the design's decisions. The Swift and Kotlin twins follow against this SHA.
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
  Source: adversarial review H2 (engine side) and the fresh-context review I3; the Swift and Kotlin
  twins must mirror this (relayed in review).
  Verified: the TS vector suite failed first on the new cases (6 cases plus the count check; one threw on
  `eff.inputs.coverage`), now 153 engine tests pass; generator anchors 12 pass; typecheck and lint exit 0.
- Firestore rules validate each stored effect variant (spec section 8): cleared needs exactly kind, segmentId
  (1 to 16 chars), pod (0 to 1) and inputs with exactly coverage (>= 0), sweepWidthM and trackLengthM (null or
  >= 0), areaM2 (> 0) and a known rdBasis; clue needs 1 to 64 influences with known values and a known
  authenticity; none needs a known reason and nothing else. Every other device applies a stored effect
  without re-deriving it, so a malformed one must never be stored.
  Source: adversarial review H2 (rules side), verified in review.
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
  Source: plan addendum (the name search line); searches run in review.
  Verified: text matches the recorded search results; `bash scripts/ci-local.sh` exits 0.
- Add `docs/LIMITS.md` and `docs/PRODUCTION-CHECKLIST.md`, starting with the Android release rule: only the
  Play Integrity release APK is published, and `android/scan-apk.sh` must report 0 debug-token, token-resource,
  FIREBASE_APPCHECK_DEBUG_TOKEN and debug-provider hits on the exact signed APK (the debug APK reports 5).
  Source: the Android app handover.
  Verified: text matches the handover; no dashes or curly quotes; `bash scripts/ci-local.sh` exits 0.
- Run the seeding tool's tests in the `gates` job and in `ci-local.sh`.
  Source: CI mirrors every test suite in the repo.
  Verified: `bash scripts/ci-local.sh` exits 0 with the 5 seed tests in the gates pytest run.
- Add `tools/seed/seed_drill.py` (standard library plus the gcloud token): creates one synthetic training-drill
  incident (mode "drill", labelled "Training drill. Nobody is missing.", engine params copied from the
  constants), its teams, and the two admin-only join code docs (team code for searchers and family, separate
  command code). Codes are 8 Crockford symbols from `secrets`, stored only in the macOS Keychain, never
  printed; every write is create-only. Tests in `tools/seed/test_seed_drill.py`.
  Source: review go for one drill incident (the Android app end-to-end test); plan Task 11 join design.
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
  Source: plan Task 11 step 4; CI-minutes decision.
  Verified: `bash scripts/ci-local.sh` exits 0 with the emulator suite (48 tests); action SHAs re-read with gh
  (cache v6.1.0 55cc834; checkout, setup-node, setup-java as already pinned).
  Correction to the joinIncident entry above: the join suite has 11 tests, not 14 (37 rules + 11 join = 48).
- Add the `joinIncident` callable (`functions/src/{join,index}.ts`, App Check enforced, us-central1) and its
  tests (`functions/test/join.test.ts`): request {incidentId?, joinCode, role, teamId?}, response
  {ok: true, incidentId}; codes normalized (case, spaces, hyphens) and looked up by SHA-256 in the admin-only
  joinCodes collection; the team code admits searchers and family, command has its own code; a searcher must
  name an existing team; closed or expired incidents and mismatched incident ids are refused with one
  message; claims set to {inc, role, team} (team null for command and family). No model call in any function.
  Source: plan Task 11; spec sections 7 and 14; the Android app contract question 1 (code-only join).
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
  Source: plan Task 8; spec sections 8, 10.1 to 10.4; design byte layouts for eventSetHash and convergenceCode.
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
  5.1.0 (same as the command post), @types/node 22.20.5. Strict TypeScript with noUncheckedIndexedAccess.
  Source: plan Task 8 (TypeScript engine).
  Verified: Socket scores for all four (supply chain 98 to 100, vulnerability 100); `npm install` exit 0;
  `npm audit --omit=dev` finds 0; the 5 dev-only highs are one picomatch ReDoS via vite/vitest globs we
  control (accepted, same toolchain as the command post). `bash scripts/ci-local.sh` exits 0.
- Add the `android` CI job (`.github/workflows/android.yml`): the Android app's snippet, Temurin 21,
  `./gradlew --no-daemon testDebugUnitTest assembleDebug`, on pull requests to main and on main only,
  triggered by `android/**` until android/ is on main (then widen to shared/**). Mirrored in `ci-local.sh`.
  Source: plan Task 19a; the Android app handover; CI-minutes decision.
  Verified: action SHAs re-read with gh (setup-java v6.3.0 d1374f8, setup-gradle v6.4.1 8da46b5, both latest);
  `bash scripts/ci-local.sh` exits 0 (android skipped on main). The Android app reports the gradle command green locally.
- Narrow the `swift-core` trigger to `ios/PLSCore/**` until the iPhone app's package is on main. With the shared
  paths, the next vector or constants change on main would have started a job with no package and failed.
  Widen to shared/test-vectors/** and shared/constants/** after the the iPhone app merge.
  Source: self-review of a695a9c (same trap the workflow's own path had).
  Verified: `git diff` shows only the path list and comment; `bash scripts/ci-local.sh` exits 0.
- Add the `swift-core` CI job (`.github/workflows/swift.yml`): `swift test --package-path ios/PLSCore` in
  `swift:6.4.2-noble` pinned by index digest, on pull requests to main and on main only, path-filtered to
  ios/PLSCore, shared/test-vectors and shared/constants (not its own path, so it cannot run before
  ios/PLSCore lands). `ci-local.sh` runs it when ios/PLSCore exists.
  Source: plan Task 9a; CI-minutes decision (expensive suites on PR to main and main only).
  Verified: tag resolved with `docker buildx imagetools inspect swift:6.4.2-noble`; checkout SHA reused from
  ci.yml; the iPhone app reports the same suite green in swift 6.4.2 on Linux; `bash scripts/ci-local.sh` exits 0 here.
- Point the schema parity map at the Android app's Kotlin files: `data/EventDoc.kt` (EventDoc, RouteRecord),
  `core/CameraSighting.kt` (CameraSighting), `data/Profiles.kt` (SharedProfile, CommandProfile); drop the
  Android mapping for ReportReading (no Kotlin type planned).
  Source: the Android app contract question 7.
  Verified: parity dry run against the Android branch: CameraSighting, RouteRecord and both profiles pass;
  EventDoc reports missing schemaVersion and serverTime (the Android app to add). Main has no android/ yet, so
  `bash scripts/ci-local.sh` exits 0.
- Add route reason `sdk_fallback` to `shared/schemas/route-record.schema.json` (PREFER_ON_DEVICE answered from the cloud).
  Source: the Android app contract question 3 (Android RouteRecord reasons); the Android app maps its other reasons to
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
