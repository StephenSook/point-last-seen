# iOS changelog

This changelog covers `ios/`. Each commit adds one entry here: what changed, its source (plan task or
finding) and how it was verified. Newest first.

## 2026-11-20

### fix(ios): Apple's answer is capped, and a capped read says so
- What: on the simulator, reads our code had timed out kept Apple's model busy, and the reads after them
  queued (a one-line prompt took 30 s). Apple's answer is now capped at 512 tokens
  (GenerationOptions.maximumResponseTokens), so a read that runs away ends in seconds. The cap comes from
  the longest valid reading: SystemLanguageModel.tokenCount on the JSON of a reading with every field set
  and a 934-character quote measured 323 tokens (a typical reading, 117); the rest is room for tool calls.
  Hitting the cap throws LanguageModelError.unsupportedTranscriptContent ("The model produced an empty
  response."), which now maps to a new empty_response failure: it falls to rules with the stage note
  "guided on_device: empty_response". Our timeout already cancels the call; a test now pins that.
- Source: review (simulator eval after the no-fix change: four reads hit the 90 s limit).
- Verified: tests for the cap, the mapping, the routing and the stage note failed to compile before the
  change and pass after; a test pins that a timed-out call is cancelled; 370 core and 197 app tests pass.

### fix(ios-core): a mark Apple's model adds to the end of its quote is dropped
- What: Apple's model quoted "Found a shoe on the path in segment BP." for a report with no period, and
  its reading was rejected. For Apple's model, at most one trailing . , ! or ? is now dropped from the
  quote, and only when the quote is not in the report as it is and what is left is, exactly. A report
  that has the mark keeps it in the quote. The validator is unchanged; code never writes a quote.
- Source: review (simulator eval).
- Verified: tests that a quote with an added period, comma, exclamation or question mark is accepted
  failed before the change and pass after; tests pin that a quote still not in the report stays rejected,
  that only one mark is dropped, and that a report with the period keeps it; all core tests pass.

### fix(ios): with no GPS fix, Apple's model gets no segmentHere tool
- What: with no GPS fix the segmentHere tool's only answer was "No GPS fix. Do not guess a segment.", and
  Apple's model quoted that sentence as the report, so its reading was rejected. With no fix, Apple's
  model now gets no segmentHere tool, and its instructions say in plain words that the phone has no GPS
  fix, so where the team is standing is not known. With a fix nothing changes. The cloud keeps its three
  tools and its prompt. The validator is unchanged: a quote of tool text stays rejected.
- Source: review (simulator eval: "Not sure where we are, the radio is weak" was quoted as the tool's
  sentence).
- Verified: a test that a no-fix read never offers the tool and gets the no-fix instructions failed to
  compile before the change and passes after; a test pins that a quote of tool text stays rejected;
  196 app tests and all core tests pass.

### fix(ios-core): a zero from Apple's model means the number was not stated
- What: Apple's model fills minutes, searchers and detection range with 0 when the report never states
  them, and the reading was then rejected for out-of-range numbers. Before validation, a 0 from Apple's
  model in those three fields is read as not stated. Coverage keeps its 0, which a report can state. The
  validator is unchanged; any other out-of-range number is still rejected, and the cloud model's numbers
  are not changed.
- Source: review (simulator eval: "Cleared segment BO, nothing found." came back with zeros).
- Verified: a test that a reading with zeros is accepted with those fields not stated failed before the
  change and passes after; tests pin that a negative number and a cloud zero stay rejected; all 362 core
  tests pass.

### fix(ios): Apple's model reads with greedy sampling
- What: Apple's model on the phone (the guided read and the plain-text read) now runs with
  GenerationOptions(samplingMode: .greedy), so the same report gets the same answer every time instead
  of a different one from each run's sampling. The cloud read is unchanged.
- Source: review (simulator eval: the route check's sentence was accepted in one run and rejected in
  the next).
- Verified: a test pins the on-device options to greedy sampling; it failed to compile before the change
  and passes after; 195 app tests pass. The two-run stability eval follows in the PR.

### fix(ios): Apple's model is told its quote may not be empty
- What: the on-device instructions now say "Copy evidenceQuote word for word from the report; never
  leave it empty." The cloud instructions and the cloud allow-list are unchanged.
- Source: review (Apple's model left the quote empty on the simulator).
- Verified: a test pins the line in the on-device prompt and its absence from the cloud prompt; it failed
  before the change and passes after; 194 app tests pass.

### fix(ios-core): Apple's model gets one more try when only its quote is rejected
- What: on the phone, Apple's model answered the route check's sentence in about 3 s but its reading
  was rejected for quote_not_in_text; on the simulator the same sentence came back once with the quote
  verbatim and once with an empty quote. A guided read on the phone that is rejected only for its quote
  is now asked once more; a second rejection falls to rules as before. The validator is unchanged and
  code never fills a quote. The stage note says what the quote was ("(quote empty)", or the quote cut to
  60 characters); notes stay in the read outcome and the drill's route-check file, never the event.
- Source: review (phone route check on build 6: guided on_device invalid quote_not_in_text).
- Verified: tests that an empty quote then a valid answer is accepted on the second try, that two empty
  quotes fall to rules, and that any other invalid answer is not asked again; the first two failed
  before the change and pass after; all 359 core tests pass.

### docs: the eval's on-device arm is Apple's model through the app's own reader
- What: docs/evidence/eval/README.md said the iPhone's on-device arm ran through "Firebase AI Logic
  hybrid routing". It doesn't: the app's own reader calls Apple's on-device model (Foundation Models,
  ios/PLS/AI/ModelSessionFactory.swift), and only the cloud route goes through Firebase AI Logic
  (geminiLanguageModel). The line now says so.
- Source: review (claims audit).
- Verified: read against ModelSessionFactory.swift; no other "hybrid" claim in the eval README.

### fix(ios): Apple's model reads the report alone, without the subject's description
- What: on the phone, Apple's model got the subjectDescription tool and an instruction to compare the
  report with it, and it copied the description into readings: a quote from the description
  ("Clothing last worn: blue coat.") that the validator rejected, and the description's colours.
  The on-device guided read now gets only the segmentHere and teamAssignment tools and its own
  instructions (PromptText.onDeviceGuided: "Set matchesProfile to unknown."); code decides the match.
  Its token count uses the same prompt and tools. The cloud read is unchanged: same tools, same prompt,
  same allow-list.
- Source: review (Apple's model not used on a real iPhone; simulator probe showed the leak).
- Verified: tests that Apple's model gets no description tool or comparison instruction while the cloud
  prompt keeps it, and that the reader hands the description to code (an on-device answer of
  "inconsistent" becomes "consistent" for a matching colour); they failed to compile before the change
  and pass after; 356 core and 193 app tests pass.

### feat(ios-core): code decides whether a reading by Apple's model matches the subject
- What: ProfileMatch.decide compares a reading's colours and item, footwear and carried words with
  the subject's description: consistent when one of them is in it, otherwise unknown, so a clue is
  never marked down on a guess. For a reading by Apple's model the read sets matchesProfile
  this way (ReadContext.profile carries the description); the cloud's answer is kept as it is.
- Source: review (Apple's model copied the subject's description into readings).
- Verified: tests for consistent and unknown matches, for the on-device override (and the cloud
  answer kept), and that an answer quoting the description is rejected with quote_not_in_text; they
  failed to compile before the change and pass after; all 356 core tests pass.

### feat(ios): the route check file says why each model stage was not used
- What: each route in the saved route-check file carries the read's stage notes, so a route check
  run on a real iPhone names why Apple's model's answer was not used (for example "guided on_device:
  invalid quote_not_in_text"). The screen is unchanged.
- Source: review (Apple's model not used on a real iPhone).
- Verified: the app builds and all 191 app tests pass; the file is checked on the phone with build 6.

### feat(ios-core): a read records why each model stage was not used
- What: ReadOutcome.stageNotes lists, in order, why each model stage did not give the reading: an
  answer the validator rejected ("guided on_device: invalid quote_not_in_text"), a stage that ran
  out of time ("guided on_device: timed out after 20 s"), a failure the runner reported
  ("guided on_device: guardrail_block") and a plain-text line that could not be read ("permissive
  on_device: unparsed"). It is empty when the first stage answered. It is never stored in the event;
  routing and readings are unchanged.
- Source: review (Apple's model not used on a real iPhone: the route check must say why).
- Verified: tests for a rejected answer, a timed-out stage, an unreadable plain-text line and an
  answered read; they failed to compile before the change and pass after; all 352 core tests pass.

### fix(ios): a decimal pair after a "+" is a phone number, not a coordinate
- What: per the shared ruling, a decimal pair that starts with "+" is an international number:
  "Call +44.2071, -23.4567" is removed. "GPS 33.7490, -84.3880" and a southern latitude
  ("GPS -33.8688, 151.2093") still stay.
- Source: review (shared ruling: plus before a decimal pair).
- Verified: a test failed before the change and passes after; the shared vectors pass, also with the
  plus case's iPhone pending mark removed.

### fix(ios): a month and day with no year stays beside a phone number
- What: a month and day with no year ("11/19", or "19/11"), two groups joined by a slash, is a date
  span like a full date: "Seen 11/19 555-0142" now gives "Seen 11/19 [number removed]" instead of
  removing the date with the number. Joined to more digits by its own slash it is not a date, so
  "404/555/0142" and "13/45 555 0142" are still removed whole.
- Source: review (shared ruling: a date beside a phone number stays).
- Verified: a test of the month/day cases failed before the change and passes after; the shared
  vectors pass, also with the short-date case's iPhone pending mark removed; all core tests pass.

### fix(ios): a grouped count of seven or more digits is a phone number
- What: per the shared ruling (privacy wins ties), "Call 4,045,550,142" and the same number in Adlam
  digits are removed. A grouped count with three or more groups always has seven or more digits, so
  the grouped-count exception could never hold under the ruling and is gone from the rule. "walked
  12,345 steps" still stays; "walked 1,234,567 steps" is now removed.
- Source: review (shared phone-number vectors: grouped counts).
- Verified: the updated tests failed on the old rule and pass with the change; the shared vectors with
  the two iPhone pending marks removed pass; all 346 core tests pass.

### test(ios): the phone-number vectors' no-digit check covers every script's number characters
- What: the shared contract's "no digit left" check now means any Unicode number character (Nd, Nl,
  No), not only 0 to 9. The Swift vector runner checks the scrubbed text's every scalar for those
  categories.
- Source: review (shared phone-number vector contract).
- Verified: main's vector file and the coming vector update both pass with the wider check.

### fix(ios): no phone number hides behind something shaped like search information
- What: the iPhone's phone-number rule now matches the Android rule after its review rounds. Search
  information (a written date, a time, a coordinate pair, a grouped count, a ZIP+4 code, a month-name
  date, a number with a unit) is found on the text as written, and stays only when the rest of its
  run is nothing or whole numbers of seven or more digits; when a piece of 1 to 6 digits is left
  beside it, the whole run is removed. Coordinates must be in range with 4 to 8 decimals (so
  "call 555.1234, 555.6789" is no longer kept as a pair), a ZIP+4 needs a capital state code before
  it, a date joined to more digits by its own separator is not a date, and two dates that share a
  group cancel. A 7+ digit number with a unit is still a number; "double" and "triple" count their
  repeats; a line break with indentation is one separator, and a removed run keeps its line breaks.
  A word stops at a numeral.
- Source: review (Android phone-number rule, later commits; parity with the iPhone).
- Verified: the Android rule's test cases, ported to Swift, failed before the change and pass after
  (with Android main's current expectations); the shared phone-number vectors and all 345 core tests
  and 191 app tests pass.

### fix(ios): the language refusal says the note is not sent to the cloud, not that it stays
- What: the line under a refused report said the note "stays on this phone", but the screen only
  refuses the cloud read: the report, picked or typed, still goes to command. It now says "This note
  doesn't look like English, so it isn't sent to the cloud to be read. Pick instead of typing."
- Source: review (copy ruling).
- Verified: the refusal-line test asserts the new sentence; it failed with the old code and passes
  with the change; no other iPhone text carries the old line.

### fix(ios): a removed phone number never makes a note look English to the language screen
- What: the language screen judged the note after its phone number was removed, and removing it adds
  the words "number removed", which diluted the non-Latin share: "Бабушка ушла 404-555-0142" and
  "奶奶的電話是 一二三四五六七" passed and could go to the cloud read. The read now screens the note
  as written and as cleaned, and goes to the cloud only when both look English.
- Source: review (the same defect found in the Android port).
- Verified: a test with both notes on the cloud route calls no cloud model and records not_english;
  it failed before the change and passes after; all 339 core tests and the app reader tests pass.

### feat(ios): the route check says each result in plain words
- What: the route check screen showed code names ("on_device: read on rules (deterministic_parser),
  model rules, 20692 ms, reason no_network"). Each line now reads like "On this iPhone, no signal:
  Read by rules, not a model. 20.7 s. Why: no signal. Read as cleared, segment BO." and "In the
  cloud: Suggested by Gemini in the cloud (gemini-3.5-flash-lite). 1.3 s. Why: Apple's model is not
  available. ...". Every route reason has plain words (EchoText.reasonWords, an exhaustive switch,
  so a new reason cannot ship without them). The saved file keeps the exact route record.
- Source: review (judge-facing screens; simulator walk-through of the route check).
- Verified: tests that every reason has words with no code names and that times show in seconds;
  they failed to compile before the change and pass after; the text-size scan and the route check
  tests pass.

### feat(ios): a note that does not look English never goes to the cloud read
- What: the language screen runs at the one point where the read dispatches to the cloud, so it covers
  the router's cloud route and the move to the cloud after Apple's model fails. A note that does not
  look English is read by the phone's rules instead, with route reason not_english, and the report
  says "This note doesn't look like English, so it stays on this phone. Pick instead of typing."
  Apple's on-device read and the pick list are unchanged. The app bundles
  shared/constants/language-words.json; if it cannot be read, no note goes to the cloud.
- Source: plan (language screen before any cloud read of a note); review (iPhone wording approved).
- Verified: tests that a Spanish note on the cloud route and after the on-device model fails calls no
  cloud model and reads by rules with reason not_english, that it still reads on this phone when
  Apple's model works, that an English note quoting Spanish still goes to the cloud, the app reader
  with the bundled word lists, and the refusal line. They failed to compile before the change and
  pass after; 327 core and 191 app tests pass.

### feat(ios-core): the language screen, by the shared rule and vectors
- What: PLSCore gains LanguageScreen.looksEnglish, built from shared/constants/language-words.json:
  the note is folded and split as the evidence screen does, words made only of digits are dropped,
  and a note does not look English when more than half its words are non-Latin, or when its foreign
  function words plus non-Latin words are at least minForeign and more than foreignOverEnglish times
  its English words. It is not yet called by the read; that follows.
- Source: plan (language screen before any cloud read of a note).
- Verified: shared/test-vectors/language.json runs in a Swift test: 18 mustAllow pass as English, 9
  mustRefuse do not, the 1 knownMiss passes as English as on every platform, and a new kind of case
  in the file fails the test. It failed to compile before the change; all 322 core tests pass.

### test(ios): run the phone-number vectors' exact cases, replacement token and pending marks
- What: the Swift vector runner reads the file's new shape: a top-level replacement token (checked
  against the one this phone writes), an exact array whose output is compared byte for byte, and an
  optional pendingOn on any case, which skips the case only when it names ios. The kind guard now
  allows these keys and also fails on an unknown key inside a case.
- Source: review (shared phone-number vectors gain exact-output cases).
- Verified: with the coming vector file (13 mustRemove, 14 mustKeep, 1 exact, none pending on ios)
  all 6 vector tests pass; a copy with a wrong exact output fails; a copy with an unknown kind fails;
  with main's file all 325 core tests pass.

### test(ios): fail when the phone-number vectors gain a kind of case the iPhone does not run
- What: the Swift vector test decoded only mustRemove and mustKeep and would ignore any new kind of
  case added to shared/test-vectors/phone-numbers.json. A new test asserts the file's top-level keys
  are exactly the ones the iPhone runs, so a new kind fails Swift core until it is run here.
- Source: review (shared phone-number vectors gain an exact-output case).
- Verified: run against a copy of the file with an extra "mustEqual" key it fails; against the real
  file it passes, with the other 18 phone-number tests.

### fix(ios): phone numbers by the shared rule: no date shields a number; search details stay
- What: the iPhone's phone-number rule now matches the Android rule. A date carved out of a longer run
  of digits no longer shields part of a number ("06.12.20.26.19", "404-555-2026-11-19" are removed);
  a date beside a whole number of its own still stays. Non-breaking, en and em dashes and the minus
  sign join a number's parts like a hyphen. Search information made of digits counts no digits, so
  it stays and never joins a number: a time (14:03), a coordinate pair (33.7490, -84.3880), a
  grouped count (1,234,567), a ZIP+4 code (30301-1234) and a month-name date (Nov 19 2026, 19 November
  2026); a number glued to a unit or an ordinal ending (67th, 5km) counts alone. Chinese numeral
  digits, a pasted line break and spoken digits in capitals were already caught; tests now pin them.
- Source: review (phone-number review of the Android rule; the same gaps were in the iPhone rule).
- Verified: tests for each case above; the date, dash, time and month-date, and search-information
  tests failed before the change and pass after; all 322 core tests pass.

### fix(ios): written dates stay in a report; a slash-joined phone number still goes
- What: a date is search information (when someone was last seen), not a phone number. The phone
  number rule now keeps three digit groups joined by the same one of / - . that read as a date:
  year-month-day with a 4-digit year from 1900 to 2100, or month and day in either order with a
  2-digit year or such a 4-digit year (day 1 to 31, month 1 to 12). A date's groups count no digits,
  so they never make or join a number. 11/19/2026, 2026-11-19, 19.11.2026 and 11-19-2026 now stay
  (11/19/2026 and 2026-11-19 were removed before); 404/555/0142, 404-555-0142, 13/45/2026 and
  5551-12-34 are still removed, and so is a number written next to a date.
- Source: review (dates are kept on every platform; shared vectors).
- Verified: a test of dates failed before the change and passes after; a test that date-shaped
  numbers are still removed passes before and after; the shared vectors with the four new mustKeep
  dates pass; all 315 core tests pass.

### fix(ios): a claims check or a report in flight never touches the practice drill
- What: three windows found in review. (1) A claims check already running when the drill started (at
  launch, back in the foreground, back in signal, or from a tapped push) could load a real mission
  over the drill, leaving real reports on the drill's journal, or drop the drill and leave the phone
  with no way to end it. Starting the drill now counts as a newer access check, so a check already
  running has no say. (2) A join never runs during the drill. (3) A report still being read when the
  drill ended was journaled onto the drill's deleted journal and left its map behind; a report whose
  journal changed while it was read is now kept nowhere, and its words stay in the field.
- Source: review (practice drill).
- Verified: tests for a running check with searcher claims (no real mission loads) and with no
  searcher (the drill stays), and for a report being read when the drill ends (nothing journaled, no
  map). All three failed before the fix and pass after. New tests also pin what already held: the
  assignment is spoken with no account, End restores the real journal and deletes the drill's
  folder, and the drill's server writes, reads back and listens to nothing. 190 app tests pass.

### feat(ios): practice reports say to ask command in a real search
- What: in the practice drill there is no command to ask, so a report line ending "Ask command." ends
  "In a real search, ask command." instead (for a report that needs command, one that could not be
  read, and one outside the search area). Every other line, and every real report's line, is
  unchanged. EchoText.effectLine takes the practice flag; the report list passes the mission's.
- Source: review (practice wording).
- Verified: a test checks the three practice lines, an unchanged practice line and an unchanged real
  line; it failed to compile before the change and passes after; 314 core and 186 app tests pass.

## 2026-11-19

### build(ios): ship the practice pack, so the Join screen offers the practice drill
- What: the app bundles shared/practice/ios-practice-pack.json (53,011 bytes), the judge seed's sample
  search exported for the phone: incident drill-dev-1 as "Practice search" in judge mode, its 68
  segments, plan 19 with team T1 on segment BO, and the shared sample profile. With it in the build,
  the Join screen shows "Start the practice drill".
- Source: plan (judge access: a phone a judge can try with only the install link).
- Verified: a test starts the drill from the bundled pack: practice mission, judge mode, team T1 on BO,
  the Piedmont Park grid (its tiles are bundled too), the shared profile, and the route check
  available. It failed without the resource and passes with it; 186 app tests pass. On the
  simulator, from a fresh install: Start the practice drill, the task screen notice, the map on
  bundled tiles, a typed report kept "On this phone only", the route check (cloud read 1,271 ms on
  gemini-3.5-flash-lite), and End the practice drill back to the Join screen with no sign-out.

### feat(ios): the Join screen offers the practice drill, labelled as sample data
- What: when the build carries a practice pack and no search is joined, the Join screen shows "No join
  code?", "Try a practice drill with sample data. Nobody is missing. Your reports stay on this phone."
  and "Start the practice drill". During the drill the task screen says "Practice drill with sample
  data. Nobody is missing. Reports stay on this phone." in place of the command line, and the Ready
  check's Leave section becomes "End the practice drill", whose confirmation says its reports are
  deleted from this phone.
- Source: plan (judge access: a phone a judge can try with only the install link).
- Verified: the text-size scan passes (every new line is Title 3 or larger); 182 app tests pass. The
  screens are checked on the simulator once the pack is bundled.

### feat(ios): a practice drill from a bundled pack, with no join code and nothing sent
- What: AppModel.startPractice loads a sample search from a bundled pack (PracticePack: the incident,
  segments, approved plan and shared profile a searcher's phone reads, plus provenance) with no join
  code and no account. The mission is marked practice. Its reports go to a separate journal whose
  server never writes (LocalOnlyEventServer), with their own numbering, and their timings are not
  written; they show "On this phone only" and the link glyph counts none as waiting. Practice reports
  are written as author "practice", so a phone that never signed in can use it. Its assignment is
  spoken with no session. No team topic is followed, no plan listener runs, and a sign-in, a change
  of user or a tapped push leaves it alone. Ending it (the Leave action) deletes its reports, puts the
  real journal back and signs nothing out. It is refused while a search is joined.
- Source: plan (judge access: a phone a judge can try with only the install link).
- Verified: tests for reading the pack (and refusing another pack version); starting with no server
  read, no topic and the assignment spoken; a report kept off the real journal, server and timings
  with no account; a sign-in and a new user keeping the drill; Leave ending it with no sign-out; and
  a joined search never replaced. They failed to compile before the change and pass after; 182 app
  tests and the text-size scan pass.

### fix(ios): run the shared phone-number vectors, and remove numbers written with slashes
- What: PLSCore's tests now run every case of shared/test-vectors/phone-numbers.json through
  PhoneNumbers.scrub: each mustRemove number is gone, with no digit and no forbidden spoken part left
  and the text around it kept; each mustKeep line (a time, a segment number, a count, a percent, all
  together) comes back unchanged. The first run failed on "404/555/0142": a slash did not join the
  parts of a number, so the number stayed in the stored note. A slash now joins them like - and . do.
  A date written 11/19/2026 now reads as a number and is removed, as 2026-11-19 already was.
- Source: review (shared phone-number vectors).
- Verified: the vector test failed on the slash case before the fix and passes after; all 313 core
  tests pass, including the earlier phone-number tests.

### docs: how the iPhone report-reading eval is run and scored
- What: docs/evidence/eval/README.md describes the eval before any result exists: the answer key (written
  by one person before any model run, made-up drill reports on the piedmont-park-dev grid, frozen with
  its SHA-256 pinned in a test, never edited after a run, Sunday's reports as a second fresh set), the two
  arms (rules only, and Apple's on-device model in Airplane Mode, neither reaching the cloud), the scoring
  (kind and segment set per row, feature apart, misses listed, Wilson intervals, exact McNemar), how to run
  it on the phone, and its limits (one labeller unless a second person labels 10 of the 20 rows blind,
  wide intervals, drill sentences).
- Source: plan (report-reading evaluation); review (one-labeller wording).
- Verified: read against EvalScorer, EvalReport, evalRead and the Eval screen; no long dashes.

### feat(ios): a release route check that reads one fixed sentence on each route
- What: on a practice incident (drill or judge mode), the Ready check offers "Check both read
  routes". It reads one fixed drill sentence about the team's first segment with the app's own
  reader on each route, journaling nothing: Apple's on-device model with no network and no cloud,
  then the cloud route with Apple's model turned off for that read and consent for that one
  sentence. It shows both route records (path, stage, model, reason, time) and what was read, and
  saves them with the app version, build, commit and device to the app's Documents folder, so the
  check can run on the TestFlight build. Outside a practice incident it reads nothing: its cloud
  route would send the drill's sample description, and a real search's words go to the cloud only
  with the searcher's consent.
- Source: plan (TestFlight build and the release route check).
- Verified: tests that each route reads the fixed sentence with the intended situation (on-device:
  drill mode, no network, no consent; cloud: signal, consent, model off), and that a real search is
  never checked. They failed to compile before the change and pass after; the text-size scan
  passes; 176 app tests pass. The screen is run on the TestFlight build.

### feat(ios): the report reader can take the cloud route for one route-check read
- What: for the coming release route check, a read can say Apple's on-device model is off for that one
  read (ReportSituation.onDeviceOff), so with signal and consent the router takes the cloud route. A
  searcher's report never sets it. The reader also takes Apple's model status through a seam, so a
  test can say the model is available.
- Source: plan (release build route check: one fixed sentence on each route).
- Verified: a test with the model available reads the same sentence twice: on-device first, then the
  cloud route with the model turned off for the check; the runner saw on-device then cloud. It failed
  to compile before the change and passes after; the reader tests pass.

### fix(ios): a tapped push's request to show the task carries its session
- What: a push tap that passed every check raised a request the screen acted on later; if the
  account changed in between, the screen still jumped to the task view (it showed "No mission
  loaded"). The request now carries the session it was made in, and the screen acts on it only
  while that session is still current. LIMITS.md now says both account windows are closed (the join
  fix in the previous commit and this one), leaving Auth's own reports and the security rules.
- Source: review (round 4 residual window).
- Verified: a test makes an open request, then changes the account (before and after Auth reports
  it): the request no longer counts. It failed to compile before the change and passes after; 176
  app tests pass.

### fix(ios): a join signs in first, so its session is known before any of its checks
- What: a join bound its account session only after the callable returned, so an account change in
  that instant could pair the joined team with another user. It also broke the first join after
  Leave: that join signs in a new anonymous user, the sign-in counted as an account change in the
  middle of the join, and the join ended with "Not signed in yet" although it had worked. The join
  now signs in before anything else, starts the session for that user, and only then takes its
  check number; if the account changes while the callable answers, it loads nothing and says "This
  phone's account changed during the join. Join again."
- Source: review (round 4 residual window); the after-Leave failure was found while closing it.
- Verified: tests for a first join with no user (it signs in and loads the mission at once) and a
  join whose account changes during the call (nothing read or loaded, the new message). Both failed
  before the change and pass after; 175 app tests pass.

### build(ios): archive and check a release build for App Store Connect, uploading nothing
- What: ios/scripts/archive_release.sh archives a Release build with a given build number and the
  current commit, exports the .ipa for App Store Connect into a local folder, and checks the
  exported app itself: push and App Attest entitlements in production, the build number, the
  recorded commit, the encryption answer, the icon, the privacy manifest, no debug eval screen,
  and a valid signature. It refuses to run with uncommitted changes under ios/.
- Source: TestFlight preparation.
- Verified: a dry run on this branch archived and exported build 1 with the team's distribution
  certificate. Seven checks passed (App Attest production, build number, encryption answer, icon,
  privacy manifest, no eval screen, signature). Two failed as expected on this branch: no push
  entitlement (push comes with the push branch) and no recorded commit (the Info.plist key comes
  with the eval branch).

### feat(ios): a privacy manifest for the app
- What: the app now carries PrivacyInfo.xcprivacy, which App Store Connect checks on upload: no
  tracking and no tracking domains; the data a report sends to the incident (precise location, the
  anonymous user id and the report's words), each linked to that user, never used for tracking,
  for the app's own function; and the one required-reason API the app's own code uses, its own
  UserDefaults (reason CA92.1). The widget uses none. The Firebase and MapLibre packages carry
  their own manifests.
- Source: TestFlight preparation.
- Verified: plutil lint passes; a test reads the manifest from the app bundle and checks each entry;
  it failed with the file removed and passes with it; 119 app tests pass.

### feat(ios): an app icon, the web app's mark
- What: the iPhone app had no icon, which App Store Connect refuses on upload. It now has one: the
  web app's own mark (web/public/favicon.svg: a warm ring and a light centre on the dark ground),
  rendered at 1024 x 1024 with no alpha channel by ios/scripts/make_app_icon.sh, in a new asset
  catalog the target names as its icon.
- Source: TestFlight preparation (an upload needs an icon).
- Verified: the script wrote a 1024 x 1024 sRGB image with 3 channels; the app builds and the app
  tests pass; the built app's Info.plist names AppIcon.

### fix(ios): leaving a search goes through the same account change as any sign-out
- What: "Leave this search" signed the anonymous user out and dropped the mission itself, apart from
  the path every other Auth change takes. It now ends with that same account change: running
  access checks lose their say, speech stops, and Auth's own later report of the sign-out finds
  nothing left to do.
- Source: review (round 3: the leave action must use the account-change path).
- Verified: a test leaves after Auth has reported the user, then has Auth report the sign-out: no
  second stop and nothing dropped. It failed before the change and passes after; the app tests pass.

### docs: leaving a search on the iPhone changes only the phone
- What: LIMITS.md says that "Leave this search" leaves the team's topic, drops the mission and
  signs the anonymous account out, while the old user's claims stay on the server and command
  still lists that member until command removes them; leaving waits until every report is settled.
- Source: drill planning (leave action).
- Verified: read against `AppModel.leaveSearch` and its tests.

### feat(ios): a searcher can leave the search from the Ready check
- What: the iPhone had no way to leave a search: the join form shows only with no mission
  loaded, so a phone stayed on its incident until command changed its claims. The Ready check now
  has "Leave this search", with a confirm. Leaving stops speech, leaves the team's push topic,
  drops the mission and signs the anonymous account out, so the next join is a new user and the
  join form shows again. While any report is not yet settled with the server, leaving is refused
  with the reason, since signing out would strand that report's write.
- Source: drill planning (one phone joins several searches; volunteers leave at the end).
- Verified: tests that leaving shows the join form (mission gone, topic left, signed out, speech
  stopped), that a push for the old team afterwards opens nothing (with no user and with a new
  user), and that an unsettled report blocks leaving. They failed to compile before the change
  and pass after; 155 app tests pass.

### docs: the two account windows the iPhone does not close, and plans without a setup id
- What: LIMITS.md says what the account sessions leave open: a first join that signs in a new
  anonymous user binds its session only after the join returns (the security rules still decide what
  that user may read, and a refused read drops the mission), and a tap that passed every check can
  reach the task screen just after an account change (it then shows "No mission loaded" and nothing
  of the old mission). It also says plans carry no setup id, so a practice incident rebuilt under the
  same id and plan version keeps the old task on a phone until a newer plan or a new join.
- Source: review (round 4: the residual race and the plan setup id, medium).
- Verified: read against the session checks in AppModel and the plan document's fields.

### fix(ios): one account session carried through every load, tap and spoken line
- What: a load or a push tap took its own fresh look at the signed-in user at each step, so one
  account's claims could be read, installed and spoken under another account (or under none, since
  "no user" matched "no user"), and Auth's listener ignored the user it reported, so a sign-out and
  a sign-in again as the same user could go unseen. Now:
  - The phone keeps one account session: the user Auth last reported and a count of account
    changes. Auth's listener hands over each reported user in order, and every change of user
    (signed out, another user, or back to the same user) starts a new session: running checks and
    loads lose their say, all speech stops, and the old session's mission and membership go at once.
    The account state is read before any access work starts, and each flow reports the user signed
    in now through the same path before it begins.
  - A join, retry, resume or push tap binds the session when it starts and checks it after every
    wait. The mission it reads is stamped with that session and installed only while it is current.
    A plan held on screen is kept only when it is from the same session. A tap opens only in its
    session, and both voices speak only while the mission's session is current. No session (no user)
    is never current, so nothing is read, installed or spoken without a user.
- Source: review (findings 1 and 2, round 4). One commit for both: they are the same mechanism.
- Verified: new tests cover a tap whose claims return after the account switched (nothing installed,
  opened or spoken), cached claims with no user (nothing read or installed), a sign-out and back as
  the same user through the listener path (the tap's session ended, nothing opens), and a cloud line
  still fetching when the account changes (never plays). Test models now name their user instead of
  taking whatever user the test device stored. 159 app tests pass.

### fix(ios): speech plays only for the mission's own user, and stops when the account changes
- What: the speech guard checked the mission, team and task, but not who was signed in, so a line
  still queued, or a cloud voice still fetching audio, could play after a sign-out or an account
  switch until the mission was dropped; the phone's voice could even play while signed out. Both
  voices now check, right before any sound, that the mission's user is still the one signed in,
  and every Auth change stops whatever is playing or queued. Two older speech tests now name the
  user they run as, instead of taking whatever user the test device had stored.
- Source: review (finding 2, round 3).
- Verified: a test switches the account just before a queued line would play: nothing is spoken.
  It failed before the change and passes after; 155 app tests pass.

### fix(ios): a reload of the same plan version keeps the plan on screen
- What: a reload kept the plan the listener had applied only when that plan was strictly newer. With
  two copies of one version, a withdrawal the listener applied could be undone by a reload that
  read the same version with a task. The plan on screen now stays unless the reload read a strictly
  newer version, as in the listener's own order.
- Source: review (finding 3, round 3).
- Verified: a test holds a reload of plan 3 with a task while the listener applies plan 3 with the
  task taken away; the withdrawal stands. It failed before the change and passes after; 154 app
  tests pass.

### fix(ios): a load and a push tap are bound to the user they started for
- What: a load stamped its mission with the user signed in when the read came back, and a push tap
  checked only the incident and team before opening. A tap could get user A's claims, then finish
  its read after A signed out or another account signed in, and install, speak and open A's mission
  for nobody or for B. Now each load binds the user before it reads and installs nothing unless the
  same user is still signed in; a tap also opens nothing unless its user is still signed in. Auth's
  sign-in, sign-out and account changes drop the previous user's mission, membership and the
  access checks still running.
- Source: review (finding 1, round 3).
- Verified: a test holds a tap's read, signs the user out, then lets the read finish: nothing opens
  and nothing is spoken, and the account change drops the old mission. It failed before the change
  and passes after; the app tests pass.

### docs: iOS shows a background push as sent, with no service extension
- What: LIMITS.md now says that on iPhone a push arriving while the app is in the background or
  closed is shown by iOS from its payload as sent, since there is no notification service
  extension to hide or reword it; that is one more reason the server text stays fixed and generic.
  In the foreground the app shows no banner and its plan listener shows and speaks the new task.
- Source: review (background push exposure, third round): no extension is added.
- Verified: read against `PushAppDelegate.foregroundPresentation` (empty, covered by a test) and
  the project, which has no notification service extension target.

### docs: a moved or removed searcher's iPhone keeps its old team's topic until the app runs
- What: LIMITS.md now says that an iPhone leaves its old team's push topic only when the app runs,
  so a searcher command moved or removed while the app was suspended still gets that team's pushes
  until it next opens (a failed leave is tried again at the next sign-in or push token). The push
  text is fixed, so a former member learns only that a team in that incident got a new task.
  Server-side sending to current members' device tokens would close the window and is not built.
- Source: review (finding 4, third round).
- Verified: read against the topic code (`followTopic` leaves old topics after each sign-in and
  token arrival) and the server's fixed push text in LIMITS.md.

### fix(ios): a push tap reads the mission from the server and opens only an open incident's newer plan
- What: a tapped push read the incident and plan with Firestore's default source, which can answer
  from the cache, and it opened the task whatever plan version it found. The tap now reads only
  from the server. It opens the task only for an open incident whose plan is at least the push's
  version. A closed incident, or a read the security rules refuse, drops the mission and opens
  nothing. When the server cannot be reached, the same user's mission on the phone opens, as with
  no signal; other reads still use the cache for offline use.
- Source: review (finding 3, third round).
- Verified: tests for a tap reading from the server, an unreachable server (same user opens the
  mission on the phone), a closed incident (dropped, with the reason shown), a refused read
  (dropped), and a plan older than the push (nothing opens). The push tests' incident now carries
  the plan version the pushes announce. 152 app tests pass.

### fix(ios): a changed or withdrawn task stops the line playing, and each voice callback is its own line's
- What: speech stopped only on a new incident or team, so when command changed or took away the
  team's task, the old line kept playing. Any change to the task now stops the line playing and any
  line queued after it. The phone's own voice also kept one shared callback: a line handed to the
  synthesizer while another was playing waited behind it, and was checked only at hand-off. Each
  line now waits until the one before has ended, is checked again when its turn comes, and only its
  own start, finish or cancel answers it; a stop ends it at once even if no callback comes.
- Source: review (finding 5, third round).
- Verified: a test changes and then withdraws the task on the same team: each stops the voice,
  and the same task again stops nothing; it failed with the new rule taken out. Tests for the
  line turns: another line's callback is ignored, a line ended before it started was not heard,
  the next line waits for the one before, and a stop releases the line and every waiter. 147 app
  tests pass.

### fix(ios): a push reload keeps a newer plan the listener applied while it read
- What: a tapped push reads the mission again. If the plan listener applied a newer plan while
  that read ran, the read's older plan replaced it on screen and its task was spoken again; a newer
  plan that took the task away was undone the same way. The reload now keeps the plan in the order
  the listener uses: when the plan already on screen is newer than the one read, its version, task
  and segments stay, also when it has no task for the team.
- Source: review (finding 2, third round).
- Verified: a test holds the tap's read at plan 2, applies plan 3 through the listener, then lets
  the read finish, once with a new task in plan 3 and once with the task taken away. It failed
  before the change (plan 2 came back and was spoken again) and passes after; the app tests pass.

### fix(ios): a push tap Auth cannot confirm opens a mission only for the user it was read for
- What: when a tapped push could not get fresh claims, the phone opened the loaded mission's task
  for any reason the claims were missing: no user at all (signed out) as well as no signal. The
  mission now records the user it was read for. Without fresh claims, a tap with no user, or with
  another user than that one, drops the mission and opens nothing; the same user with no signal
  still opens the mission on the phone, as offline. A sign-in as another user also drops the old
  user's mission before the new claims are read.
- Source: review (finding 1, third round).
- Verified: tests for a tap with no user, a tap with another user, a tap by the same user with no
  signal, and a sign-in as another user. The first two failed before the change; the sign-in test
  failed with its check taken out. 141 app tests pass.

### fix(ios): a phone with no user drops its mission, and the foreground checks access again
- What: two gaps in following this phone's access. When the phone had no user at all any more
  (signed out, for example after the account was removed) and signing in failed, the old user's
  mission stayed loaded. A cached user still counts as signed in, so offline use is unchanged. And
  coming back to the foreground settled waiting reports but did not check access, so a role or
  team command changed while the app was away waited for the next reconnect. With signal, the
  foreground now runs the same sign-in check (claims, team and incident status). This commit
  covers both parts of review finding 3 that were left, which share a test file.
- Source: review (finding 3).
- Verified: tests for a failed sign-in with no user (mission dropped, no retry offered) and for a
  role removed while the app was away (dropped on return to the foreground). Both failed before
  the change and pass after; 137 app tests pass.

### fix(ios): a tapped push is checked against the server before the task opens
- What: a tap on a push that named the loaded mission opened the task with no check, so an old
  push could reopen the mission of a team the phone had been removed from. A push for another team
  could also fall back to cached claims and data. Every tap now reads the claims fresh. They must
  name the push's incident and team; then the incident and plan are read again, and only then the
  task opens. A push for another team (an old push) or after the role was taken away opens
  nothing, and the mission follows the claims. With no signal, the mission already on the phone
  opens for a push that names it, and nothing else does.
- Source: review (findings 5 and 9).
- Verified: tests for a tap on the loaded mission (a fresh claims read and one more mission read,
  then it opens), an old push for another team (opens nothing, the mission follows the claims), a
  push for the new team (loads it and opens), a push after the role was removed (drops the
  mission, opens nothing), and no signal (only the mission on the phone opens, with no read). They
  failed before the change and pass after; 135 app tests pass.

### fix(ios): the phone remembers every push topic it may hold, and a team change always wins
- What: the followed topic lived only in memory and a failed leave was dropped. Since FCM keeps
  subscriptions across launches, a team change made while the app was closed could leave the old
  team's topic active for good. A team change that landed while an old topic was being left could
  also subscribe to a team no longer wanted. The phone now keeps, across launches, every topic it
  may hold: listed before the subscription is tried, removed only once FCM confirms the leave.
  Following leaves every listed topic but the wanted one (all of them with no mission, including
  at a launch where the role is gone). It reads the wanted topic again after each network call.
  This change covers review findings 2 and 4, which are the same function.
- Source: review (findings 2 and 4).
- Verified: tests for a relaunch after a team change (old topic left), a relaunch after the role is
  gone (topic left with no mission), a leave that fails and goes through later, and a team change
  during a leave (ends on the newest team only, and only that topic stays listed). They failed
  before the change and pass after; 122 app tests pass.

### fix(ios): the team's push topic is followed again once Messaging has its token
- What: on a fresh install the topic subscription runs right after the mission loads, before the
  APNs and FCM tokens exist. Firebase 13.2.0 refuses it at once ("No APNS token specified before
  fetching FCM Token") and does not retry, so a new phone could stay off its team's topic until the
  next sign-in. The app now listens for Messaging's registration token and follows the topic
  again when it arrives (a token that comes before the app is ready waits in the inbox). This also
  corrects two comments that said FCM holds such a subscription until a token exists.
- Source: review (finding 1).
- Verified: tests for a refused subscription that goes through when the token arrives, and for a
  token that arrives before the app is ready; they failed to compile before the change and pass
  after; the push and join app tests pass.

### docs(ios): plain words for the source of the push entries
- What: four push entries named a work stream as their source; they now say "the server half of
  new-assignment pushes (P-06)". The facts are unchanged.
- Source: review (public hygiene).
- Verified: no added line on this branch matches the public hygiene patterns; the hygiene guard
  exits 0.

### fix(ios): a push that arrives with the app open shows nothing
- What: a push that arrived in the foreground went into Notification Center with the push's own
  title and body. The app now shows nothing for it, because the plan listener already shows and
  speaks the new assignment from the plan itself. Background delivery still shows the push's
  words: the server sends only fixed wording ("New assignment" or "Training drill: new
  assignment", "Your team has a new task. Open Point Last Seen to see it."); replacing that on the
  phone would need a notification service extension.
- Source: review (finding 8).
- Verified: a test that the foreground presentation is empty failed to compile before the change
  and passes after; the app tests pass.

### fix(ios): queued speech never speaks an assignment that was replaced while it waited
- What: a voice waiting behind a slow one spoke the assignment it was given, even when a newer
  plan or a team change had replaced it meanwhile, so an old team's instruction could be spoken
  after the new team's mission was showing. When its turn comes, queued speech now checks the
  loaded mission (incident, team and assignment) and skips anything that was replaced or dropped.
- Source: review (finding 10).
- Verified: a test holds the first spoken line, then delivers a newer plan and moves the searcher to
  T2. Before the change the replaced line ("Search the north field.") was spoken; after it, only
  the first line and T2's assignment are. 112 app tests pass; the CI mirror
  `bash scripts/ci-local.sh` exit 0.

### fix(ios): the alerts question goes with a dropped mission
- What: the question is drawn outside the mission check, and dropping a mission left it set, so it
  could stay on screen with no mission. A permission status read still running at the drop could
  also bring it back, and the button could then open the system prompt. Dropping a mission now
  clears the question. A status read that finishes after the mission was dropped or replaced
  changes nothing. An answer with no question on screen asks the system nothing.
- Source: review (finding 7).
- Verified: tests for a drop with the question showing (gone, and "Turn on alerts" requests
  nothing) and for a status read held until after a drop (no question); all three expectations
  failed before the change and pass after; 111 app tests pass; the CI mirror
  `bash scripts/ci-local.sh` exit 0.

### test(ios): the "asked once" test now fails when the saved answer is ignored
- What: the relaunch check ran after "Turn on alerts", when the system already reported alerts
  allowed, so it passed even with the saved answer removed. The test now relaunches after
  "Not now", with the system still at "not asked", so only the saved answer keeps the question away.
  The allowed relaunch checks that the phone only registers again.
- Source: review (finding 9).
- Verified: with the saved-answer check replaced by `offersAlerts = true`, the new test fails
  (AlertOfferTests.swift:73); restored, it passes; the CI mirror `bash scripts/ci-local.sh` exit 0.

### fix(ios-core): team ids follow the server's rule, so no two teams can share a push topic
- What: the phone accepted any id of letters, digits, "-" and "_" up to 128 for a team. Then
  ("north-east", "T1") and ("north", "east-T1") both named the topic pls-north-east-T1. The server
  (functions join.ts and notify.ts) allows a team id of letters, digits and "_" only, at most 32,
  never "family". The phone now checks the same rule for the join, the topic and a tapped push.
  With no "-" in a team id, the last "-" in a topic always separates incident from team.
- Source: review (finding 6).
- Verified: tests for the hyphen case, 32 and 33 characters, "family" in any case, and a push
  naming such a team; they failed to compile before the change and pass after; 279 PLSCore tests
  pass; the CI mirror `bash scripts/ci-local.sh` exit 0.

### fix(ios): the alerts question keeps every word on a task screen short of height
- What: on the simulator the task screen cut the alerts sentence to one line ("... a new assignment
  re..."), because the screen had less height than its content and SwiftUI squeezed that text. The
  offer now always takes its full height, so the sentence and both buttons stay whole.
- Source: a simulator check of the push work.
- Verified: a layout test measures the offer at phone width, unconstrained and squeezed to 40
  points: it failed before the change and passes after; 109 app tests pass; the CI mirror
  `bash scripts/ci-local.sh` exit 0.

### fix(ios): the assignment voice no longer holds up the plan listener, the topic or the alerts question
- What: loading a mission waited for the assignment to finish speaking before it started the plan
  listener, followed the team's push topic or asked about alerts. The cloud voice takes seconds, so
  on the simulator the alerts question arrived late. The voice now runs as its own task, chained so
  voices keep their order, with the voice settings taken at load time.
- Source: a simulator check of the push work.
- Verified: a test whose voice never starts: the listener, the topic and the alerts question are in
  place at once. Against the old code it failed ("Time limit was exceeded: 60.000 seconds"); with
  the fix it passes. Tests that count spoken lines now wait for the voice task. Both "never waits"
  tests carry a one-minute limit, so a regression fails instead of hanging. 108 app tests pass; the
  CI mirror `bash scripts/ci-local.sh` exit 0.

### fix(ios): a push topic subscription never holds up the join, the mission or the alerts question
- What: FCM completes a topic subscription only once the phone has its messaging token, which can
  be never (no APNs key yet, alerts not yet allowed). The mission load waited for it, so on the
  simulator the alerts question never came and a join would never have finished with its words.
  Following the topic now runs as its own task, chained so subscriptions and unsubscriptions keep
  their order, and nothing else waits for it.
- Source: a simulator check of the push work.
- Verified: a test holds the subscription open: the join completes and the mission loads before it
  answers, and the subscription lands when it does; it failed to compile, then passed; the topic
  tests now wait for the follow task; 107 app tests pass; the CI mirror `bash scripts/ci-local.sh`
  exit 0. On the simulator the alerts question then showed after the mission loaded.

### feat(ios): hand the APNs token to Firebase Messaging and open the task from a tapped push
- What: an app delegate hands iOS's APNs token to Firebase Messaging, so the team's topic can reach
  this phone once the APNs key is in FCM, and routes a tapped new-assignment push by its ids only.
  A tap that arrives before the app is ready waits in a small inbox. Opening a push brings the task
  screen back from wherever the searcher was; when the push names another incident or team than
  the one loaded (a team change, or a tap that launched the app), the mission first follows the
  token's claims. In the foreground the push only lists in Notification Center, since the plan
  listener already shows and speaks the assignment. The entitlements gain `aps-environment`
  (development; an App Store archive signs it for production), and the Ready check link is value
  based so the task screen can be brought back.
- Source: the server half of new-assignment pushes (P-06).
- Verified: three tests (a push for the loaded mission opens the task; a push for another team
  follows the claims first; a tap before the app is ready waits in the inbox) failed to compile,
  then passed; 106 app tests pass; the CI mirror `bash scripts/ci-local.sh` exit 0. Live delivery
  waits on the APNs key in FCM.

### feat(ios): ask once, after the join, whether new assignments may reach a locked screen
- What: once a mission loads and the phone has never asked, the task screen shows one sentence,
  "Turn on alerts so a new assignment reaches you on a locked screen.", with "Turn on alerts" and
  "Not now". "Turn on alerts" shows iOS's question and, when allowed, registers for pushes; either
  answer is remembered, so it is asked once. When alerts are already allowed, the phone only
  registers; when refused, it stays quiet.
- Source: the server half of new-assignment pushes (P-06).
- Verified: three tests (the offer shows after a join, registers when allowed and stays answered
  after a relaunch; "Not now" asks nothing; already allowed only registers) failed to compile, then
  passed; the text is Title 3; 103 app tests pass; the CI mirror `bash scripts/ci-local.sh` exit 0.

### feat(ios): follow the team's push topic while its mission is loaded
- What: once a mission loads, the phone subscribes to its team's topic (`pls-{incidentId}-{teamId}`)
  through Firebase Cloud Messaging; when the team changes it leaves the old topic and joins the new
  one, and when the mission is dropped it leaves. A subscription that fails (no signal) is tried
  again at the next sign-in. Adds the FirebaseMessaging product. Delivery to iOS still needs the
  APNs key in FCM and the token hand-off, which come next.
- Source: the server half of new-assignment pushes (P-06).
- Verified: two tests (subscribe on load, no repeat, move on a team change, leave on a drop; a
  failed subscription is retried) failed to compile, then passed; 100 app tests pass; the CI mirror
  `bash scripts/ci-local.sh` exit 0.

### feat(ios-core): name the team's push topic and read a new-assignment push by its ids
- What: `PushTopic.name` gives the team's topic, `pls-{incidentId}-{teamId}`, only for ids that
  Firestore and FCM both accept. `PushPayload` reads a tapped push's `incidentId`, `teamId` and
  `planVersion` (FCM sends data as text) and nothing else: the words a person reads come from the
  plan the phone loads, never from the push.
- Source: the server half of new-assignment pushes (P-06).
- Verified: two tests (the topic name and refused ids; the ids read from a payload with text or
  number versions, and refused when missing or malformed) failed to compile, then passed; 278 core
  tests pass; the CI mirror `bash scripts/ci-local.sh` exit 0; the app tests pass.

### feat(ios): a debug-only eval screen that runs both arms on the phone
- What: debug builds get a Report-reading eval screen (linked from the Ready check). It reads every
  report in the bundled answer key twice with the app's own reader, rules only and on-device, with
  no network and no cloud, then shows each arm's rows right with a 95% interval, rows read by a
  model, invalid and blocked rows, and the paired McNemar result, and saves the result file to the
  app's Documents folder. The file records the answer key's SHA-256, the app version and build,
  the commit (the Info.plist key PLSBuildCommit, set from PLS_BUILD_COMMIT; "unknown" unless a
  build passes it), the guided prompt's SHA-256 and the device. Release builds have none of it.
  With no answer key bundled the screen says so.
- Source: plan (report-reading evaluation on the phone).
- Verified: the app builds and 121 app tests pass; the text-size scan passes (Title 3 only); the
  screen's run is checked on the phone once the answer key is in.

### feat(ios-core): the eval's result file, both arms and the paired comparison
- What: an eval run writes one result: the facts that pin it (answer key name and SHA-256, who wrote
  it, grid, app version, build, commit, the guided prompt's SHA-256, device, time), each arm's
  outputs and score, the rows with both kind and segments right with a 95% Wilson interval, how
  many rows a model actually read (the rest fell back to the rules or gave nothing), and the rows
  only the on-device arm or only the rules got right, with the exact McNemar p-value.
- Source: plan (report-reading evaluation: counts with intervals, the paired comparison, every miss).
- Verified: a test builds a result from three rows and checks the arms' order, rows right, rows
  read by a model, the interval, the paired counts and p-value, and the facts. 307 PLSCore tests pass.

### feat(ios): read an eval report with the app's own reader, forced to one arm
- What: the app can read one eval report through its real reader, forced to one arm, and journal
  nothing: rules only (no incident mode that allows a model), or Apple's on-device model (the
  mission's own mode). Neither arm may reach the cloud: no network, no cloud consent and no live
  gate. The result keeps the reading, whether it was refused, the path and stage it was read on,
  and the time it took. With no mission loaded nothing is read.
- Source: plan (report-reading evaluation, rules-only baseline beside on-device).
- Verified: tests that each arm sends the reader the situation it should (mode, no network, no
  consent, no live gate, the team's segments), keeps the path and time, marks a refused read, and
  reads nothing with no mission. They failed to compile before the change and pass after; 121 app
  tests pass.

### feat(ios-core): read the eval's answer key as a person writes it
- What: the eval reads the answer key format a person fills in: numbered report texts, each with a
  kind, up to two segment ids and a feature ("none" included), with the key's name, who wrote it
  and the grid. Every row is in the fresh group (written before any model run). An empty segment
  list means no segment is expected: a reading is right on segments only when it names none.
- Source: plan (report-reading evaluation); answer key format.
- Verified: tests that a key reads into rows and that an empty segment list expects no segment; they
  failed to compile before the change and pass after; 306 PLSCore tests pass.

### feat(ios-core): score the report-reading eval against person-written answers
- What: PLSCore can score one reading arm (on-device, rules-only or cloud) on labelled reports: each
  row's kind and set of segment ids against the answers a person wrote, the place feature where the
  person gave one, invalid replies and refused reads, and the list of misses; scores per group keep
  fresh sentences apart from seen ones. It also gives 95% Wilson intervals, the rows only one of two
  arms got right, and the exact two-sided McNemar test on those.
- Source: plan (report-reading evaluation with a rules-only baseline).
- Verified: tests for the counts and misses, invalid and blocked rows, segment order, the groups,
  the Wilson interval (20 of 20 gives 0.839 to 1), McNemar (equal counts give 1, 6 to 0 gives 2/64)
  and the paired counts. They failed to compile before the change and pass after; 304 PLSCore tests pass.

### fix(ios): the map credit is one line in the corner, with the full sentence on a tap
- What: at Title 3 the OpenStreetMap credit took three lines and covered the bottom of the search
  area. It is now one line in the bottom corner at 13 points, OpenStreetMap's own short form
  ("© OpenStreetMap contributors · Protomaps", or without "· Protomaps" when no tiles are drawn);
  a tap shows the full sentence ("Map data from OpenStreetMap contributors (ODbL). Basemap:
  Protomaps."), which is also its accessibility label. The field text-size test gains one named
  exception for this credit only: a fixed size of at least 13 points, allowed only on a line that
  carries the credit marker, and only once in all the views; every other text keeps the Title 3 floor.
- Source: map review.
- Verified: tests for the short line (with tiles, without, and none) and for reading the fixed
  size; the text-size scan passes with the marked credit; 293 PLSCore and 117 app tests pass.

### fix(ios): the map draws only helpful plates, in field-size text, with a muted credit
- What: the search map now uses the plate rule: the team's plate (inverted, light on dark text)
  always shows, another segment's plate shows only at 1% or more and only when it fits inside the
  segment at the current zoom, re-checked after every move. Plates and the credit line use Title 3,
  the field app's smallest text (the credit was footnote size, below the field rule), and the
  credit is the map's muted grey instead of the night theme's red. The map's delegate is held by a
  small map view subclass.
- Source: map review; field text rule (no text below Title 3); public wording rule.
- Verified: 116 app tests and 292 PLSCore tests pass (the text size scan included); the hygiene
  guard passes in public mode; on the simulator the Piedmont drill shows the "T1 1.4%" plate on a
  thick outline, no crowded plates, and the grey credit line.

### fix(ios-core): the team's segments are outlined thick, to find in sunlight
- What: the team's outline on the search map was a thin light line and hard to find. It is now a
  4-point light line on a 9-point dark casing.
- Source: map review.
- Verified: the style tests pass (the outline keeps its team-only filter); on the simulator the
  team's segment stands out at the grid-fit zoom.

### feat(ios-core): which number plates the search map draws
- What: a plate rule for the phone's map, since 68 plates buried the map in "<0.1%" labels. The
  team's own segments always get a plate with the team id ("T1 1.4%", or "T1" when the number is
  below 0.1%); any other segment gets one only at 1% or more, and only when the plate fits inside
  the segment's on-screen box at the current zoom (hidden, never clipped). A "<0.1%" plate is
  never drawn.
- Source: map review (a searcher needs their own segment and the likely areas).
- Verified: tests for the team's plates, the 1% floor, no "<0.1%" text, and the fit check (team
  plates always shown). They failed to compile before the change and pass after; 292 PLSCore
  tests pass.

### feat(ios): the search map screen, on the grid's offline tiles
- What: a Map link (with a mission loaded) opens the team's search map: every grid segment shaded
  by probability in the web map's ramp (the posterior after this phone's reports, else the pack's
  prior), the team's own segments outlined, the printed number on a dark plate at each centre,
  and the OpenStreetMap line at the bottom ("Map data from OpenStreetMap contributors (ODbL).
  Basemap: Protomaps." when the tiles are drawn). The app bundles both drill grids' PMTiles files
  (Kennesaw and Piedmont); the map picks them by the incident's grid id, works with no signal, and
  falls back to plain ground for a grid it does not carry. The map fits the grid once it loads.
- Source: map screen, step 1 (polygons shaded by posterior, offline base, OpenStreetMap credit).
- Verified: tests for picking the tiles by grid id (both bundled, unknown and none fall back), the
  credit line with and without tiles and with no segments, and the numbers (posterior, else prior);
  they failed to compile before the change and pass after; 116 app tests pass. On the simulator
  the Piedmont drill drew on the bundled tiles (streets, buildings and water under the fills), and
  the credit was on screen as element "map-credit".

### feat(ios-core): the search map's style, in the web map's order
- What: PLSCore builds the MapLibre style for the phone's search map, matching the web map: grey
  ground, the grid basemap's parks, water and buildings under the probability fills (0.9 opacity,
  the eight-step ramp by class), its streets, paths and streams over them as thin grey lines, then
  segment edges (a dark casing under a grey line) and the team's own segments outlined. The
  basemap comes from the grid's PMTiles file on the phone (`pmtiles://file://...`) and is left out
  when there is none, so the fills sit on plain ground. No labels: they would need glyphs from a
  host. Each segment is a GeoJSON feature with its id, class, printed number and team flag.
- Source: map screen, step 1 (polygons shaded by the posterior, offline base).
- Verified: tests for the layer order with and without tiles, the basemap source URL, the ramp
  expression and opacity, the features (Polygon and MultiPolygon, lon then lat), the team outline
  filter and valid JSON. 289 PLSCore tests pass.

### feat(ios): the mission keeps the incident's grid id and its map credit
- What: the phone's mission now keeps the incident's `gridId` and `gridAttribution`, so the search
  map can pick the grid's offline tiles and show the grid's OpenStreetMap line. Both are nil when
  the incident has none (or an empty value).
- Source: map screen (offline base by grid, OpenStreetMap credit).
- Verified: a builder test with and without the two fields; it failed to compile before the change
  and passes after; 113 app tests pass.

### feat(ios-core): the search map's shading, numbers and OpenStreetMap line, as the web draws them
- What: the iPhone gets the web map's ink for its coming map screen: each segment's step in the
  eight-step warm ramp by its share of the largest probability (poaClass8), the printed percent
  (one decimal, "<0.1%", "0%"), the OpenStreetMap license line (the grid's own line when segments
  are drawn, else "Map data from OpenStreetMap", none on an empty map), and the grid's segments
  with their step, number and whether they are the team's.
- Source: map screen, step 1 (segment polygons shaded by the posterior).
- Verified: tests with the web's own cases for the step and the percent, the credit rules, the
  segment list, and a parity test that reads the ramp from web/src/theme/tokens.ts. They failed to
  compile before the change and pass after; 282 PLSCore tests pass.

### feat(ios): the approach card shows the tracking aids the family named
- What: the app bundles `shared/constants/tracking-aids.json`, and the Ready check's approach card
  shows its tracking-aid lines under the names line: one per aid the family named (for example
  "Carries a GPS tracker: ask the family for its last location."), the family's note, or "No
  tracker or medical ID, as the family said.", as on the web's card. Nothing shows when the family
  has not said.
- Source: shared profile change (tracking aids), approach card row.
- Verified: a test reads the file from the app bundle (every aid id in order, the none line); it
  failed to compile before the change and passes after; 113 app tests pass.

### feat(ios-core): the search card's tracking-aid lines, from the shared constants
- What: the iPhone reads `shared/constants/tracking-aids.json` and builds the card's tracking-aid
  lines the way the engine's `trackingAidLines` does: one line per aid the family named, in the
  file's order (an id this build does not know is skipped), then the family's trimmed note; the
  file's "none" line when the family said there are none; nothing when the family has not said.
  The approach card carries the lines when it is built with the file.
- Source: shared profile change (tracking aids), card lines.
- Verified: tests read the shared file itself: every aid and the none line are there, the order and
  the unknown id, the trimmed note, the none line, nothing when absent, and the card carrying the
  lines. They failed to compile before the change and pass after; 282 PLSCore tests pass.

### fix(ios): the approach card names every name she answers to
- What: the iPhone's approach card had no names line, while the web's card says who to call,
  for example "Answers to Roberta (also Bea, Mom, Miss Bea)". The card now has the same line,
  built the way the web builds it: the main name, then every other name she answers to (the
  family's list, else the nickname), each once; no line when no name was given. It is the first
  line of the card.
- Source: review (approach card wording on the iPhone).
- Verified: a test runs the web's six answersToLine cases and checks the card carries the line; it
  failed to compile before the change and passes after; 277 PLSCore tests pass; the app tests pass.

### docs(ios): restore the changelog headings a merge dropped
- What: a merge of main into a profile branch kept one side in the changelog's conflicting part,
  which removed 24 entry headings, their blank lines and 8 "Source: review." lines; entries ran
  together under the wrong titles. The file is now the correct three-way merge of both sides: every
  entry from each side, each under its own heading.
- Source: review (changelog read while merging).
- Verified: a script checked that every non-blank line of main's file and of both merge parents is
  in the restored file (0 missing from each), and the restored file has 132 headings.

### feat(ios-core): read the shared profile's tracking aids
- What: profile/shared gains `trackingAids` ({ aids, note }), the tracking aids the family named.
  The iPhone now reads it: absent means unknown, missing parts read as empty, and it is written
  back only when present. It is for the search cards only; the profile text a model may see is
  unchanged by it. Unknown aid values are kept here and skipped where the card lines are built.
- Source: shared profile schema change (tracking aids).
- Verified: a test for a profile with aids and a note, one without the field, one with only aids,
  the written form, and the model-facing text being the same with or without the aids. It failed
  to compile before the change and passes after; 270 PLSCore tests pass. The schema parity check
  passes only together with the schema change that adds the field (checked on a dry merge).

### fix(ios): a closed incident drops its mission even when the claims are unchanged
- What: the sign-in check returned early when the claims still named the loaded mission's
  incident and team, so an incident command had closed kept its mission (and its listener and
  reports) through every sign-in and reconnect. That check now also reads the incident's status.
  If it can be read and is no longer open, the mission is dropped and the join screen says "This
  incident is not open for searching." With no signal the mission stays, as before.
- Source: review (finding 4, second round).
- Verified: a test closes the incident with unchanged claims: no signal keeps the mission, then a
  readable closed status drops it (listener stopped, the message shown). It failed before the
  change and passes after; 112 app tests pass.

### fix(ios): a plan counts only when its stored version is a whole number
- What: the phone turns a Firestore Timestamp into epoch milliseconds, so a plan whose `version`
  was stored as a Timestamp read as a huge version, and every later plan would have been ignored as
  older. The first mission read and the plan listener now take a plan only when its stored version
  is a whole number 0 or above; any other plan counts as none.
- Source: review (finding 5, second round).
- Verified: tests for whole-number versions (a plan) and for a Timestamp, text, a boolean, a
  fraction, a negative number and a missing version (no plan). They failed to compile before the
  change and pass after; the app tests pass.

### fix(ios): an old load never replaces the new team's plan listener, and retired listeners are ignored
- What: a load re-checked that it was still the newest only before it installed the mission. Its
  speaking takes time, and a newer load (a team change) could take over meanwhile; when the old
  load went on, it stopped the new team's listener and installed its own. A callback queued by a
  retired listener could also pass the incident and team checks after a move away and back. A load
  now checks again before it installs its listener. Each listener has a number, and a callback
  from any listener but the one in place is ignored (a drop retires it too).
- Source: review (finding 3, second round).
- Verified: tests for an old load still speaking when T2 loads (T2's listener stays and its plan
  arrives) and for a retired listener's plan after T1 to T2 to T1 (ignored). They failed before the
  change and pass after; 109 app tests pass.

### fix(ios): a dropped assignment is never played, and the next membership starts fresh
- What: a drop cleared the mission and its plan listener, but the voice kept going. A cloud voice
  still fetching could play the old instruction or fall back to the phone's own voice, a queued
  device line could still play, and the speaker remembered the last line across memberships, so
  after T1 to T2 (no task) to T1 it stayed silent for T1. Now a drop or a move to another incident
  or team stops both voices and forgets the last line. Each line is spoken only while it is still
  the loaded mission's assignment: checked before any sound starts (after the cloud fetch) and
  before the phone's own voice stands in for a failed cloud voice.
- Source: review (finding 2, second round).
- Verified: speaker tests for a line dropped during the cloud fetch (neither voice plays it) and for
  stop (both voices silenced, the same line spoken again after). They failed to compile before the
  change and pass after. An app test for a drop then the same team again fails when the stop in
  the drop is removed, and passes with it. 107 app tests pass.

### fix(ios): a slow access check never restores what a newer one dropped
- What: a retry or a sign-in check whose claims read was slow could come back with old searcher
  claims after a newer check had found the role gone and dropped the membership; it then restored
  the membership and could read and load the old mission, or overwrite a newer message. Join,
  "Read the mission again" and the sign-in check now each take a number when they start. Only the
  newest acts on the claims it read or sets the join screen's words.
- Source: review (finding 1, second round).
- Verified: tests hold a retry's and a sign-in's claims read open while a newer check drops the
  role; before the change the slow one restored the membership, after it nothing is restored and
  no mission is read. 104 app tests pass.

### fix(ios): plans apply in version order, so an older plan never replaces a newer assignment
- What: the plan listener compared only assignments, so an older plan (a cache snapshot, or an
  update handled out of order) could replace the newer assignment and speak it, and the newer one
  then spoke again. The mission now keeps the version of the plan its assignment came from, set
  when the mission loads. Only a newer plan counts. A newer plan with the same task for this team
  updates the version and says nothing.
- Source: review (finding 3).
- Verified: a test sends another copy of the loaded version, a newer version, then an older one and
  a second copy of the newer one, then a newer one again. Before the change the old plans replaced
  the assignment; after it only the newer ones apply and each is spoken once. 102 app tests pass.

### fix(ios): a team change retires the old team's mission before the new one is read
- What: when command moved a searcher to another team, the phone read the new team's mission while
  the old one stayed loaded. If that read failed, the old team's mission, plan listener and spoken
  updates stayed alive, reports were stamped with the old team (which the security rules refuse),
  and no retry was offered. The old mission is now dropped first. A failed read leaves nothing of
  the old team, and "Read the mission again" is offered for the new team.
- Source: review (finding 2).
- Verified: a test moves the searcher from T1 to T2 with the read failing: no mission, the T1
  listener stopped, the retry offered with the read message, and a late T1 plan neither loads nor
  speaks. A retry then loads T2. It failed before the change and passes after; 101 app tests pass;
  the CI mirror `bash scripts/ci-local.sh` exit 0.

### fix(ios): a lost searcher role drops the membership too, and a retry checks the claims first
- What: when claims stopped naming a searcher, the phone dropped only a loaded mission. A membership
  whose first mission read had failed survived, so "Read the mission again" stayed on screen and
  read the mission with no check of the claims. Now any non-searcher claims drop everything held
  (the membership, a loaded mission, and any load still running). "Read the mission again" reads
  the claims first (fresh, or cached with no signal). If they no longer name a searcher, it drops
  the membership and says "This phone is no longer on a team. Ask command for a join code."
- Source: review (finding 1).
- Verified: tests for a role lost while only the membership is held, and for a retry after the role
  was lost (no mission read, no retry offered, the message shown). They failed before the change
  and pass after; 100 app tests pass; the CI mirror `bash scripts/ci-local.sh` exit 0.

### fix(ios): the cloud switch says what leaves the phone, and when
- What: the Ready check's cloud switch read "Allow cloud reading when the phone cannot read a
  report" without naming what is sent. It now reads "Allow cloud reading", with the line "Only when
  this phone cannot read a report. Google's model then gets the report's words (phone numbers
  removed), the segment you are in, your team's segments, and the person's description: clothing,
  appearance, height, hair and mobility aids.", which is exactly what the cloud read sends (the
  report text, the two segment tools and the profile tool).
- Source: a consent wording audit.
- Verified: two tests (the switch's words; the named description is exactly the profile tool's
  fields) failed to compile, then passed; the text is Title 3 (the field text size check passes);
  98 app tests pass; the CI mirror `bash scripts/ci-local.sh` exit 0.

### test(ios): pin the exact text each model route receives and the join adapter's real options
- What: the redaction test exercised only the on-device guided call, and the join tests checked a
  static option and a fake's refresh, so neither could catch its own regression. The core test now
  asserts that each route's model gets exactly the scrubbed text (on the phone, guided then
  permissive; in the cloud, guided), and the Firebase join adapter takes its two Firebase edges as
  seams, so a test sees the callable it calls (joinIncident), its limited-use App Check option and
  the refresh flag of each claims read. Also corrects a comment: the callable enforces App Check,
  and limited-use tokens are what replay protection consumes when it is turned on.
- Source: review.
- Verified: with the scrub line removed, the route test fails on both routes; the adapter test
  failed to compile before the seams and fails if the option or the forced refresh is dropped;
  all pass now; 276 core and 96 app tests pass; the CI mirror `bash scripts/ci-local.sh` exit 0.

### fix(ios): read the mission again without the code, and never re-join a team already held
- What: when the server granted the join but the mission could not be read, the only button sent
  the code again, which a one-use code refuses although the phone already had membership. The app
  now keeps the membership the claims granted and offers "Read the mission again", which reads the
  mission without the code. Before calling join, it also checks the token's claims (refreshed): a
  team and incident the phone already holds are read directly, with no code spent.
- Source: review.
- Verified: two tests (a failed mission read is retried without a second call; a team already held
  calls nothing while another team does) failed to compile, then passed; the join tests now start
  from a phone not yet in the incident; 96 app tests pass; the CI mirror `bash scripts/ci-local.sh`
  exit 0.

### fix(ios): a mission lists and counts only its own incident's reports
- What: the task list, the task status and the probability over the team's segments read the
  whole journal, so after a phone moved to a new incident, an earlier incident's reports showed
  under the new mission and a clear on a same-named segment shifted its probability. `missionEntries`
  keeps only the loaded incident's reports, and the probability also takes only that incident's
  events from the listener. The journal itself keeps every report (an earlier incident's stay for
  recovery), and the link glyph still counts every report not yet sent.
- Source: review.
- Verified: a test puts one report from an earlier incident and one from the mission's incident in
  the journal; the mission shows only its own while the journal keeps both; it failed to compile,
  then passed; 94 app tests pass; the CI mirror `bash scripts/ci-local.sh` exit 0.

### fix(ios): a phone number that mixes written and spoken digits is still removed
- What: written digit runs and spoken digit words were checked separately, so a dictated
  "404 five five five 0123" passed both checks and reached the model. One scanner now counts
  written digits and spoken digit words alike: seven or more joined only by short separators
  (spaces, - . , ( )), with an optional leading + or (, are one number. Report numbers stay.
- Source: review.
- Verified: a test removes four mixed shapes and keeps "2 searchers, five minutes, segment 12, one
  hour"; it failed on the old code (4 issues), then passed with every earlier phone-number test;
  276 core tests and the app tests pass; the CI mirror `bash scripts/ci-local.sh` exit 0.

### fix(ios): an incident with no mode, or a mistyped one, keeps the phone on the rules path
- What: a mission read from an incident with no `mode` (or one that is not text) was treated as a
  drill, which lets reports reach a model when consent and routing allow it. The mode is now kept
  as command wrote it, and a missing or non-text mode reads as empty; only an incident marked
  exactly "drill" or "judge" can reach a model.
- Source: review.
- Verified: a test builds missions with "drill" and "judge" (model modes) and with no mode, null,
  a number, "Drill", "training" and "" (none a model mode); it failed on the old code (3 issues),
  then passed; 93 app tests pass; the CI mirror `bash scripts/ci-local.sh` exit 0.

### fix(ios): remove phone numbers from profile and task text where they reach a model
- What: a phone number in a profile description field (appearance, clothing) reached the report
  model through the subject-description tool, and one in an approved task reached the cloud voice.
  The tool's rendered text and the cloud voice's input are now scrubbed. The approach card and the
  phone's own voice, which no model hears, keep the words as written.
- Source: review.
- Verified: two tests (the tool text keeps the description but not the number; the cloud voice
  gets "[number removed]" while the phone's own voice reads the task as written) failed on the old
  code, then passed; 275 core tests and 92 app tests pass; the CI mirror `bash scripts/ci-local.sh`
  exit 0.

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

### docs(ios): plain engineering words in the changelog and two comments
- What: earlier entries and two comments named work streams and private review notes. They now say
  what the source was in plain words ("the security rules contract", "a pack design decision",
  "commit 2bc711c", "review item"); the facts and commit ids are unchanged.
- Source: review (public hygiene).
- Verified: `python3 -I scripts/hygiene_guard.py . --public` reports 0 hits under ios/ (30 before
  the change); the CI mirror `bash scripts/ci-local.sh` exit 0; app tests pass.

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
- Source: P-12, using the shared rule and the shared conditions schema.
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
- Source: P-12; the shared conditions schema (a79f54a).
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
- Source: spoken assignment changes (optional item F1); Firebase generate-speech page read
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
- Source: spoken assignment changes (optional item F1), key agreed in review.
- Verified: `RemoteConfigValuesTests` updated (the key is read; the default is empty; defaults
  round-trip) compile-red, then green; `scripts/ci-local.sh` exit 0.

### feat(ios-core): build the spoken assignment from the approved plan only
- What: `SpokenAssignment.text` makes the words for a new assignment from command's approved
  plan only: the segment ids, read as letters ("Segments A B and A C."), and the approved task
  text, cut at 400 characters. The plan's reason line, report text and profile fields are
  never spoken. `shouldSpeak` speaks only when the words would change. `path` picks the cloud
  voice only when Remote Config names a model (`tts_model_ios`, default empty), the phone is
  online and the kill switch is off; otherwise the phone's own synthesizer.
- Source: TTS first cut approved in review 2026-11-18 (optional item F1); the shared key
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
  2026-11-18); the shared constants and vectors on main.
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
- Source: promotion P-15 (Performance traces per route), optional item C4.
- Verified: `everyReadRecordsExactlyOneRouteTrace` (an evidence read and a parser read record
  exactly their two routes) compile-red without `recordRoute`, then green; 42 app tests pass on
  the iOS 27.2 simulator; `scripts/ci-local.sh` exit 0. Not verified yet: traces arriving in the
  Performance console, which takes a device or simulator run with network and a console read.

### feat(ios-core): describe each read as a route-only Performance trace
- What: `RouteTelemetry` maps a read's `RouteRecord` to the `report_read` trace: five
  attributes (path, stage, reason, model, blocked) and a `latency_ms` metric. It carries the
  route only, never the report, the reading or anything about the subject. AI monitoring sees
  cloud calls only, so this is how the on-device share and latency can be shown.
- Source: promotion P-15 (telemetry), optional item C4.
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
  template the backend publishes.

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
- Source: Task 35 (ApproachCardView data), spec section 13.3, commit 2bc711c.
- Verified: two `ApproachCardTests` (file order with filled text and an unknown id ignored; the
  7-line cut and empty family text) compile-red, then green; full suite 210 tests;
  `scripts/ci-local.sh` exit 0.

### feat(ios-core): add the shared subject profile
- What: `SharedProfile`, the 20 fields of `profile/shared` from
  `shared/schemas/subject-profile.schema.json` (all keys encoded, nulls written out). It is shown
  to people and carried in the pack; only `ModelProfile`'s six appearance fields reach a model.
- Source: Task 35 (phone side), spec section 13.2, the parity map (Profile.swift#SharedProfile).
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
- Source: fresh-eyes review I6; plan addendum (test the failed-request case).
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
- Source: Task 13 (write the three timings after the redraw), spec section 7, the security
  rules contract (device docs under the writer's own uid).
- Verified: `MeasurementTests` red without the type, then green; full suite 190 tests.

### feat(ios-core): build the undo event as a retraction of the searcher's own report
- What: `ReadOutcomeBuilder.retraction(of:authorUid:deviceId:seq:clientTimeMs:)` makes a
  `retraction` event that targets the report (effect none/informational, no text, no reading, no
  route), and refuses another author's event; `canUndo` keeps the echo card's Undo to 5 s. The
  engine then drops the report.
- Source: Task 13 (ReportEchoView: 5-second undo, a retraction), spec section 8, the security
  rules (searchers retract own events only).
- Verified: three `RetractionTests` red without the API, then green; full suite 189 tests.

### feat(ios-core): read the pack's segments into the grid and the prior
- What: `PackSegments.parse` turns `pack-segments` documents into the grid (segmentId code-point
  order, `geometryJson` parsed as a GeoJSON Polygon string, `centroid` {lat, lon}) and the
  engine prior (grid segments in that order, then ROW last from its own document). A pack with no
  ROW document, a broken segment (named in the error) or mixed prior versions is refused.
- Source: Task 12b (PackLoader), the pack design decisions (ROW never computed as one minus the
  rest, geometryJson string, centroid shape).
- Verified: four `PackSegmentsTests` red without the type, then green; full suite 186 tests.

### feat(ios-core): add the approved plan and its per-team assignment
- What: `PlanDoc` and `Assignment` with the field names of `shared/schemas/plan.schema.json`
  (all keys encoded, nulls written out); `assignment(for:)` gives a team its segments. The phone
  takes its current assignment from the latest approved plan in the pack (a pack design decision).
- Source: Task 12b/16b (phone reads the plan), the parity map (Plan.swift#PlanDoc and
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

### fix(ios-core): match the regenerated vectors (eventId framing, measured range first)
One commit for two changes: the shared `search.json` carries both, so no tree with only one of
them passes the Swift suite in `scripts/ci-local.sh`.

- eventId text framing. What: `EventID.make` hashes the UTF-8 text
  frame(incidentId) + frame(deviceId) + frame(decimal seq), frame(s) = decimal byte length, ":",
  s, and keeps the first 32 hex characters; ("ab", "c", 1) hashes "2:ab1:c1:1". The Firestore
  rules can recompute this form. `eventSetHash` and `convergenceCode` keep the binary framing.
  Source: commit ae8446e (review decision). Verified: all 7 eventId vector cases and the
  new `epoch_ms_seq` case failed on the old framing, then passed; unit-test reference values
  recomputed independently in Python.
- Detection range measured first. What: the team's measured `visualDetectionRangeM` (with its
  `rdBasis`) is used when present; a range stated in the report is used only when nothing was
  measured, with basis "stated". Source: commit 73632e9. Verified: vector
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
- Source: Task 13; review item (record how iOS `networkOnline` is computed).
- Verified: app builds with only this commit's files; the rule itself is `ConnectivityTests`
  in PLSCore (including the failed-request case).

### feat(ios): use the auth uid as device id and epoch-millisecond sequence numbers
- What: `DeviceIdentity` gives the anonymous Firebase Auth uid as the event device id (the
  create rule checks `deviceId == request.auth.uid`) and the next sequence number from
  `SeqAllocator` in Application Support.
- Source: the security rules contract (points 1 and 2), Task 13 (DeviceIdentity).
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
- Source: Task 13 (EventStore), spec sections 6.2 and 11.1, the security rules contract.
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
- Source: commit 6c4dc21 (malformed_* docToEngine vectors).
- Verified: 8 malformed vector cases failed before (whole-array decode errors, an empty
  influence map applied), then passed; 158 of 158 vector cases; 3 new `EffectShapeTests`;
  full suite 175 tests.

### feat(ios-core): turn events into Firestore values and read the server identity
- What: `JSONValue.firestoreValue` gives Foundation objects for a write: whole numbers as
  integers (the rules require `seq` to be an int), fractions as doubles, null as `NSNull`.
  `EventIdentity(json:)` reads deviceId, seq, authorUid and clientTimeMs from a server copy, so
  the Outbox can tell "already delivered" from "a different event".
- Source: Task 13 (EventStore read-back), the security rules contract (seq int).
- Verified: two `FirestoreValueTests` red, then green; full suite 172 tests.

### feat(ios-core): allocate event sequence numbers from epoch milliseconds
- What: `SeqAllocator` starts a fresh install at the current epoch milliseconds and counts up by
  one, persisting each number before handing it out. A reinstall keeps the anonymous uid (the
  Keychain survives) but loses this file, so starting from the clock means it can never reuse an
  event id that already exists on the server.
- Source: the security rules contract (deviceId is the auth uid; seq must not repeat after
  a reinstall).
- Verified: three `SeqAllocatorTests` (fresh start, restart continues even with a clock moved
  back, a failed write does not use the number) red, then green; full suite passes.

### feat(ios-core): skip and flag a malformed stored event instead of throwing
- What: `EventFilter.decode` reads stored events one by one; one that does not decode (for
  example a clear with no inputs) is skipped and its id listed in `malformedIds` for command,
  while the rest go on to the engine.
- Source: the security rules review.
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
- Source: Codex review M8; the security rules contract (all 25 keys present and nothing else).
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
  review item on `networkOnline`. Verified: plan tests plus new ones.
- `82b5e02` test(ios-core): every shared vector case runs through the Swift engine; a missing
  file fails, never skips. Source: Task 9. Verified: 148 of 148.
- `6e317b8` fix(ios-core): phone numbers scrubbed from every stored reading string, in any
  script or spoken as digit words. Source: commit security review. Verified: `PhoneNumbersTests`
  on macOS and Linux.
- `a9c8701` fix(ios-core): a command confirmation outranks the family's. Source: security
  review, adopted in 861ec6a. Verified: 150 of 150 vector cases.
