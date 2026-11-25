# iPhone app on a real iPhone, 2026-11-25 (build 11)

Build 11 of the iPhone app (version 1.0.0 (11), commit 49785952, an Ad Hoc release build signed for this
phone, installed over USB) on an iPhone 17 Pro, iOS 27.2.1, with App Check by App Attest (production).
The phone was joined to the training drill `drill-kennesaw-1` (made-up data; nobody is missing) as team T1.
Plans were suggested and approved in the web command post. The phone's owner did the physical steps (the
Action button, the camera, the lock screen) and allowed alerts and Live Activities when iOS asked.

Every image is a crop of the app's own screen, its lock-screen card or its Dynamic Island. Notifications,
the lock screen and the home screen are not in any image. Times are UTC.

## What ran, step by step

1. **Lock-screen card at the start** (`live-activity-start.png`). Before any change, the card read
   "Training drill. Nobody is missing." / "Your segments: HE" / "All reports delivered."

2. **Spoken assignment** (`voice-retry-speech.wav`, `voice-retry-spectrogram.png`, `voice-retry-frame-20s.png`).
   Command approved plan v3 (team T1 from GS to HQ) at 16:37:50. The phone's screen and sound were
   recorded over USB. The phone spoke from about 16:37:58 for 4.6 s; a speech-to-text check of the recording
   (whisper.cpp, three runs) reads "New assignment, segment HQ. Search segment HQ." The frame at 20 s shows
   the app's header "HQ DRILL". On the server, the iOS app's speech call through the `pls-voice-v1`
   template succeeded with App Check valid for plan v2 at 05:27:47
   (`docs/evidence/ios/2026-11-25-voice-cloud-server-side.json`), and again for plan v3 at 16:37:52, 1.7 s
   after the approval, with AI Logic reporting 2,030 ms
   (`docs/evidence/ios/2026-11-25-voice-cloud-server-side-retry.json`). **Not shown:**
   which voice played. The app says the same words with the cloud voice or, when the cloud voice gives no
   sound, with the phone's own voice (`ios/PLS/AI/AssignmentSpeaker.swift:59-67`); no record here tells the
   two apart.

3. **Push with the app closed** (`step3-after-tap-HF.png`). The app was closed (terminated) and command
   approved plan v4 (T1 from HQ to HF) at about 16:45:58. The server's push function ran at 16:46:00. A
   Point Last Seen notice was on the lock screen; tapping it opened the app from closed on "HF DRILL".

4. **A report with no signal** (`step4-offline-app.png`, `step4-island-compact.png`,
   `step4-island-expanded.png`). With airplane mode on and Wi-Fi off, a typed report ("Cleared HF, coverage
   point seven, nothing seen.") was read on the phone: "Cleared HF. Coverage 0.7. POD 50%." / "Numbers read
   by rules." / "On this phone only". The Dynamic Island showed "HF 1" (compact) and "Drill HF / 1 report
   waiting for signal." (expanded). The command post did not have the report while the phone was offline.

5. **A photo clue with no signal** (`step5-person-refused.png`, `step5-photo-clue-offline.png`,
   `photo-route.json`). Still offline, two photos that showed a person were refused on the phone ("This
   photo shows a person, so it was not kept. Take a photo of the object only."); nothing was kept for them.
   A photo of an object was read on the phone: "Photo: isopropyl alcohol spray." / "Clue logged in HF." /
   "Read from a photo on this phone. The photo was not kept." The app's route record for that event
   (`photo-route.json`: the event's ids, route and timing, no report text) says path `on_device`, model
   "AFM 3 Core Advanced", 2,981 ms, waiting to send.

6. **Back in signal** (`step6-back-online-delivered.png`, `step6-island-zero.png`). With airplane mode off,
   both items showed "Delivered" and the island showed "HF 0". The command post listed "cleared HF" and
   "clue in HF" for Team 1, and raised segment HF's probability after the clue.

7. **Action button** (`step7-action-button-report-focused.png`). With the Action button set to the app's
   "Log report" control, a press from the home screen opened the app with the report box focused and the
   keyboard up. The button was set back to Silent Mode afterwards.

## Not run

- The route check (both read routes on one fixed sentence). It runs only in a practice drill, and the phone
  stayed in `drill-kennesaw-1`. Build 8 ran it (`docs/evidence/ios/iphone-2026-11-20-build8/README.md`).

## Found in this session

The lock-screen card kept "Your segments: GS" after plans v3 and v4 had moved the team to HQ and then HF.
iOS ends a Live Activity after 8 hours and keeps its last card on the lock screen for up to 4 more; build 11
kept updating the ended card, which did not change it, and an alert push cannot change the card while the
app is closed. `docs/LIMITS.md` ("Lock-screen card (iPhone)") states this for build 11. Opening the app
from the v4 notice put up a fresh card ("HF 1" in step 4). Version 1.0.1 restarts an ended card and shows
the time the app set it; that version was not on this phone for this run.

One session on one phone, on iOS 27.
