# Production checklist

Checks that run before any build or page is published. Each line names the command and the result it
must give.

## Android

- [ ] Publish only the Play Integrity release APK. Run `android/scan-apk.sh` on the exact signed APK (it
  runs inside `release.sh`): it must report 0 hits for debug tokens, token resources,
  `FIREBASE_APPCHECK_DEBUG_TOKEN` and the debug provider. A debug APK reports 5 and is never published.
