# Release check of the android-judge-6 file on a Samsung A16, 2026-11-25

One run of `android/release-probe.sh` on the exact file published as `android-judge-6`. It checks that a
release-signed build on a real phone gets an App Check token from Play Integrity and that one cloud call is
accepted. It opens no screen.

- **App:** `point-last-seen-family-cc53d89d.apk`, built from commit `cc53d89dea2bad2ee2385433b492c3449d7e8e77`,
  SHA-256 `88b49746ac5b59109230f1a7022d81972b7deb9ab28d45a92af4263b3c84b59a`, versionCode 1795503686.
- **Phone:** Samsung A16 (SM-A166U), Android 16. It has no AICore package, so it has no on-device model.
- **Command:** `ANDROID_SERIAL=<the A16> PLS_PROBE_SKIP_BUILD=1 bash android/release-probe.sh`, with the release test
  APK built at the same commit (`-Ppls.testBuildType=release`). The app file was unchanged by that build.
- **Test:** `ReleaseAppCheckProbeTest#theReleaseProviderGetsATokenAndACloudCallIsAccepted`. It asks for a
  limited-use App Check token, signs in, then makes one family note call with
  `NoteMode.PREFER_ON_DEVICE` (`android/app/src/androidTest/java/app/pointlastseen/family/live/ReleaseAppCheckProbeTest.kt:40`).
  It passes only when the token is issued and the reply comes from the cloud: an on-device reply never reaches the
  server, so it would prove nothing about App Check.

## Result

Run 2026-11-25 02:56:23Z to 02:56:51Z (UTC), exit 0. The lines the test logged under `PLS-PROBE`:

```
appcheck release provider=play_integrity ok length=1041
signin ok
cloud note ok source=IN_CLOUD latencyMs=11336 hasText=true
```

Then `OK (1 test)`, `release-probe: test package removed` and `release-probe: passed`. After the run, the installed
`base.apk` on the phone had the SHA-256 above and versionCode 1795503686, and the test package was gone.

## What this does not show

- One call (n=1). The 11.3 s is one cloud read, not a typical latency.
- Which cloud model answered: the test passes the app's built-in defaults, and the log does not print the model name.
- An on-device read: this phone has none.
- A first attempt four minutes earlier failed before any request left the phone: the phone had no network
  ("Unable to resolve host"). It passed once the phone joined Wi-Fi; the app file was the same.
