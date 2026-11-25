# Release check of the android-judge-9 file on a Samsung A16, 2026-11-25

One run of `android/release-probe.sh` on the exact file published as `android-judge-9`, then one note typed in the
app on the same phone, and the same note typed on a Pixel 10. The probe checks that a release-signed build on a real
phone gets an App Check token from Play Integrity and that one cloud call is accepted. The typed notes check what
this build changed: the note stays on screen while it is read.

- **App:** `point-last-seen-family-8f7bc689.apk`, built from commit `8f7bc689c3084158afb3c299a572355cae0f515a`,
  SHA-256 `2e79883dcea7112e48d5746b1cc8a6be3f892a37d7fd0ae72efa4d15eacbe985`, versionCode 1795639457.
- **Phone:** Samsung A16 (SM-A166U), Android 16. It has no AICore package, so it has no on-device model.
- **Command:** `ANDROID_SERIAL=<the A16> PLS_PROBE_SKIP_BUILD=1 bash android/release-probe.sh`, with the release test
  APK built at the same commit (`-Ppls.testBuildType=release`). The app file was unchanged by that build.
- **Test:** `ReleaseAppCheckProbeTest#theReleaseProviderGetsATokenAndACloudCallIsAccepted`. It asks for a
  limited-use App Check token, signs in, then makes one family note call with
  `NoteMode.PREFER_ON_DEVICE` (`android/app/src/androidTest/java/app/pointlastseen/family/live/ReleaseAppCheckProbeTest.kt:40`).
  It passes only when the token is issued and the reply comes from the cloud.

## Result

The test logged its lines from 20:47:13Z to 20:47:19Z on 2026-11-25 (UTC), exit 0. The lines under `PLS-PROBE`:

```
appcheck release provider=play_integrity ok length=1041
signin ok
cloud note ok source=IN_CLOUD latencyMs=6627 hasText=true
```

Then `OK (1 test)`, `release-probe: test package removed` and `release-probe: passed`. Before the run the phone had
android-judge-8 installed (versionCode 1795578708) and a Wi-Fi connection. After the run the installed `base.apk` had
the SHA-256 above and versionCode 1795639457.

## The note while it is read

The screen was recorded with `adb shell screenrecord` on each phone; the recordings are kept locally, not in the
repo. The two stills are frames from them.

- **Samsung A16, about 20:48Z:** typed "She used to walk to the old mill by the creek", tapped **Sort it**, then
  **Send to the cloud**. For about 4 s the screen kept the note, read-only, with "Reading in the cloud." under it,
  no keyboard, and Back turned off (`a16-judge-9-reading-in-the-cloud.png`). Then it showed "Suggested: a place they
  like to go" and "Read in the cloud in 4.1 s. This phone has no on-device model." Nothing was added to the profile.
- **Google Pixel 10, Android 17, about 20:50Z,** with this file installed as an update, joined to a test search and
  with no cloud consent: typed the same note and tapped **Sort it**. For about 3 s the screen kept the note with
  "Reading on this phone." under it and no keyboard (`pixel-10-judge-9-reading-on-this-phone.png`). Then it showed
  "Read on this phone in 3.5 s." Nothing was added to the profile.

On judge-8 the A16 showed an empty "What did you remember?" field with the keyboard up for the whole read after
**Send to the cloud**.

## What this does not show

- One call of each kind (n=1). The 6.6 s, 4.1 s and 3.5 s are single reads, not typical latencies.
- Which cloud model answered: the probe passes the app's built-in defaults, and the log does not print the model name.
- The "Reading the note." line (cloud consent with a ready model) was not seen on a phone; it is covered by
  `NoteBusyTest` only.
