#!/usr/bin/env bash
# Checks the release build's App Check provider on one real phone, in one command:
#   ANDROID_SERIAL=<serial> bash android/release-probe.sh
# Before building, it stops unless the app is already installed (this is an update) and no test package is
# (one would be replaced, then removed). Then:
# 1. Builds the release test APK, then the release-signed app through release.sh (its APK scan, release config
#    check and version check run on the exact file installed). The signing password comes from the macOS
#    Keychain to the signing builds only.
# 2. Installs the app with -r: an update signed with the same release key, which keeps the app's data and does
#    not open the app.
# 3. Installs the test APK (never replacing one), runs the one ReleaseAppCheckProbeTest method, and prints its
#    PLS-PROBE lines (outcomes and error text, never a token) and the runner's result.
# 4. Removes the test package it installed, whether the probe passed or not. It removes nothing else, opens no
#    screen of the app and changes no phone setting.
# Exit 0 only when adb ran, the runner finished, the test passed and none failed, was skipped or ignored;
# 1 otherwise, or when the test package could not be removed. PLS_PROBE_SKIP_BUILD=1 reuses built APKs.
set -euo pipefail
# Tracing would print the signing password: it stays off in this script.
{ set +x; } 2>/dev/null
unset PLS_RELEASE_PASSWORD
: "${ANDROID_SERIAL:?set ANDROID_SERIAL to the phone serial from adb devices}"
cd "$(dirname "$0")"
adb="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
app=app/build/outputs/apk/release/app-release.apk
tests=app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
app_pkg=app.pointlastseen.family
test_pkg=app.pointlastseen.family.test
probe=app.pointlastseen.family.live.ReleaseAppCheckProbeTest#theReleaseProviderGetsATokenAndACloudCallIsAccepted

installed() {
  "$adb" -s "$ANDROID_SERIAL" shell pm list packages "$1" | tr -d '\r' | grep -qx "package:$1"
}

if ! installed "$app_pkg"; then
  echo "release-probe: $app_pkg is not installed on $ANDROID_SERIAL; this probe only updates an installed app"
  exit 1
fi
if installed "$test_pkg"; then
  echo "release-probe: $test_pkg is already installed on $ANDROID_SERIAL; remove it first (adb uninstall $test_pkg)"
  exit 1
fi

if [ "${PLS_PROBE_SKIP_BUILD:-0}" != 1 ]; then
  service="${PLS_RELEASE_KEYCHAIN_SERVICE:-pls-android-release}"
  password="$(security find-generic-password -w -s "$service")"
  PLS_RELEASE_PASSWORD="$password" ./gradlew --no-configuration-cache -Ppls.testBuildType=release assembleReleaseAndroidTest
  unset password
  # Last, so its checks run on the app file this script installs.
  bash release.sh
fi
if [ ! -f "$app" ] || [ ! -f "$tests" ]; then
  echo "release-probe: missing $app or $tests"
  exit 1
fi

# shellcheck disable=SC2329 # called by the EXIT trap below
remove_tests() {
  if ! installed "$test_pkg"; then
    return 0
  fi
  if "$adb" -s "$ANDROID_SERIAL" uninstall "$test_pkg" >/dev/null 2>&1 && ! installed "$test_pkg"; then
    echo "release-probe: test package removed"
    return 0
  fi
  echo "release-probe: could not remove $test_pkg; remove it with: adb -s $ANDROID_SERIAL uninstall $test_pkg"
  return 1
}
# shellcheck disable=SC2329 # called by the EXIT trap below
on_exit() {
  local rc=$?
  remove_tests || rc=1
  exit "$rc"
}
# Armed before any install: an install that lands just before an interruption is still removed.
trap on_exit EXIT

"$adb" -s "$ANDROID_SERIAL" install -r "$app"
"$adb" -s "$ANDROID_SERIAL" install -t "$tests"

start="$("$adb" -s "$ANDROID_SERIAL" shell date +%s | tr -d '\r')"
set +e
out="$("$adb" -s "$ANDROID_SERIAL" shell am instrument -w -r -e class "$probe" "$test_pkg/androidx.test.runner.AndroidJUnitRunner" 2>&1 | tr -d '\r')"
adb_rc=$?
set -e
"$adb" -s "$ANDROID_SERIAL" logcat -d -s PLS-PROBE:I -T "$start.000" || true
printf '%s\n' "$out" | grep -E '^(INSTRUMENTATION_RESULT|INSTRUMENTATION_CODE|OK \(|FAILURES|Tests run)' || true
# Status codes per test: 1 started, 0 passed, -2 failed, -3 ignored, -4 skipped by an assumption.
codes="$(printf '%s\n' "$out" | sed -n 's/^INSTRUMENTATION_STATUS_CODE: //p')"
if [ "$adb_rc" -eq 0 ] \
  && printf '%s\n' "$out" | grep -qx 'INSTRUMENTATION_CODE: -1' \
  && printf '%s\n' "$codes" | grep -qx '0' \
  && ! printf '%s\n' "$codes" | grep -qxE -- '-2|-3|-4'; then
  echo "release-probe: passed"
  exit 0
fi
echo "release-probe: failed"
exit 1
