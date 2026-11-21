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
# Exit 0 only when the runner finished with exactly that one test started and passed; 1 otherwise, or when the
# test package this run installed could not be removed. One run per phone at a time (a lock in /tmp).
# The note call prefers the phone's own model: a phone that answers it on the phone fails this probe (it logs
# source=ON_DEVICE), never passes it. PLS_PROBE_SKIP_BUILD=1 reuses built APKs.
set -euo pipefail
# Tracing would print the signing password: it stays off in this script.
{ set +x; } 2>/dev/null
unset PLS_RELEASE_PASSWORD
: "${ANDROID_SERIAL:?set ANDROID_SERIAL to the phone serial from adb devices}"
# One probe per phone at a time: a second run stops at once instead of replacing or removing the first's package.
if [ -z "${PLS_PROBE_LOCKED:-}" ]; then
  PLS_PROBE_LOCKED=1 exec lockf -t 0 "/tmp/pls-release-probe-$ANDROID_SERIAL.lock" bash "$0" "$@"
fi
cd "$(dirname "$0")"
adb="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
app=app/build/outputs/apk/release/app-release.apk
tests=app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
app_pkg=app.pointlastseen.family
test_pkg=app.pointlastseen.family.test
probe=app.pointlastseen.family.live.ReleaseAppCheckProbeTest#theReleaseProviderGetsATokenAndACloudCallIsAccepted

# Prints present or absent; fails when the phone cannot be asked (that proves neither).
package_state() {
  local out
  out="$("$adb" -s "$ANDROID_SERIAL" shell pm list packages "$1")" || return 1
  if printf '%s\n' "$out" | tr -d '\r' | grep -Fqx "package:$1"; then echo present; else echo absent; fi
}

app_state="$(package_state "$app_pkg")" || { echo "release-probe: could not ask $ANDROID_SERIAL for its packages"; exit 1; }
if [ "$app_state" != present ]; then
  echo "release-probe: $app_pkg is not installed on $ANDROID_SERIAL; this probe only updates an installed app"
  exit 1
fi
test_state="$(package_state "$test_pkg")" || { echo "release-probe: could not ask $ANDROID_SERIAL for its packages"; exit 1; }
if [ "$test_state" != absent ]; then
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

# Whether this run's test install was attempted: only then is the package this run's to remove.
tests_attempted=0
result=failed
# shellcheck disable=SC2329 # called by the EXIT trap below
remove_tests() {
  [ "$tests_attempted" = 1 ] || return 0
  local state
  state="$(package_state "$test_pkg")" || { echo "release-probe: could not check $test_pkg on $ANDROID_SERIAL; remove it by hand if it is there"; return 1; }
  [ "$state" = present ] || return 0
  "$adb" -s "$ANDROID_SERIAL" uninstall "$test_pkg" >/dev/null 2>&1 || true
  state="$(package_state "$test_pkg")" || { echo "release-probe: could not check that $test_pkg was removed from $ANDROID_SERIAL"; return 1; }
  if [ "$state" = absent ]; then
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
  # The verdict comes last, after the clean-up that can still turn a pass into exit 1.
  if [ "$rc" -eq 0 ] && [ "$result" = passed ]; then echo "release-probe: passed"; else echo "release-probe: failed"; rc=1; fi
  exit "$rc"
}
# Armed before any install: an install that lands just before an interruption is still removed.
trap on_exit EXIT

app_state="$(package_state "$app_pkg")" || { echo "release-probe: could not ask $ANDROID_SERIAL for its packages"; exit 1; }
if [ "$app_state" != present ]; then
  echo "release-probe: $app_pkg is no longer installed on $ANDROID_SERIAL"
  exit 1
fi
"$adb" -s "$ANDROID_SERIAL" install -r "$app"
tests_attempted=1
"$adb" -s "$ANDROID_SERIAL" install -t "$tests"

start="$("$adb" -s "$ANDROID_SERIAL" shell date +%s | tr -d '\r')"
set +e
out="$("$adb" -s "$ANDROID_SERIAL" shell am instrument -w -r -e class "$probe" "$test_pkg/androidx.test.runner.AndroidJUnitRunner" 2>&1 | tr -d '\r')"
run_rc=$?
set -e
"$adb" -s "$ANDROID_SERIAL" logcat -d -s PLS-PROBE:I -T "$start.000" || true
printf '%s\n' "$out" | grep -E '^(INSTRUMENTATION_RESULT|INSTRUMENTATION_CODE|OK \(|FAILURES|Tests run)' || true
# Status codes per test: 1 started, 0 passed, -1 error, -2 failed, -3 ignored, -4 skipped by an assumption.
# A pass is exactly one start and one pass of that one method, then the runner finishing normally.
codes="$(printf '%s\n' "$out" | sed -n 's/^INSTRUMENTATION_STATUS_CODE: //p' | sort | tr '\n' ' ')"
tests_seen="$(printf '%s\n' "$out" | grep -Fxc "INSTRUMENTATION_STATUS: test=${probe#*#}" || true)"
# Here-strings, not pipes: grep -q stops at its first match, and under pipefail the writer then dies of SIGPIPE.
# Piped, a found INSTRUMENTATION_FAILED read as a failed pipeline, so the negation passed a failed run.
if [ "$run_rc" -eq 0 ] \
  && [ "$codes" = "0 1 " ] \
  && [ "$tests_seen" = 2 ] \
  && grep -qx 'INSTRUMENTATION_CODE: -1' <<<"$out" \
  && ! grep -q '^INSTRUMENTATION_FAILED' <<<"$out"; then
  result=passed
fi
exit 0
