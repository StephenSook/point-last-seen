# Release check of the android-judge-8 file on a Samsung A16, 2026-11-25

One run of `android/release-probe.sh` on the exact file published as `android-judge-8`. It checks that a
release-signed build on a real phone gets an App Check token from Play Integrity and that one cloud call is
accepted. It opens no screen.

- **App:** `point-last-seen-family-5914e20f.apk`, built from commit `5914e20fecebc72b8d64ebfd7a929bfd7a8e6271`,
  SHA-256 `676ec5c54abeb46c72042b60e260310dda233edb4d7283fd6f3193b38c3a7eed`, versionCode 1795578708.
- **Phone:** Samsung A16 (SM-A166U), Android 16. It has no AICore package, so it has no on-device model.
- **Command:** `ANDROID_SERIAL=<the A16> PLS_PROBE_SKIP_BUILD=1 bash android/release-probe.sh`, with the release test
  APK built at the same commit (`-Ppls.testBuildType=release`). The app file was unchanged by that build.
- **Test:** `ReleaseAppCheckProbeTest#theReleaseProviderGetsATokenAndACloudCallIsAccepted`. It asks for a
  limited-use App Check token, signs in, then makes one family note call with
  `NoteMode.PREFER_ON_DEVICE` (`android/app/src/androidTest/java/app/pointlastseen/family/live/ReleaseAppCheckProbeTest.kt:40`).
  It passes only when the token is issued and the reply comes from the cloud. In this build the note read takes the
  reply as a typed object, so this run also exercises that path in the cloud.

## Result

Run 2026-11-25 03:59:07Z to 03:59:22Z (UTC), exit 0. The lines the test logged under `PLS-PROBE`:

```
appcheck release provider=play_integrity ok length=1041
signin ok
cloud note ok source=IN_CLOUD latencyMs=4669 hasText=true
```

Then `OK (1 test)`, `release-probe: test package removed` and `release-probe: passed`. Before the run the phone had
android-judge-6 installed and a network connection. After the run the installed `base.apk` had the SHA-256 above
and versionCode 1795578708, and the test package was gone.

## What this does not show

- One call (n=1). The 4.7 s is one cloud read, not a typical latency.
- Which cloud model answered: the test passes the app's built-in defaults, and the log does not print the model name.
- An on-device read: this phone has none. The on-device read of this file was run on a Pixel 10 (the Android
  on-device row in `docs/TEST-MATRIX.md`).
