# Limits

What Point Last Seen does not do, or does only partly. This file grows as limits are found;
each line says what the limit is and why.

## Release builds

- The public Android APK is the Play Integrity release build only. The debug build carries an App Check
  debug provider and must never be published. `android/scan-apk.sh` runs on the exact signed APK inside
  `release.sh` and must report 0 hits for debug tokens, token resources, `FIREBASE_APPCHECK_DEBUG_TOKEN`
  and the debug provider (the debug APK reports 5).
- An Android APK built before c05f679 cannot read clips: it writes a clip consent that expires 30 days out,
  and the rules require 31 to 33 days, so the consent and the upload are refused.
- Apple's terms for its on-device model forbid "official use in connection with law enforcement or criminal
  justice" and decisions "without human supervision that have a material impact on individual rights, in high-risk
  domains" (Acceptable use requirements for the Foundation Models framework). The iPhone app reads a report with
  Apple's model or Gemini only in a drill or judge incident (`ios/PLSCore/Sources/PLSCore/ReadPlan.swift`; any
  other incident is read by rules), and a person at command approves every assignment change. We CANNOT VERIFY that
  Apple permits its model's use on an official search, so this build is for training drills.
- The iPhone's cloud route needs iOS 27; on iOS 26 it reads on the device, then by rules. The app installs from
  iOS 26.0, but the cloud route runs Gemini in a Foundation Models session (`ai.geminiLanguageModel(name:)`),
  which iOS 26 does not have, so the reader keeps the cloud off there. The iOS 26.5 simulator runs the app's tests
  but has no on-device model to run, so on it every report was read by rules
  (`docs/evidence/ios/ios26-5-simulator-2026-11-20/README.md`).

## Sign-in and joining

- A browser that fails the site's security check (App Check, through reCAPTCHA Enterprise) cannot start a practice
  search: the server refuses it before any search exists, and the judge's page says so. The drill replay and the
  on-device check on that page still work without it.
- Firebase Auth refuses anonymous sign-ups from one network address after many in a short time: its REST
  answer is HTTP 400 `TOO_MANY_ATTEMPTS_TRY_LATER`, which the web SDK raises as `auth/too-many-requests`, and
  the web app then says it could not sign in. A real user signs up once. On drill day, open the site on each
  device before arriving, not all at once on the site's Wi-Fi. (Hit by our own end-to-end suite on
  2026-11-18; the suite now signs up once per run.)
- `joinIncident` allows 10 join attempts per user in a one-hour window that starts at the first attempt
  (`JOIN_ATTEMPTS_PER_HOUR`, `functions/src/join.ts`); the 11th is refused with "Too many join attempts. Try
  again in an hour." A device that mistypes a code several times waits for the window to end, so read codes
  carefully.
- A browser's sign-in holds one search and one role at a time. Starting a practice search, or joining another drill
  in another tab, moves it, and a command post still open for the first drill can no longer act: it says "You're
  signed in to another search in this browser. Reopen this drill with its command code to act as command." A practice
  search has no code, so its post sends you back to the judge's page instead. The post checks again whenever its tab
  is shown or focused and every five minutes while it is shown, at most once in 30 seconds, and at once after a
  refused action. Use a separate browser profile to run two searches side by side.
- "Leave and delete this sign-in" on the iPhone first asks the server to delete the phone's anonymous account (the
  `deleteMyAccount` callable), then leaves the team's push topic, drops the mission and signs out, so the next join
  is a new user. Leaving needs signal: it waits until every report from the phone is settled with the server, since
  a report still in that user's write queue would otherwise be stranded, and when the delete fails it changes nothing
  and asks to try again in signal. An account already gone (a delete whose reply was lost) counts as deleted.
  Before the account, the server deletes its member record (role, team and when it joined) in every search it
  joined, including one whose command removed it, so command's People list no longer shows it; someone command
  removed who then leaves vanishes from People too. In the same step each of those searches gets a record holding
  only the time, so the old sign-in, still valid for up to an hour, is refused at once and cannot join again.
  Reports already sent stay in the incident until its data is deleted, and so does command's own record of a
  removal, which People does not show. With more than 1,000 searches to check, the delete fails and changes nothing.
  Two cases are left: an account that joins another search at the same moment it leaves can keep its own member
  record there (the app does one after the other), and a search an account joined before member records existed
  (2026-11-21) gets no refusal record unless the account's sign-in still names it, though any sign-in from then has
  long expired. The Android family app has no way to delete its sign-in.
- Command removes a searcher or family member from the People panel (the `removeMember` callable). From that moment
  the member's app can no longer read or write anything in the search, screens already open included (measured on
  2026-11-21: two open listeners were refused within a second of the removal), and that account cannot join again.
  Four limits remain:
  - A removed person can join again with a new sign-in until that role's join code is replaced (the
    `rotateJoinCode` callable). Replacing it stops every older code of that role, an extra one such as a reviewer's
    included.
  - A removed member can still open media through links they already received, until the drill's media is deleted.
  - A member removed while a clip upload is in progress can finish that one upload within the hour.
  - Removal takes effect at once for every account that joined after membership records began (2026-11-21, 18:48
    UTC). An account that joined before and has since joined another search cannot be removed for up to an hour.
- When command ends a search, an iPhone in it shows the command post's own line ("Search ended: training ended. No
  new reports are taken.") and its reports stay on screen, read-only, with no Send. With signal the phone hears it
  at once from a listener on the incident; without signal it learns at the next check in signal (a launch, a return
  to the app or to signal, or a push it opens). A report sent offline after the search ended is refused by the
  server when the phone reconnects, and its receipt then says "Not taken: the search had ended."
- "Report a problem" on the iPhone flags the team's task or the family's description to command, with a reason and an
  optional note (phone numbers removed, 500 characters at most). Each report is filed once and cannot be changed or
  taken back. Without signal it waits on the phone and goes when signal returns; the phone then cannot say whether the
  server later took it. The iPhone shows only this phone's own reports, so it offers no way to flag another
  searcher's report. Reports are not offered in the practice drill, where nothing leaves the phone.
- "Block on this phone" hides the family's description of the person on that iPhone only, for that search, until
  "Show again". Nothing is sent: command still has the description and is not told. It hides the card only: with
  "Allow cloud reading" on, a report read in the cloud still gets the description's clothing and appearance, and the
  phone still checks a report's words against the person's names, so a note naming them still reads as the person
  found.

- The iPhone acts on a mission only within the account session it was read in: the user Auth last reported
  plus a count of account changes, where every change of user starts a new session. A join signs in first,
  so its session is known before any of its checks, and a tapped push's request to show the task carries its
  session, so the screen ignores it after an account change. What is left is Auth itself: the session follows
  Auth's reports, and the security rules still decide what each user may read.
- Plans carry no setup id. A practice incident rebuilt under the same id could publish the same plan
  version again; while the old copy is on an iPhone, a reload of the same version keeps the plan on screen
  (only a strictly newer version replaces it), so that phone keeps the old task until a newer plan arrives
  or it joins again.
- A second family phone (or the same phone after a reinstall) never fills a profile field command left empty. Its
  first share adds only fields the search does not have yet; command or the family fills an empty field by editing
  it.
- A family's edit made on the phone before its first publish to a search reaches the search for single fields (names,
  descriptions, the clothing last worn, triggers and the like). For a list or set field (other names, mobility aids,
  the behaviour flags, places, past addresses and wandering spots, the tracking answer, the vehicle), the edit reaches
  the search only where command's profile does not have that field yet; where it does, command's entries stay. After
  the first publish, an edit to such a field sends the phone's whole list, which replaces the entries command added
  to that field.
- The family app leaves a search only when a refreshed sign-in no longer names it as that search's family, or when
  the family taps "Leave this search". A refused read, a failed refresh or being offline keeps the search, so a
  phone that loses its access while offline shows the search until it can check.
- "Leave this search" stops new changes at once, waits up to 5 seconds for changes already sent, then asks the phone
  to stop following the search's notifications. Leaving is on this phone only: its sign-in still names it as the
  search's family, and the server checks that sign-in, so a change made offline just before leaving still reaches the
  search when the phone reconnects. A write already under way when the family leaves (a photo or clip upload, or the
  profile's first publish) can still reach the search: each one checks the join just before it starts, and only a
  membership check on the server at that moment could stop one already started.
- After leaving a search, the phone shows no notice for it while the app is open. A notice Android shows while the app
  is in the background can still arrive until Firebase confirms the phone has stopped following that search; a drop
  that was not confirmed is tried again each time the app starts.

## Search model

- The drill areas are small next to the search rings: the practice area is about 1.0 by 1.6 km and the Kennesaw
  drill area about 2.2 by 3.9 km, while the rings reach 12.8 km (flat terrain; 8.3 km in mountains, 12.6 km urban).
  Most of the probability therefore sits beyond the drill area, shown as its own row below the top segments with a
  computed line saying how far the rings reach. The grid is not extended before the hackathon deadline: a prior
  rebuild writes every segment in one batch, so a 125 m grid stops near 490 segments (about 2.8 by 2.8 km, which
  still leaves about half the probability beyond it), and a new grid would need a new iPhone build, since the iPhone
  carries the practice grid, and a new App Store review.
- A sighting the search command confirms, with a place (a GPS fix or a point on the map) and the time it was seen,
  becomes the new last known point: the ring prior is rebuilt from its place, with the direction-of-travel wedge when
  it says which way the person went, as a confirmed camera sighting does. The rings do not widen with the time since
  the sighting (the ring model has no time term); the command post states the sighting's age instead. Only a
  sighting seen later than every sighting the map was already built from moves the start, because command confirms
  in the order reports are reviewed, not the order they were seen; an older one stays a clue and the command post
  says so. The time the person was first reported missing is not stored, so a sighting from before it can still
  move the start when it is the first one confirmed. A confirmed camera clip always moves the start, even one seen
  before the current last known point, so command checks a clip's time before confirming it. A sighting with no
  place, or one only the family confirmed, still moves the map only as a clue, which raises its segment's weight
  against every other by a third (by two thirds when it matches the profile). The map before the rebuild is not
  kept, so the replay starts from the newest prior.
- The linear-feature layer (ISRID: 75% of found subjects within 71 m of a road, trail, stream or water edge)
  is switched to neutral when 75% or more of the grid's prior mass is already that close to a feature. This
  rule is ours, not ISRID's: in a path-dense site the ISRID 75/25 split would otherwise move a quarter of the
  mass onto the small area far from every feature, the opposite of what the layer is for. The command post's
  source line for the layer says so.
- The elevation layer, "Downhill and level ground", is off by default. When on, the grid's mass sits 42% downhill,
  39% about level and 19% uphill of the start segment: the ISRID dementia split for temperate terrain (Koester, Lost
  Person Behavior p. 164). The source prints no sample size for this table and does not define "same", so "about level" as
  within 3 m of the start segment is ours. The layer is not used on urban terrain, for which the source has no split;
  choosing the urban table turns it off. It needs each segment's elevation, so the switch shows only on a site with an
  elevation file (the Kennesaw drill grid; the development grid and the judge practice search have none), and a
  rebuild from a new last known point measures from that point's segment. The 3DEP vertical accuracy is unverified.
- A plan holds at most 8 team assignments, and an incident has at most 8 teams: teams come only from the seed
  tool, which refuses more, and the practice search's copy of it; no app can create one. The security rules check every assignment's shape as the plan is
  written (a team id a push can reach, up to 6 segment ids, both texts within 200 characters), and they cannot loop,
  so each assignment is checked by its index. The worst case (a judge incident, a blocked wording route, every text and
  id at its longest) fits 9 assignments under the rules' 1,000-expression limit and not 10, measured in the emulator,
  so 8 keeps one assignment of room. Segment ids must be a list of text
  with no comma, and a plan's doc id is its version in exactly one form ("0016", never "00016"). The command post
  also reads each stored plan field by field (`planFromDoc`) and sets aside, naming it on the post, any record that
  is not a plan.

## Language

- Notes are expected in English. Before a note may go to the cloud model, every platform screens it, as written,
  with one shared rule (`shared/constants/language-words.json`; the web in `web/src/ai/sightingText.ts`, the iPhone in
  `ios/PLSCore/Sources/PLSCore/LanguageScreen.swift`, Android in
  `android/app/src/main/java/app/pointlastseen/family/core/LanguageScreen.kt`). A note is not sent when more than half
  of its words are in a non-Latin script, or when it holds 3 or more of 90 common Spanish, Portuguese and Vietnamese
  words and more than twice as many of them as English words; the person then fills the fields by hand (on the
  iPhone, picks them).
- The screen is a word count, not a language detector. A short note in another language can pass it ("Ella no está
  aquí" does, on every platform), and a note in another Latin-script language (French, for one) passes, because
  accents fold away and its words are on neither list. A note that passes goes to the cloud model, whose prompt
  names no language, and nothing measures how well it reads one.
- The web asks Chrome's on-device model for English text in and out (`web/src/ai/gate.ts`), and the iPhone uses its
  on-device model only when that model supports the phone's language setting. The iPhone's plain parser, used when
  no model can read, knows English words; the evidence pre-screen on every platform matches English terms only
  (`shared/constants/evidence-terms.json`); and the phone-number rule on every platform removes any run of 7 or more
  digits, written in any script, or English or Spanish digit words. Evidence described in another language is not
  caught by the pre-screen.
- The web's sighting form checks, at Save, whether a note reads as a team's search report rather than a sighting
  ("Segment 4 searched, subject not seen"), with one rule and no model (`shared/engine-ts/src/searchReport.ts`, cases in
  `shared/test-vectors/search-report.json`). It knows English words only: a search report in another language saves as
  a sighting with no warning. It never blocks a save: "Save as a sighting anyway" saves the note as typed, and a
  report placed in a cleared segment can open that segment's debrief. Only the web runs it so far.

## Phone numbers in notes

- The family app and the command post remove phone numbers from a note the way the iPhone app does (the web runs a
  port of the Android rule, `web/src/data/phoneNumbers.ts`): seven or more digits in a row, written in any script or
  spoken, joined by separators (any spaces, punctuation or symbols, such as dashes, dots, middle dots, commas,
  brackets, slashes, bullets or underscores, but never ":", "%" or "°", which mark a time, a percent and a degree),
  even across a line break. Search information inside such a run (a date, a time, coordinates, a ZIP+4 code after a
  state) stays only when the rest of the run is a whole number of seven or more digits; otherwise the whole run is
  removed (`android/app/src/main/java/app/pointlastseen/family/core/PhoneNumbers.kt`).
- To keep a phone number out, it removes too much in five cases. A short number touching a date removes the date too:
  "team 5 11/19/2026" loses both. A state abbreviation written in lower case does not protect its ZIP code: "ga
  30301-1234" is removed, while "GA 30301-1234" stays. A list of times or a date and a count joined by a comma,
  semicolon or other mark goes with the run ("Check-ins 08:30; 11:45; 14:03", "Seen 2026-11-19; 3 searchers"). And a
  radio frequency joined to other digits goes with them ("Radio 155.160 404 5550142" keeps only "Radio"). And a
  coordinate pair stays only with a minus before its second number, 4 to 7 decimals in each and no phone cue right
  before it, or with one of al, a, at, on or to between (call, tel, phone, cell, mobile, number, #, llame, llamar,
  telefono, celular, numero, with or without accents; "Phone found at 33.7866, -84.3733" stays, "Call 33.7866,
  -84.3733" goes), since two decimals with no minus between them can be two phone numbers ("33.12345678, 33.87654321"
  is two Mexican numbers): an eastern longitude ("33.7490, 84.3880") and a pair after "Call" are removed. The drill
  grids are all in the western hemisphere, where the longitude carries a minus.
- It keeps too much in four cases. A phone number written like a street address with an ordinal street ("5550 142nd
  St") is kept, since it has the same shape as an address ("12345 67th Ave") and the two cannot be told apart. A
  number written with a colon inside it, like a time ("Call 4:03-5551" or "404-555:0142"), is kept, since the colon
  does not join it to the digits after it and a time before a number ("Seen at 14:03, 404-555-0142") keeps its
  minutes. A number written as two radio-frequency shapes (25 to 999, a full stop, three digits) is kept, since a
  list of frequencies ("Radio 155.160 | 154.205") stays: "555.014 | 404.201" and "55.123 45.678" are kept. And a
  phone number whose last digits read as a short date ("Call 404 5550-1/23") keeps those digits ("1/23"), since a
  date beside a whole number of seven or more digits stays.
- The separator rule (any mark between digit groups joins them except ":", "%" and "°") is on the web and Android.
  iPhone build 9, the one used in the drill, predates it and keeps numbers split by a middle dot, bullet, underscore,
  star, bar, semicolon, "!", "?" or brackets; build 10 carries the rule.
- A count of a million or more written with commas ("walked 1,234,567 steps") is removed on every platform, because a
  phone number can be written the same way ("Call 4,045,550,142"); a count under seven digits ("12,345") stays.
- A pair of decimals that starts with "+" is removed on every platform, since a phone number can be written that
  way ("Call +44.2071, -23.4567"); so a coordinate written with a leading "+" ("+33.7490, -84.3880") is removed too.
  Without the "+" a pair stays.
- Of the 130 shared phone-number test cases (`shared/test-vectors/phone-numbers.json`), Android passes 119, the iPhone
  119 and the web 119. Six of them are for Spanish digit words (cero to nueve, as in "cuatro cero cuatro"). Eleven are
  pending on every platform: five known gaps where a colon breaks a digit run, so a number written as two times
  beside a month name ("Call 5:55 01:42 May", "Seen 14 May 5:55 01:42") survives; five more below where a number is
  kept; and one where times right after a date take the date with them (below)
  (`scripts/test_phone_vectors.py` checks these counts against the file).
- It also keeps a phone number written in these ways, on every platform: as times with a slash between two of them
  ("Call 4:04/5:55 06:42", where "04/5" reads as a date); as times with a digit from another script or a spoken digit
  inside one ("Call 4:04 5:٥5 01:42", "Call 4:04 cinco:55 01:42"); as superscript or full-width times ("Call ⁴:⁰⁴
  ⁵:⁵⁵ ⁶:⁴²", which loses all but its first hour); and with letters for some digits ("Call 1-800-GET-HELP", which has only four digits). Each needs a
  number written in an unusual way; ordinary numbers are removed.
- Times right after a date can take the date with them. The web, Android and the iPhone scrub a note until it stops
  changing (at most four passes), and a run of times right after a date is then removed together with the date:
  "Seen 11/19/2026 12:12 5:55 01:42" gives "Seen [number removed]:[number removed]" on all three, with no digit of the
  number left. 18 of the 9,130 notes in the shared corpus lose a date this way, measured on the web.
- Three more ways part of a number can be left, measured on the web (the phones share its rule but were not measured
  on these): times written with a third field ("Call 4:04 5:55:01:42" is kept whole, since the run of times is not
  read as one); in a note already scrubbed once, a run of times followed by spoken digits keeps its first hour ("Dial
  [number removed] 4:04 5:55 one two one two" gives "Dial [number removed] 4:[number removed]"); and a time just
  before spoken digits keeps its hour and loses its minutes ("Sighted at 14:03 one two 4:04 5:55" gives "Sighted at
  14:[number removed]"). Each needs a number written in an unusual way.
- A run of times in clock order with no phone cue before it is kept as search information, so a phone number written
  as rising times (`2:12 5:55 6:42`), or spread across them (`0:40 4:55 5:01 14:20`), is not removed: a kept run keeps
  all its digits. Out of order (`12:12 5:55 01:42`) or with a cue among the three
  words before it (`Call 21:25 5:50 1:42`, `Reach me at 4:04 5:55 06:42`) it is. A note that NFKC changes (superscript
  or full-width digits, for example) skips this step, so the shared rule may leave the first hour of such a run.

## Photo clues (iPhone)

- A searcher can take a photo of something found. Apple's on-device model reads it (iOS 27 with the vision
  capability, in a drill that lets a model read). The photo stays in the app's memory, is never saved or sent, and
  has no cloud route.
- The photo is kept only when a separate question to the same model ("Is any part of a person visible?") answers a
  clean no and its description shows no person. A yes, no answer, an error, the 30-second limit or a person or
  body word in the description keeps nothing. A dedicated on-device person detector (Apple's Vision framework)
  would be stronger. It is not used, because the app's AI inference stays on Firebase AI Logic and Apple's Foundation
  Models.
- Code, not the model, compares the object with the family's described items by kind and color. Anything it cannot
  read for sure is unknown, never consistent. A photo whose words could be evidence follows the evidence protocol.
- A model call that runs past the 30-second limit keeps its own copy of the photo in memory until it ends (within
  its output cap). At the limit the app releases its own reference, starts no further model call for that photo,
  and lets the next photo be read, so a stalled call can briefly overlap the next read.
- NOT VERIFIED: the camera on a real iPhone. The person question on real photos: on the simulator it answered no on
  two object photos and yes on one public-domain portrait. Whether the system photo picker caches the photo. The app
  covers its screen when it leaves the foreground with the picker open, but what iOS keeps for the app switcher was
  not checked.

## On-device safety (Android)

- The family app's note read asks for the on-device model first (PREFER_ON_DEVICE). Firebase AI Logic's
  Android on-device path (firebase-ai-ondevice 16.0.0-beta08) runs Gemini Nano through the ML Kit GenAI
  Prompt API (com.google.mlkit:genai-prompt 1.0.0-beta5) and Android's AICore system service. Google's
  documentation (each quote checked word for word on the live page, 2026-11-18) says:
  - "Both the input prompt and results generated by the Gemini Nano runtime are evaluated against our safety
    filters before providing the results to the app."
    (https://developers.google.com/ml-kit/genai/prompt/android/evaluate-prompt, Safety)
  - "AICore has several built-in safety features, ensuring a thorough evaluation against our safety
    filters." (https://developer.android.com/ai/gemini-nano)
  - "Input must fit within the model's context window (under 4000 tokens, or approximately 3000 English
    words)." (https://developers.google.com/ml-kit/genai/prompt/android/get-started)
- Those filters are Google's layer, not ours, and the same safety page says each app should "assess the
  safety risks for your app's specific use case and test accordingly". Our own checks run on every path:
  phone numbers are removed before any prompt, the evidence pre-screen fails closed, the reply must match a
  closed schema, and the family confirms every suggestion before it is added.
- Our largest on-device request (an English note at the 2,000-character cap) is under 4,000 bytes, so it is
  under the token cap even at one token per byte (android `OnDeviceBudgetTest`).
- Not tested: we have no phone with Gemini Nano, so neither the AICore filters nor the cap ran in our tests,
  and non-English notes are outside that byte bound.
- NOT VERIFIED without a Gemini Nano phone: the Android on-device structured-output path (generateObject);
  whether it fills response.text; and whether our wire-named enum constants survive ML Kit's on-device schema
  translation. The cloud path is tested; the on-device answer is still checked against the closed schema, so
  a mismatch is refused, not used.

## Media retention

- Any member of an incident can create a link to its photos and clips that works without signing in, until
  the file is deleted. Firebase Storage gives a member a download token whenever they read a file's details,
  and the link built from it skips the security rules. Measured on 2026-11-18: after an admin removed a
  clip's token, the member's next read of its details created a new one. The apps never make these links
  (the rules gate fails on any download-URL call in web, iOS or Android code), but a member who calls the
  Storage API directly can.
- Drill media (clips, photos, packs) is deleted 30 days after upload by the bucket lifecycle rule in
  `storage.lifecycle.json` (applied and read back 2026-11-18). The project was created 2026-11-17, so no
  upload can be deleted before 2026-12-17, after judging ends.
- A clip uploads only while its consent record expires at least 31 days after the upload, so the consent
  always outlives the clip. An upload interrupted for more than a day needs its creator to renew the consent
  first; the rules allow that until the clip has a reading.
- A clip read that finds no usable sighting is stored as a typed no-sighting reading, so the clip is not read
  again. A model or network error stores nothing: a completed reading never changes, so a passing failure must
  not hide a real sighting; the record stays open and the next reader retries. While a clip has no reading, any command or family member of the incident can take its record over
  with their own consent (for example a second seat, or the same person after a new sign-in); the clip's path
  never changes.
- When a clip reading (the consent record) is deleted, by its TTL, by command or otherwise, the
  `deleteClipOnConsentEnd` function deletes its clip, with retry on. Both deletions run in the background, so
  the clip can outlast its consent by that function's delay; the 30-day lifecycle is the backstop. When
  command deletes a record, its clip goes with it.
- An incident's command can delete all its clips, photos and their readings at once with
  `deleteIncidentMediaNow`, for example when a family withdraws consent, instead of waiting 30 days. It first
  marks the incident (`mediaRevokedAt`, a new server time on each call), so every open command seat drops the
  media at once, then deletes the files and readings. Packs are not included; they are rebuilt from the incident
  and expire with the lifecycle rule.
- A delete can land while another seat is already sending. The command post checks, right before a clip or
  photo leaves the browser, that it is still allowed: a clip's consent record is read from the server (never a
  cache; unreachable means nothing is sent) and must hold all three consents and an unexpired expiry, and a
  photo must still be in Storage. Only synchronous checks run between that answer and the model call. A delete
  that completes after the check has answered and before the request reaches the model cannot be stopped from
  the browser, so that one copy can still be read. Its result is then discarded: a clip's reading cannot be
  saved once its record is gone, and a photo tray empties and reloads when the delete is announced.
- The delete is announced before its files are gone (`mediaRevokedAt` is set first), and each open seat reloads
  its tray at once, so a photo still being deleted can be listed again for a moment and stay listed until the
  next reload. Its bytes stay on that laptop only: a cloud read of it needs its family consent record and its
  Storage file, which the delete removes, and an answer for it needs the file too.
- A family answer is saved only after Storage confirms the photo, but the save itself is a Firestore write: if
  Firestore is offline at that moment, the write waits on the laptop and lands when the link returns, even if
  the search's media was deleted in between. That can bring back the photo's reading (the place cues and the
  family's answer, never the image) until command deletes the media again.
- A judge's practice search (`startJudgeSession`) is a copy of the development drill on the Piedmont Park grid:
  its grid, prior, teams and shared profile, labelled "Training drill. Practice search; nobody is missing." It
  carries no events from the drill; the judge adds reports and sightings. It switches to the exported drill run
  once one is published. A visitor gets one new practice search an hour, at most 50 are started a day (counted on
  one document per UTC day), and each is deleted, with everything in it, a day after it ends.
- Each setup attempt has its own incident, `judge-{uid}-{attempt}`, and `judgeUsers/{uid}` names the one in use. A
  setup that died is replaced by a new attempt, and the dead one ends at once. So a setup that resumes late (a 2nd
  gen function can keep running after its timeout), the cleanup job and the media sweep each touch only their own
  attempt. An older practice search at `judge-{uid}` is kept only if it holds every one of the drill's segment and
  team ids.
- The command role is written only while the practice search is still the visitor's attempt, ready and not ended,
  read right before the write. A start that pauses between that read and the write itself can still put an older
  attempt's role over a newer winner's. The security rules refuse an ended practice search's data, so the visitor
  sees nothing there and starts again, which gives the role on the current one.
- A setup that resumes after the cleanup job has deleted its retired attempt can write that attempt's segments,
  teams or profile again, under an incident that no longer exists. The cleanup job reads incidents, so it does not
  find them. They are the drill's copy, never a judge's own work, no client can read them, and nothing links to
  them.
- When a judge sandbox ends, the security rules stop every signed-in read and write of its data and media
  at once. Its files are deleted within 15 minutes of the end by `deleteIncidentMedia`, which runs every 5
  minutes and retries a sandbox until a sweep finds nothing left. Both are live (deployed 2026-11-18); the daily
  probe checks the sweep's `ops/storage` heartbeat. A link made during the sandbox stops working when its file
  is deleted.

## Drill data retention

- A drill's data is deleted 30 days after the search command closes it: the incident with its events, plans,
  debriefs, consents and everything else under it, its clips, photos and packs, and its join codes.
  `deleteEndedDrillsJob` runs daily at 07:41 UTC (`functions/src/retention.ts`; live since 2026-11-21 03:02 UTC, and
  its first run, started by hand, deleted nothing because every drill was open). It writes a purge record
  (`ops/drillPurges/items/{id}`, which no client can read or write) before deleting anything and marks it done only
  when every step succeeded, so a run that stops partway is finished by the next one, even after the incident itself
  is gone; a record whose incident id is in use again is marked stale and nothing of that incident is deleted. Done
  and stale records are kept for good, and the seed tool (`tools/seed/seed_drill.py`) refuses to create a drill, or
  add a code, for any id that has one, so a purged drill's id is never used again. A last media
  and join-code sweep after the incident is deleted catches anything written during the purge; with the incident
  gone, the rules refuse new uploads.
- The close time is the server's: `recordDrillClosedTrigger` writes `closedAt`, the close write's own commit time,
  once and only if it is absent, so a repeated or retried trigger cannot move it, and the security rules refuse
  `closedAt` from every client, so no seat can move a drill's deletion. Closing is final, so `closedAt` is never
  cleared. A drill closed before this job existed has no `closedAt` and is not deleted by it (on 2026-11-21, before
  the rules made `closedAt` the server's, every drill was still open and none had a `closedAt`).
- The anonymous sign-ins whose only incident was the deleted drill are deleted with it, a member command removed
  included (its claims were cleared, so it is found through the drill's removal records). Each is read again just
  before it is deleted and kept if it has joined another incident since or was used after the drill closed; a
  sign-in with an email, a phone number or another provider is a person's account and is kept. A failed sign-in
  delete leaves the purge record unfinished, so the next run tries again. Not closed: a sign-in idle since the close
  that refreshes and joins another incident in the moment between that last read and the delete is still deleted.
  Its person then signs in again and rejoins with a code; nothing they wrote is lost.
- Kept until 2027-01-01 whatever their close, and purged on that date whether or not anyone closed them (the job
  closes one still open at that date, never over a real close, then deletes it the same way): `drill-dev-1` (the
  development drill), `drill-judge-1` (the judge sandboxes' seed), `drill-kennesaw-1` (the drill on film and on the
  judge page) and `drill-test-1` (the drill every live check and the daily probe use). A live search and a judge
  sandbox are never deleted by this job; a sandbox goes a day after it ends (`deleteEndedSandboxesJob`).
- The iPhone's practice drill keeps its reports on that phone only: it never signs in and sends neither its reports nor
  their timings (`ios/PLS/App/AppModel.swift`), so nothing of it is in Firestore to delete.

## The published drill run

- `tools/export-run` writes the public run (`web/public/evidence/published-run.json`) with no Firebase uid:
  authors and devices are pseudonyms (`author-N`, `device-N`), report text is null, a reading survives only on a
  camera sighting (its clock and times), and a place to check or a camera pin has no position. It refuses to
  write a run that breaks any of these.
- Event ids stay as stored, because plans and the prior name events by id. An event id is a hash of the incident,
  the writing device's auth uid and a counter, so someone who already holds a participant's uid could check which
  events are theirs. Uids are never published, and every published run is a drill on team-owned devices.
- The judge replay's reader is a second check, not the privacy boundary. Its scan for user ids is best effort; the
  exporter's pseudonyms are the guarantee.
- The reader parses the whole file before its size checks (at most 1,000 reports, over at most 7 days), so an
  oversized file costs the browser a parse before it is refused.
- The judge replay's check compares each segment's percent and centroid with the run, not its polygon.

## Command post extras

- The replay shows no map before the current prior: a moment from an earlier prior reads "Earlier prior. The map for
  this time is not stored."
- Reports still sending are not in the replay.
- The assignment sheet's names and numbers are handwritten.
- The names the person answers to and the approach notes print only when command ticks the box, and paper leaves the
  app: once printed, nothing in the app controls it.
- The GeoJSON export was checked in MapLibre only.
- Terrain ships only where stream links mostly run downhill. The development site has no terrain, so neither does the
  judge practice search. The 3 m "about level" band is ours, and the vertical accuracy of the 3DEP data is unverified.
- Reloading the extras panels offline is not verified on the deployed app.

## Push notifications

- When command approves a plan, `notifyPlanApproved` pushes each team whose assignment changed, on the topic
  `pls-{incident}-{team}`. Firebase Cloud Messaging topics are open: any install of an app can subscribe to any topic
  name. So a push carries nothing private: a fixed line ("Your team has a new task. Open Point Last Seen to see
  it."), the incident and team ids, and the plan version. The task itself is read in the app, behind the security
  rules. Pushes go only to teams the incident has, at most 20 a plan, and never in a judge practice search. Each
  team's notice for a plan version is sent once (a repeated delivery of the event sends nothing), none goes for a
  plan a newer version has replaced, and one whose send fails is sent on the next delivery.
- The family gets a push on its own topic, `pls-{incident}-family`, when command asks it a question or sets the
  search to searching or paused. The push says only that ("The search lead has a question.", "Teams are searching
  now.", "The search is paused. The search lead will call you.") with the incident id only; the app lists the
  unanswered questions from Firestore when it opens. No push ever carries an outcome. At most 20 a day per incident,
  one per trigger event (a redelivered event sends nothing), none for a state the incident has since left or once it is found, closed or past its end, and none
  in a judge practice search. A push that fails to send after its slot is taken is not retried.
- A family notice can arrive late or out of order. Searching, paused and searching again in quick order can send
  "Teams are searching now." twice, a question's notice can arrive after the family has answered it, and the search
  can end between the check and the send. A notice only says to open the app, which shows the current state and the
  questions still waiting from Firestore.
- Pushes are a convenience, not an alert: delivery can be late or missing. Anything urgent reaches the family by the
  search lead's call, as the paused notice says.
- Anyone who knows an incident id can subscribe to its topics, since topic membership is not checked. That is why
  every push carries only fixed wording and ids, never a name, a place, a task or a question's text. Such a
  subscriber can still see when a search's teams get new tasks, when it starts or pauses, and when the family is
  asked a question. A real search's incident id is never published (people join with a code); the drills' ids are
  in this repository, and they are drills.
- An iPhone leaves its old team's topic only when the app runs: when command moves or removes a searcher while the
  app is suspended, that phone still gets the old team's pushes until the app next opens and leaves the topic (a
  leave that fails is tried again at the next sign-in or push token). Because the push text is fixed, a former member
  learns only that a team in that incident got a new task. Sending to device tokens chosen from current membership on
  the server would close this window; it is not built.
- On iPhone, a push that arrives while the app is in the background or closed is shown by iOS from its payload as
  sent: there is no notification service extension, so the app cannot hide or reword it. That is one more reason the
  server text stays fixed and generic. In the foreground the app shows no banner at all; its plan listener shows and
  speaks the new task instead.
- iPhone delivery needs an APNs key in Firebase Cloud Messaging; until one is added, pushes reach Android only.
