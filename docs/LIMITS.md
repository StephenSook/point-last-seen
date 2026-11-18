# Limits

What Point Last Seen does not do, or does only partly. This file grows as limits are found;
each line says what the limit is and why.

## Release builds

- The public Android APK is the Play Integrity release build only. The debug build carries an App Check
  debug provider and must never be published. `android/scan-apk.sh` runs on the exact signed APK inside
  `release.sh` and must report 0 hits for debug tokens, token resources, `FIREBASE_APPCHECK_DEBUG_TOKEN`
  and the debug provider (the debug APK reports 5).
