# Limits

What Point Last Seen does not do, or does only partly. This file grows as limits are found;
each line says what the limit is and why.

## Release builds

- The public Android APK is the Play Integrity release build only. The debug build carries an App Check
  debug provider and must never be published. `android/scan-apk.sh` runs on the exact signed APK inside
  `release.sh` and must report 0 hits for debug tokens, token resources, `FIREBASE_APPCHECK_DEBUG_TOKEN`
  and the debug provider (the debug APK reports 5).

## Media retention

- Any member of an incident can create a link to its photos and clips that works without signing in, until
  the file is deleted. Firebase Storage gives a member a download token whenever they read a file's details,
  and the link built from it skips the security rules. Measured on 2026-11-18: after an admin removed a
  clip's token, the member's next read of its details created a new one. The apps never make these links
  (the rules gate fails on any download-URL call in web, iOS or Android code), but a member who calls the
  Storage API directly can.
- Drill media (clips, photos, packs) is deleted 30 days after upload by the bucket lifecycle rule in
  `storage.lifecycle.json` (applied and read back 2026-11-18). The project was created 2026-11-17, so no
  upload can be deleted before 2026-12-17, after judging ends.
- When a judge sandbox ends, the security rules stop every signed-in read and write of its data and media
  at once. Its files are deleted within 15 minutes of the end by `deleteIncidentMedia`; that function is
  PLANNED and being built now. Until it ships, a sandbox's media lasts up to 30 days, and so does any link
  made during the sandbox.
