# Limits

What Point Last Seen does not do, or does only partly. This file grows as limits are found;
each line says what the limit is and why.

## Release builds

- The public Android APK is the Play Integrity release build only. The debug build carries an App Check
  debug provider and must never be published. `android/scan-apk.sh` runs on the exact signed APK inside
  `release.sh` and must report 0 hits for debug tokens, token resources, `FIREBASE_APPCHECK_DEBUG_TOKEN`
  and the debug provider (the debug APK reports 5).

## Media retention

- When a judge sandbox expires, the security rules stop every read and write of its data and media at
  once. The stored objects themselves are deleted by `deleteIncidentMedia` at expiry; that function is
  PLANNED (Task 23) and not built yet.
- Drill media (clips, photos, packs) is deleted 30 days after upload by the bucket lifecycle rule in
  `storage.lifecycle.json`; that file is PLANNED (Task 18) and not in the repository yet.
- The apps never use Storage download URLs (their token would bypass the rules); the rules gate fails on
  any such call in web, iOS or Android code.
