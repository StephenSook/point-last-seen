#!/usr/bin/env bash
# Runs live device tests against the deployed project and the drill incident:
#   ANDROID_SERIAL=emulator-5554 bash android/run-drill-e2e.sh [test classes, comma-separated]
# Default: DrillE2ETest and ClipRulesLiveTest. The tests write, so they run against the test-only
# incident drill-test-1, never drill-dev-1, whose shared profile seeds judge searches
# (PLS_DRILL_INCIDENT picks another incident's family code). The drill family's join code goes from the macOS
# Keychain to a file on the device through a pipe, so it is never a command-line argument on this
# Mac or on the device; only the file's path is passed to the tests. The file is removed afterwards.
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_SERIAL:?set ANDROID_SERIAL to the device to test on}"
adb="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
classes="${1:-app.pointlastseen.family.live.DrillE2ETest,app.pointlastseen.family.live.ClipRulesLiveTest}"
incident="${PLS_DRILL_INCIDENT:-drill-test-1}"
file=/data/local/tmp/pls-drill-code
trap '"$adb" shell "unlink $file" > /dev/null 2>&1 || true' EXIT
security find-generic-password -w -s pls-drill-family-code -a "$incident" | "$adb" shell "umask 077; cat > $file"
./gradlew -q :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class="$classes" \
  -Pandroid.testInstrumentationRunnerArguments.notAnnotation=androidx.test.filters.FlakyTest \
  -Pandroid.testInstrumentationRunnerArguments.plsJoinCodeFile="$file"
