#!/usr/bin/env bash
# Tests scan-apk.sh on real builds: the debug APK (it carries the emulator's App Check debug token
# from local.properties) must fail and name what it found; the release APK must pass; a missing
# file must exit 2. Needs the Keychain token, so it runs on this Mac, not in CI. Prints no token.
set -uo pipefail
cd "$(dirname "$0")"
fail=0
debug=app/build/outputs/apk/debug/app-debug.apk
release=app/build/outputs/apk/release/app-release.apk
[ -s "$release" ] || release=app/build/outputs/apk/release/app-release-unsigned.apk
[ -s "$debug" ] && [ -s "$release" ] || { echo "scan-apk.test: build both APKs first (assembleDebug assembleRelease)" >&2; exit 2; }

out="$(bash scan-apk.sh "$debug" 2>&1)"; rc=$?
if [ $rc -eq 1 ] && grep -q "HIT: firebase_app_check_debug_token resource has a value" <<<"$out" && grep -q "HIT: debug App Check provider in" <<<"$out"; then
  echo "ok: the debug APK is refused, naming the token resource and the debug provider"
else echo "FAIL: debug APK gave exit $rc"; fail=1; fi

bash scan-apk.sh "$release" > /dev/null 2>&1; rc=$?
if [ $rc -eq 0 ]; then echo "ok: the release APK is clean"; else echo "FAIL: release APK gave exit $rc"; fail=1; fi

bash scan-apk.sh /nonexistent.apk > /dev/null 2>&1; rc=$?
if [ $rc -eq 2 ]; then echo "ok: a missing APK exits 2"; else echo "FAIL: missing APK gave exit $rc"; fail=1; fi
# No token may travel as a command-line argument (other processes can read argv).
if grep -q 'tokens\[@\]' scan-apk.sh; then echo "FAIL: scan-apk.sh passes tokens as arguments"; fail=1; else echo "ok: no token is passed as an argument"; fi
exit $fail
