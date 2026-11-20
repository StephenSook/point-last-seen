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

## Sign-in and joining

- Firebase Auth refuses anonymous sign-ups from one network address after many in a short time: its REST
  answer is HTTP 400 `TOO_MANY_ATTEMPTS_TRY_LATER`, which the web SDK raises as `auth/too-many-requests`, and
  the web app then says it could not sign in. A real user signs up once. On drill day, open the site on each
  device before arriving, not all at once on the site's Wi-Fi. (Hit by our own end-to-end suite on
  2026-11-18; the suite now signs up once per run.)
- `joinIncident` allows 10 join attempts per user in a one-hour window that starts at the first attempt
  (`JOIN_ATTEMPTS_PER_HOUR`, `functions/src/join.ts`); the 11th is refused with "Too many join attempts. Try
  again in an hour." A device that mistypes a code several times waits for the window to end, so read codes
  carefully.
- "Leave this search" on the iPhone changes only the phone: it leaves the team's push topic, drops the mission and
  signs the anonymous account out, so the next join is a new user. The old user's claims stay on the server, and
  command still lists that member until command removes them. It waits until every report from the phone is
  settled with the server, since a report still in that user's write queue would otherwise be stranded.

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

- The linear-feature layer (ISRID: 75% of found subjects within 71 m of a road, trail, stream or water edge)
  is switched to neutral when 75% or more of the grid's prior mass is already that close to a feature. This
  rule is ours, not ISRID's: in a path-dense site the ISRID 75/25 split would otherwise move a quarter of the
  mass onto the small area far from every feature, the opposite of what the layer is for. The command post's
  source line for the layer says so.
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

- Notes are expected in English. The web asks Chrome's on-device model for English text in and out
  (`web/src/ai/gate.ts`), and the iPhone uses its on-device model only when that model supports the phone's language
  setting. The iPhone's plain parser, used when no model can read, knows English words; the evidence pre-screen on
  every platform matches English terms only (`shared/constants/evidence-terms.json`); and the phone-number rule knows
  US formats on the web, while the iPhone and Android remove any run of 7 or more digits or English digit words. A
  note in another language can still go to the cloud model, whose prompt names no language, and nothing measures how
  well it reads one. Evidence described in another language is not caught by the pre-screen.

## Phone numbers in notes (Android)

- The family app removes phone numbers from a note the way the iPhone app does: seven or more digits in a row,
  written in any script or spoken, joined by short separators, even across a line break. Search information inside
  such a run (a date, a time, coordinates, a grouped count, a ZIP+4 code after a state, a number with a unit) stays
  only when the rest of the run is a whole number of seven or more digits; otherwise the whole run is removed
  (`android/app/src/main/java/app/pointlastseen/family/core/PhoneNumbers.kt`).
- To keep a phone number out, it removes too much in two cases. A short number touching a date removes the date
  too: "team 5 11/19/2026" loses both. A state abbreviation written in lower case does not protect its ZIP code:
  "ga 30301-1234" is removed, while "GA 30301-1234" stays.
- A phone number written with thousands commas ("Call 4,045,550,142") is kept today on the web and Android, which
  read it as a grouped count; the iPhone removes it. The shared rule removes any grouped count of seven or more
  digits, so once each platform follows it, a count of a million or more ("walked 1,234,567 steps") is removed too
  (as it already is on the iPhone). The shared test cases (`shared/test-vectors/phone-numbers.json`) mark each
  platform that has not followed yet.
- Today every platform keeps a pair of decimals even when it starts with "+", so a phone number written that way
  ("Call +44.2071, -23.4567") stays. The shared rule removes a pair that starts with "+", so once each platform
  follows it, a coordinate written with a leading "+" ("+33.7490, -84.3880") is removed too; without the "+" it
  stays.

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
