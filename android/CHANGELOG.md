# Android family app changelog

Lane D (Android). Newest first. Each entry: what changed, its source, how it was verified.

## Unreleased

- **Route reasons use the shared names.** The family note writes `on_device_default` (answered on
  this phone), `sdk_fallback` (PREFER_ON_DEVICE answered from the cloud while a local model
  exists) or `on_device_unavailable` (no local model); the clip read writes `sdk_only_in_cloud`.
  Source: lane A ruling 3 and `shared/schemas/route-record.schema.json`. Verified: the reason
  assertions failed first, then 86 unit tests pass.
- **Evidence screen follows the shared matching rule.** Words are now NFKD-normalized with
  combining marks dropped and split on anything that is not a letter or digit, so accented and
  fullwidth text folds the same way as on iOS and the web. Unit tests read the repo's
  `shared/test-vectors/search.json` and `shared/constants/evidence-terms.json` (a missing file
  fails, never skips). Source: lane A ruling 8 and `evidence-terms.json` `matching`. Verified:
  `EvidenceVectorsTest` failed first on `accents_fold_into_words`, then all 15 shared evidence
  vectors pass; 84 unit tests, 0 skipped.
- **AI Logic client (ai/AiClient.kt, ai/AiSchemas.kt).** Every model call goes through
  `Firebase.ai(backend = GenerativeBackend.googleAI())` with limited-use App Check tokens behind
  Remote Config. The family note uses `OnDeviceConfig(mode = ...)` (hybrid) and records the
  SDK-reported `inferenceSource`; the clip read uses `OnDeviceConfig.IN_CLOUD` with inline video
  and a closed response schema; "About this phone" reads `onDeviceExtension.checkStatus()`.
  Source: plan Task 19 step 4, spec sections 9, 12.1, 14. Verified: `AiMappingTest` (SDK enums
  map to ours; both schemas name every field of their Kotlin types; the clip prompt forbids face
  and identity guesses); `./gradlew testDebugUnitTest` 83 passed; `scripts/ci-local.sh` passed.

Entries for the three commits pushed before this changelog existed (da4317c, 6ac6d2e, 3dfba5a):

- **3dfba5a, photo encoder.** `JpegEncoder` makes a 1536 px JPEG with EXIF orientation applied
  and all metadata gone, under the 2 MB photo cap. Source: Task 19 step 2. Verified:
  `connectedDebugAndroidTest` 5 passed on an Android 37 emulator.
- **6ac6d2e, core logic.** Bearing table, clip checks and the 14,000,000-byte cap, phone-number
  removal, the evidence screen, event ids, family sighting and clip-confirmation events, the
  profile split and prompts, the family-note consent gate. Source: Task 19 steps 2 to 4 and the
  rival self-audit addendum. Verified: 77 unit tests passed; CI run 44236409325 success.
- **da4317c, Gradle scaffold.** Source: Task 19 step 4 and the Android addendum. Verified:
  `assembleDebug` with and without `google-services.json`.
