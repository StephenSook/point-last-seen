# Family app walk against the deployed drill, 2026-11-18

What a family member does, on the real app, against the deployed Firebase project
(drill incident `drill-dev-1`). Debug build of lane-android at ede2d9c on the `pls_phone`
emulator (Android 17, API 37, Play image). The 911 script flag is off, as in the default build.

| File | What it shows |
|---|---|
| `01-profile.png` | Home before anyone is missing: the profile form, "She's gone", "Join with a code" |
| `02-call-first.png` | After "She's gone": "Call 911 first." with the drill line, the dialer and "I called" |
| `03-join.png` | The join screen, empty. The code was typed after this still, never on camera |
| `04-status.png` | Joined: "Training drill. Nobody is missing." and "Searchers are looking." with the actions |
| `05-note.png` | A typed note: "She keeps talking about the old mill." |
| `06-note-consent.png` | No on-device model on this phone, so the app asks before sending the note to the cloud, and offers sorting it by hand |
| `07-note-suggested.png` | The cloud read: "Suggested: a place they like to go", label "The old mill", marked "Read in the cloud" |
| `08-sighting.png` | A family sighting: 15 min ago, by the east gate, going north |
| `09-status-after.png` | Back on status after "Send to command", with nothing waiting or refused |
| `10-about.png` | About this phone: no on-device model, Firebase AI Logic, cloud model `gemini-3.5-flash-lite` (Remote Config), App Check provider `debug`, version 0.1.0 |
| `drill-walk.mp4` | Screen recording (mobile MCP) of stills 04 to 10, 101.6 s, scaled to 540x1200 |

How it was checked:
- The join code comes from the macOS Keychain straight into `adb input`; it is never printed.
  The recording starts after joining.
- OCR (`tesseract --psm 11`) over the 10 stills and one frame every 2 s of the full-size
  recording (61 images): the join code appears in none. Control: the same OCR reads
  "Training drill" in 57 of them.
- No App Check token is shown on any screen; About names the provider only.
- A first take was discarded: the walk script's scroll gesture typed into an open keyboard
  ("to ft"), a harness artifact, not app behaviour.
