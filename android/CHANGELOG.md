# Android family app changelog

Lane D (Android). Newest first. Each entry: what changed, its source, how it was verified.

## Unreleased

- **Device session.** `Session` keeps a device id made once, a sequence number written to disk
  (SharedPreferences `commit()`) before an event id uses it, and the joined incident. Source:
  spec section 8 (ids hash incident, device and seq). Verified: `SessionTest` failed to compile
  first, then passes (stable id, seq never repeats across instances, join and leave).
- **Remote Config, live.** `RcStore` publishes the app's values (defaults first), and
  `FirebaseRcSource` sets the in-app defaults, fetches at start and activates every real-time
  update, so `kill_cloud` and the model ids change without a restart. Source: Task 19 step 4
  ("Real-time Remote Config; kill_cloud banner"), spec section 14. Verified: `RcStoreTest` failed
  to compile first, then passes (defaults before a fetch, a real-time update publishes new values).
- **Release signing without caching the password.** `android/release.sh` reads the keystore
  password from the macOS Keychain into `PLS_RELEASE_PASSWORD` for one build that runs with
  `--no-configuration-cache`, then verifies the signature; the build refuses to sign when the
  configuration cache is on, and debug builds never see the password. The keystore lives outside
  the repo. Source: Android addendum (release keystore on this Mac, password in the Keychain).
  Verified: the first attempt failed because the configuration cache forbids a Keychain call at
  configuration time; now `release.sh` builds `app-release.apk` signed with certificate SHA-256
  7f9df516...167f83 (apksigner verify); `PLS_RELEASE_PASSWORD=x ./gradlew help` exits 1 with the
  guard message; a byte scan of `.gradle/` and the build dirs finds 0 copies of the password.
- **Live AI Logic probe.** `AiLogicLiveTest` makes one hybrid family-note call through Firebase
  AI Logic with App Check and logs `PLS-PROBE` lines. Measured on the pls_phone emulator
  (Android 37, Google Play image, 2026-11-18): `checkStatus()` UNAVAILABLE; `PREFER_ON_DEVICE`
  answered with `inferenceSource` IN_CLOUD in 2569 ms on gemini-3.5-flash-lite, and the reply fit
  the note schema (kind place, label "The old mill"); `ONLY_ON_DEVICE` with no local model threw
  `FirebaseAIOnDeviceNotAvailableException` instead of calling the cloud. Source: Task 19 step 1
  (S13 is still owed on the A16) and the Android addendum ("record what it does"). Verified: the
  first run failed as an invalid test class (methods returned non-Unit); fixed; 11 of 11
  instrumented tests pass.
- **Approach notes follow the spec table order.** `approachNoteIds` now lists notes exactly in the
  spec 13.3 table order filtered by each row's rule, so iOS, the web and Android agree until
  `shared/constants/approach-notes.json` lands. Source: lane A ruling on approach order.
  Verified: `notesFollowTheSpecTableOrder` failed first (approach_calm was second), then passes;
  all unit tests pass.
- **App Check providers per build type.** Debug builds install the debug provider, whose token
  comes from the untracked `local.properties` through a debug-only string resource; release
  builds install Play Integrity and carry neither the debug provider nor a token. `FamilyApp`
  installs the factory only when Firebase is configured. Source: Task 19 step 4, spec section 14.
  Verified: `AppCheckLiveTest` (live token exchange with the registered emulator debug token)
  failed to compile first, then 9 of 9 instrumented tests pass on the emulator; `assembleRelease`
  succeeds; a byte scan of `app-release-unsigned.apk` finds 0 copies of the token and 0 of
  `DebugAppCheckProvider`, while the debug APK (positive control) has both.
- **Evidence terms ship inside the app.** A Gradle task copies
  `shared/constants/evidence-terms.json` into the APK's assets for every variant (the build
  fails if the file is missing), and `EvidenceTerms` loads it into the screen, which still fails
  closed at run time if the asset cannot be read. Source: spec R8, lane A ruling 8. Verified:
  `EvidenceAssetTest` failed first on the emulator (terms null, a normal note flagged), then 7 of
  7 instrumented tests pass; `unzip -l app-debug.apk` lists `assets/evidence-terms.json`.
- **EventDoc carries schemaVersion and serverTime as fields.** The type's field names now equal
  `event.schema.json` exactly, which is what `scripts/check_schema_parity.py` reads from a Kotlin
  data class; the writer sets the server timestamp sentinel with `copy(serverTime = ...)`.
  `kotlinTypesCarryTheSchemaFieldNames` checks the declared fields of EventDoc, RouteRecord,
  CameraSighting, SharedProfile and CommandProfile against the shared schemas. Source: lane A
  ruling 7. Verified: the updated tests failed to compile first, then 100 unit tests pass.
- **Profile documents follow the shared subject-profile schema.** `SharedProfile` and
  `CommandProfile` are now data classes with the schema's exact property names: mobility aids as
  a closed list, the dementia type present but null without the family's switch, every flag as a
  boolean, the approach note ids (spec 13.3, "may_not_respond" and "approach_calm" first), schema
  length caps, out-of-range numbers left blank, and places with an optional position.
  `SchemaShapeTest` reads `shared/schemas/*.schema.json` and checks that the event, report
  reading, route record, camera sighting and both profile maps carry exactly the schema's keys.
  Source: lane A ruling 7, spec 13.2 and 13.3. Verified: new tests failed to compile first, then
  98 unit tests pass.
- **Event ids checked against the shared vectors.** `IdVectorsTest` runs all six `eventId` cases
  in `shared/test-vectors/search.json` (including the UTF-8 byte-length case) through
  `EventIds.eventId`. Test only; the code already matched. Source: spec section 8 and lane A's
  vectors. Verified: passes on the real code; fails on a mutant that encodes UTF-16
  (`ab_c_1` mismatch); the restored file is byte-identical (`git diff --stat` empty).
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
