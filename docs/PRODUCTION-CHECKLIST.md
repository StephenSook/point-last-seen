# Production checklist

Checks that run before any build or page is published. Each line names the command and the result it
must give.

## Android

- [ ] Publish only the Play Integrity release APK. Run `android/scan-apk.sh` on the exact signed APK (it
  runs inside `release.sh`): it must report 0 hits for debug tokens, token resources,
  `FIREBASE_APPCHECK_DEBUG_TOKEN` and the debug provider. A debug APK reports 5 and is never published.

## Firebase project

- [ ] Storage CORS matches `storage.cors.json` (the web app reads photo bytes with an XHR from the hosting
  origins). Apply with `gcloud storage buckets update gs://buildhybridai-2026-yg3m.firebasestorage.app
  --cors-file=storage.cors.json` and read back with `gcloud storage buckets describe ... --format=json`: the
  `cors_config` must equal the file. CORS is not access control; the Storage rules still decide every read.
- [ ] Every callable answers with its own JSON, not Cloud Run's HTML 401: firebase-tools grants a callable's
  public invoker (`roles/run.invoker` for `allUsers`) only when it creates the function, so a function whose
  first create failed needs `gcloud run services get-iam-policy <service>` checked after the retry.
