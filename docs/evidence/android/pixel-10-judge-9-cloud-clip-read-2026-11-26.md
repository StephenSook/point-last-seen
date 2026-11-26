# One cloud read on a Google Pixel 10 with the android-judge-9 file, 2026-11-26

The Pixel 10's other rows read on the phone's own model. This run records one call on the same phone that went to the
cloud. A family note cannot show that here: the phone's on-device model is ready, so a note read with
`PREFER_ON_DEVICE` and the family's yes is answered on the phone (the release probe says such a phone logs
`source=ON_DEVICE`, `android/release-probe.sh:17`). The clip read is cloud only, so one call shows the cloud route.

- **App:** the published `android-judge-9` file, `point-last-seen-family-8f7bc689.apk`, built from commit
  `8f7bc689c3084158afb3c299a572355cae0f515a`, SHA-256 `2e79883dcea7112e48d5746b1cc8a6be3f892a37d7fd0ae72efa4d15eacbe985`,
  versionCode 1795639457. Before the run the installed `base.apk` had this SHA-256. It was not reinstalled.
- **Phone:** Google Pixel 10, Android 17, with Gemini Nano ready (the on-device rows of 2026-11-25). Wi-Fi on,
  airplane mode off.
- **Test:** `ClipLiveTest#aCloudVideoCallReturnsAnObjectInTheClipSchema`
  (`android/app/src/androidTest/java/app/pointlastseen/family/live/ClipLiveTest.kt:21`), from the release test APK
  built at the same commit (`-Ppls.testBuildType=release`, SHA-256
  `7a6bd5b566eca47561c1f0292288923c6f8c9818a07d288e56a8b80f05583f21`). The test makes a 2 s, 320 x 240 test pattern
  on the phone (a moving block, no person) and sends it to the app's clip read, which calls the server prompt
  template `pls-clip-read-v1` (`android/app/src/main/java/app/pointlastseen/family/ai/AiClient.kt:98`). It passes
  only when the reply comes from the cloud and fits the clip schema. The test package was installed for the run and
  removed after it. No screen of the app was opened.
- **App Check:** a release build's only provider is Play Integrity
  (`android/app/src/release/java/app/pointlastseen/family/AppCheckSetup.kt`), and AI Logic refuses a call with no
  valid App Check token (`docs/evidence/appcheck-control/2026-11-18T21-15-14+00-00.json`). A cloud reply therefore
  means the phone sent a Play Integrity token. The run did not log the token.

## Result

The run started at 02:02:08Z on 2026-11-26 (UTC) and logged one line under `PLS-PROBE` at 02:02:21Z:

```
clip bytes=5413 inferenceSource=IN_CLOUD latencyMs=9080 parsed=true personVisible=false model=gemini-3.5-flash-lite
```

Then `OK (1 test)` (runner time 9.414 s), `INSTRUMENTATION_CODE: -1` and the test package removed.
`personVisible=false` is the right reading: the test pattern shows no person.

## What this does not show

- One call (n=1). The 9,080 ms is a single read, not a typical latency.
- Which model answered. The `model=` value is the app's built-in default clip model. The template names its own
  model (`gemini-3.5-flash-lite` in `shared/templates/pls-clip-read-v1.json`), and the log does not print the model
  that answered.
- The clip flow in the app's screens (the family's yes, the card, Confirm). The test calls the clip read directly.
- The App Check token itself. It follows from AI Logic's enforcement, not from a logged line.
- The 2 s test-pattern file stays in the app's cache folder. The release build is not debuggable, so adb cannot
  delete it without clearing all the app's data.
