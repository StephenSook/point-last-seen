# Family-note eval on a Pixel 10 (Android, on-device)

How well the Android family app sorts a family member's note into the kind the search uses, read by the phone's own
model (Gemini Nano through AICore) with the network off. Measured on 60 made-up notes, not an accuracy claim for
real families' notes.

This is a different task from the iPhone eval in `docs/evidence/eval/`, which reads searchers' field reports into
other kinds (cleared, sighting, clue, found). The two scores are not comparable.

## The answer key

- `android/app/src/androidTest/assets/eval/pls-family-notes-v1.json`, SHA-256
  `ab23c46d74c79b2d854b10c8ecc135c275cac2b3f9ac279b8da838f289449569`, pinned by `FamilyNoteEvalKeyTest`. It ships only
  in the test APK, never in the app.
- 60 short made-up notes about a relative who may wander, 15 of each kind the app's prompt defines: place
  (somewhere they like to go), address (a place they used to live), wandering (where they were found before) and
  clothing (what they wear). No real person, place or health detail.
- Written by the builder's AI assistant (Claude Opus 5.5, a different model family from the model tested), at the
  builder's request, before any model run. A key is never edited after a run; a changed key gets a new name.
- `FamilyNoteEvalKeyTest` also checks that every note reaches the model: none trips the evidence pre-screen, each
  looks English, phone-number removal leaves it as is, and each is under the length cap.

## The run

- Test: `NoteEvalLiveTest.theFamilyNoteKeyIsReadOnThisPhone`
  (`android/app/src/androidTest/java/app/pointlastseen/family/live/NoteEvalLiveTest.kt`), release-signed, run inside
  the installed app with the app in front.
- Each note, once and in key order, goes through the app's own `FamilyNote.read` with the model ready and no cloud
  consent, so the only route is the phone's model (`ONLY_ON_DEVICE`). The model call is the app's, wrapped only to
  record an exception's class and ML Kit error code.
- App: the published `android-judge-8` file (`point-last-seen-family-5914e20f.apk`, SHA-256 `676ec5c5...7eed`).
- Phone: Google Pixel 10, Android 17 (build CP3A.261005.005), AICore 26.10.15.11, model `nano-v4-full`
  (`docs/evidence/android-nano/pixel-10-2026-11-25/facts.txt`).
- Network off: airplane mode on at 04:49:08 UTC, Wi-Fi off, no active network. Run 04:49:16 to 04:50:48 UTC on
  2026-11-25. Airplane mode off at 04:51:12.
- Result file: `pls-family-notes-v1-run1-2026-11-25.jsonl` in this folder, committed unchanged: one line per note
  and a summary line, as the test wrote them.

## Scoring

- A row is right when the app read it (outcome `Read`) and the kind matches the key. A refused or unread reply
  (`Invalid`) is a miss. The label is the model's free text and is not scored.
- The 95% interval is a Wilson interval on rows right of 60.

## Run 1, 2026-11-25

| Rows | Right | 95% interval | Read on the phone | Invalid | Errors | Model time, median (min to max) |
|---|---|---|---|---|---|---|
| 60 | 55 | 0.82 to 0.96 | 59 | 1 | 0 | 1,445 ms (1,143 to 3,295 ms) |

| Kind | Right of 15 |
|---|---|
| place | 15 |
| clothing | 15 |
| address | 13 |
| wandering | 12 |

Every read ran on the phone (route `on_device` on all 59). No call raised an error.

The 5 misses, as they are:

| Row | Note | Key | App result |
|---|---|---|---|
| f06 | The last time she went missing, police found her sitting in the church parking lot | wandering | Invalid: the reply did not pass the app's checks (the run does not record why) |
| f40 | She spent her childhood on a sheep ranch in the hills west of here | address | place, label "Childhood location on a sheep ranch" |
| f46 | Last month a bus driver found her riding the number seven bus to the end of the line | wandering | place, label "Bus route mentioned" |
| f54 | She and her husband lived in a lake cabin up north for twenty years | address | place, label "Lake Cabin Location" |
| f60 | The last time he left home, he was found at the ball field where he coached | wandering | place, label "Place where relative was found" |

Every wrong kind was read as place. In the app a family confirms every suggestion before it is added.

## What this does not show

- One run on one phone and one model; the run was not repeated, so a second run could differ.
- Made-up notes written by one writer, mostly one clear kind each. Real families' notes are longer and mixed.
- English only. A note that does not look English is never sent to the cloud, and no non-English note was run on
  the phone.
- Why f06 was refused: the run records the outcome, not the reply.
