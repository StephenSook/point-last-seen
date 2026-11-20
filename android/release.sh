#!/usr/bin/env bash
# Builds the release-signed family APK. The keystore path is in the untracked
# local.properties (pls.release.storeFile); the password comes from the macOS
# Keychain (service pls-android-release) into the signing build only, and the build
# runs without the configuration cache so the password is never cached on disk.
set -euo pipefail
# Tracing would print the password: it stays off in this script, and no inherited copy reaches the checks below.
{ set +x; } 2>/dev/null
unset PLS_RELEASE_PASSWORD
cd "$(dirname "$0")"
service="${PLS_RELEASE_KEYCHAIN_SERVICE:-pls-android-release}"
password="$(security find-generic-password -w -s "$service")"
# Only the signing build gets it: a prefix assignment, never exported to the checks and never on a command line.
PLS_RELEASE_PASSWORD="$password" ./gradlew --no-configuration-cache assembleRelease
unset password
apk=app/build/outputs/apk/release/app-release.apk
"${ANDROID_HOME:-$HOME/Library/Android/sdk}/build-tools/37.0.0/apksigner" verify --print-certs "$apk"
# The public APK is this Play Integrity release build, never a debug build, which
# carries its App Check debug token in its resources. Scan the exact signed file.
./scan-apk.sh "$apk"
# The offline 911 script screen ships: check the exact signed file says so.
./check-release-config.sh "$apk"
# A newer release must install as an update over an older one: versionCode is the HEAD commit time.
./check-version-code.sh "$apk"
echo "release APK: $apk"
