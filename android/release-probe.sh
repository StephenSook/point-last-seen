#!/usr/bin/env bash
# Checks the release build's App Check provider on one real phone, in one command:
#   ANDROID_SERIAL=<serial> bash android/release-probe.sh
# 1. Builds the release test APK, then the release-signed app through release.sh (its APK scan, release config
#    check and version check run on the exact file installed). The signing password comes from the macOS
#    Keychain into this process only.
# 2. Installs the app with -r: an update signed with the same release key, which keeps the app's data and does
#    not open the app.
# 3. Installs the test APK, runs ReleaseAppCheckProbeTest alone, and prints its PLS-PROBE lines (outcomes and
#    error text, never a token) and the instrumentation result.
# 4. Uninstalls the test package it installed, whether the probe passed or not. It uninstalls nothing else,
#    opens no screen of the app and changes no phone setting.
# Exit 0 when the probe passed, 1 when it failed or could not run.
# PLS_PROBE_SKIP_BUILD=1 reuses the APKs already built in this checkout.
set -euo pipefail
: "${ANDROID_SERIAL:?set ANDROID_SERIAL to the phone serial from adb devices}"
cd "$(dirname "$0")"
adb="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
app=app/build/outputs/apk/release/app-release.apk
tests=app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
test_pkg=app.pointlastseen.family.test
probe=app.pointlastseen.family.live.ReleaseAppCheckProbeTest

if [ "${PLS_PROBE_SKIP_BUILD:-0}" != 1 ]; then
  service="${PLS_RELEASE_KEYCHAIN_SERVICE:-pls-android-release}"
  PLS_RELEASE_PASSWORD="$(security find-generic-password -w -s "$service")"
  export PLS_RELEASE_PASSWORD
  ./gradlew --no-configuration-cache -Ppls.testBuildType=release assembleReleaseAndroidTest
  unset PLS_RELEASE_PASSWORD
  # Last, so its checks run on the app file this script installs.
  bash release.sh
fi
if [ ! -f "$app" ] || [ ! -f "$tests" ]; then
  echo "release-probe: missing $app or $tests"
  exit 1
fi

"$adb" -s "$ANDROID_SERIAL" install -r "$app"
"$adb" -s "$ANDROID_SERIAL" install -r -t "$tests"
# shellcheck disable=SC2329 # called by the EXIT trap below
remove_tests() {
  if "$adb" -s "$ANDROID_SERIAL" uninstall "$test_pkg" >/dev/null 2>&1; then
    echo "release-probe: test package removed"
  else
    echo "release-probe: could not remove $test_pkg; remove it with: adb -s \$ANDROID_SERIAL uninstall $test_pkg"
  fi
}
trap remove_tests EXIT

start="$("$adb" -s "$ANDROID_SERIAL" shell date +%s | tr -d '\r')"
set +e
out="$("$adb" -s "$ANDROID_SERIAL" shell am instrument -w -e class "$probe" "$test_pkg/androidx.test.runner.AndroidJUnitRunner" 2>&1)"
set -e
"$adb" -s "$ANDROID_SERIAL" logcat -d -s PLS-PROBE:I -T "$start.000"
printf '%s\n' "$out" | grep -E '^(OK \(|FAILURES|Tests run)' || true
case "$out" in
  *"OK (1 test)"*) echo "release-probe: passed"; exit 0 ;;
  *) echo "release-probe: failed"; exit 1 ;;
esac
