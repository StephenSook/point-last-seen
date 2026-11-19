# Family app on a real phone, 2026-11-18

The release-signed family app on a Samsung Galaxy A16 (SM-A166U, Android 16, API 36), against
the deployed Firebase project. Build: lane-android at a62f2b0, release type, signed with the
release key. App Check used Play Integrity (no debug provider). All data on screen is made up
for the drill ("Mae", "Mama Mae", "Margaret", age 82).

| File | What it shows |
|---|---|
| `01-profile.png` | Home before anyone is missing: the profile form with the new "Other names they may answer to" field and its hint |
| `02-profile-filled.png` | The name and two other names typed, one per line |
| `03-profile-after-restart.png` | After Save, a force-stop and a cold start: the name, both other names and the age are kept |
| `04-call-first.png` | After "She's gone": "Call 911 first." with the drill line. "Call 911" was not tapped on the real phone |
| `05-911-script.png` | "What to say": "Their name is Mae (also called Mama Mae, Margaret).", age, and "They may not answer when called by name." |
| `06-join-empty.png` | The join screen, empty. The code was typed after this still |
| `07-status.png` | Joined to the live drill incident: "Training drill. Nobody is missing." and "Searchers are looking." |
| `08-about.png` | About this phone: no on-device model, cloud model `gemini-3.5-flash-lite`, App Check `play_integrity`, version 0.1.0 |

Same phone, same build, by instrumentation (no screen):
- Release App Check probe: Play Integrity token issued (1041 characters), sign-in ok, a cloud
  note read ok in 2317 ms.
- Live drill test (`DrillE2ETest`, release build): join, both profile documents written, a
  sighting acknowledged and its duplicate refused, a clip read completed as a no-sighting and
  served from the cache on retry, a photo uploaded. 1 test, 0 failures.

The phone has no AICore package, so no on-device model can run on it; About says the same.

How the stills were checked:
- Each still is the screen at full width, cropped to rows 100 to 2205 of 2340. That removes
  the status bar and the navigation bar, so nothing from the phone's own notifications shows.
- The join code went from the macOS Keychain to a file on the phone by a pipe, was typed by
  the phone's shell from that file, and the file was deleted in the same command. It never
  appears on a command line on the Mac or in any output.
- OCR (`tesseract --psm 11`) over the 8 stills: the join code appears in none. Control: the
  same OCR reads "Mae" in the 3 stills that show it.
- Each still was also checked by eye.
