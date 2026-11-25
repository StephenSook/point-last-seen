# The family app on a Pixel 10: notes read on the phone's own model, and the send queue offline, 2026-11-25

The first runs of the Android family app on a phone with an on-device model (Gemini Nano through AICore). All times
are UTC on 2026-11-25.

- **App:** the published `android-judge-8` file, `point-last-seen-family-5914e20f.apk`, SHA-256
  `676ec5c54abeb46c72042b60e260310dda233edb4d7283fd6f3193b38c3a7eed`, installed with `adb install -r`. The installed
  `base.apk` hash was read on the phone (`facts.txt`).
- **Phone:** Google Pixel 10, Android 17 (API 37, build CP3A.261005.005), verified boot green, bootloader locked,
  AICore 26.10.15.11. The model AICore reported was `nano-v4-full`, the stable full model. The app asks for the
  stable model and shows no model name.
- **App state:** not joined to a search and with no cloud consent for the note reads, so the only route for a note
  was this phone's own model (`InferenceMode.ONLY_ON_DEVICE`). The note was "She likes to walk to the old mill by
  the creek". Nothing was added to the profile.

## 1. A note read on the phone, on Wi-Fi (03:59:28 to 03:59:54)

The app showed "Suggested: a place they like to go", the label "Favorite walking spot" and "Read on this phone in
3.4 s." (`read-wifi.png`).

## 2. The same note with the network off (04:01:45 to 04:02:05)

Airplane mode on at 04:01:17 and Wi-Fi off. At the read the phone reported airplane mode 1, Wi-Fi 0 and no active
network. The app showed the same reading and "Read on this phone in 3.4 s.", with the airplane icon in the status
bar (`read-airplane.png`).

## 3. Two live tests on the phone (03:58:55 to 03:59:03)

From the judge-8 release test APK (`live-tests.txt`, `OK (2 tests)`):

- `AiLogicLiveTest.aReadyModelSortsTheNoteOnThisPhone`: a note read with `ONLY_ON_DEVICE` the way the app reads it
  came back from the phone (source on-device, 3,581 ms) and passed the app's checks.
- `AiLogicLiveTest.onDeviceGenerateObjectHandsBackATypedReplyTheAppReads`: on the phone the reply came only as a
  typed object (the response text was empty), and the app read it.

## How this build came to pass

The first reads on this phone, on judge-6, ended "It could not be sorted. Pick what it is." A one-off diagnostic test
(not in the repository) ran each layer once inside the installed app. The model's status was available, structured
output was available, and plain text read on the phone through both ML Kit and Firebase AI Logic. The app's note
request alone was refused before the model ran: GenAI error -110, "NoteKind is neither a registered @Generable type
nor a directly supported basic type". Fixed in judge-7, the request reached the model, but the reply came back only as
a typed object with empty text, which the app then read as nothing. Fixed in judge-8, the same diagnostic's note step
read on the phone in 3,507 ms and passed the app's checks, with the reply `{"kind":"place","label":"Favorite walking
spot","summary":"The note mentions a specific location the relative likes to walk to.","evidenceQuote":"She likes to
walk to the old mill by the creek"}`. Both fixes are in `android/CHANGELOG.md`.

## 4. A sighting sent with the network off waits, then sends once (04:13:04 to 04:14:31)

The send queue does not use a model. It needs a joined search, so the phone joined the test drill `drill-test-1` for
this step only, through the app's own join call with the join code piped from the Mac and never shown on screen.
"She's gone" then showed the training drill's call-first screen ("Training drill. Call the drill call-taker, not
911.", Call 911 disabled), and "I called" opened the status card.

1. Airplane mode on at 04:13:04 (airplane mode 1, Wi-Fi 0, no active network).
2. "Someone saw them": Just now, "Old mill footbridge", North, "Training drill: offline send check.". Send to command
   at 04:14:03.
3. The status card showed "1 item waiting to send." (`queue-waiting.png`).
4. Airplane mode off at 04:14:16; Wi-Fi had an address again at 04:14:21.
5. By 04:14:31 the line was gone, with no "not accepted" line (`queue-cleared.png`).

Read back from Firestore (`incidents/drill-test-1/events`): before the step, no event had the text "Where: Old mill
footbridge. Training drill: offline send check." (0 of 298). After it, exactly one did (299 events), so the write was
stored once. That event:

| Field | Value |
|---|---|
| `type`, `reporter`, `inputMethod` | `sighting`, `family`, `typed` |
| `reading.direction` | `n` |
| `effect` | `{kind: none, why: needs_command}` |
| `route` | `{platform: android, path: rules, stage: picklist, model: none}` |
| `clientTimeMs` | 04:14:03.995, inside the airplane-mode window |
| `serverTime` | 04:14:22.754, after airplane mode went off |

So the sighting was made on the phone while it had no network, waited there 18.8 s, and reached the server once when
the network came back.

## What this does not show

- Read times on one phone, one note: 3.4 s twice in the app, 3,581 ms and 3,507 ms in tests. Not a typical latency
  across phones.
- Other phones or models: only this Pixel 10 and `nano-v4-full` were tried.
- That the send queue survives the app being closed: the app stayed in front. The count "1 item waiting to send."
  is kept in memory only, while Firestore keeps the write itself on the phone.
- A photo read on the phone: that is the other Android app's evidence.
