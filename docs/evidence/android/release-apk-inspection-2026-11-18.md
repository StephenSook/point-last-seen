# Release APK inspection, 2026-11-18

Artifact: `android/app/build/outputs/apk/release/app-release.apk`, built by `android/release.sh`
from lane-android at dd5dd0b. 17,020,486 bytes, SHA-256
`9e347b7a617009fd76ea360521c81e3ac0d74ea837ef2428dd91e281807ef383`.

## Signer (REA `inspect_apk_signature`)

- Scheme v2, one signer. v1, v3 and v3.1 absent. No rotation lineage, no source stamp.
- Signer certificate SHA-256 `7f9df516f452f7aa20f33b4dd03b7950da3096ef89b93fe523d89ec254167f83`,
  equal to the release key registered on the Firebase Android app
  (`7F:9D:F5:16:...:16:7F:83`).
- REA's own limits: the declared signer is read, not cryptographically verified; `apksigner verify`
  (run by `release.sh`) is the verification.

## Manifest (`apkanalyzer`; REA `inspect_android_package` needs a JADX jar that is not configured)

- Application id `app.pointlastseen.family`, minSdk 26, targetSdk 37, `debuggable` false.
- Permissions: INTERNET, ACCESS_NETWORK_STATE, WAKE_LOCK, the AICore bind permission
  (`com.google.android.apps.aicore.service.BIND_SERVICE`, from firebase-ai-ondevice), the
  Firebase messaging and GServices permissions, and the app's own dynamic-receiver permission.
  No location, camera, microphone or contacts permission.

## Strings in the dex and resources (byte scan of the same APK)

| Check | Result |
|---|---|
| App Check debug token or its resource | Absent (also `android/scan-apk.sh`: 0 hits on the signed APK) |
| API keys | One `AIza` key, in resources only: the public Firebase Android config from `google-services.json` |
| Private key material | None. "BEGIN PRIVATE KEY" occurs only as a PEM label constant in library TLS code; "service_account" only in a proto descriptor and a resource name |
| Model id | `gemini-3.5-flash-lite`, once: the in-app Remote Config default (spec section 14). The live value comes from `cloud_model_android` and `clip_model` |
| Prompt text | Present: the family-note instruction and the clip instruction. The note prompt must stay in the app because `PREFER_ON_DEVICE` runs it on the phone when a local model exists; the clip prompt could move to a server prompt template (lane A P-04) |
