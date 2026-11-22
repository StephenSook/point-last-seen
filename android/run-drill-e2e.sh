#!/usr/bin/env bash
# Runs live device tests against the deployed project and the drill incident:
#   ANDROID_SERIAL=emulator-5554 bash android/run-drill-e2e.sh [test classes, comma-separated]
# Default: DrillE2ETest and ClipRulesLiveTest. The tests write, so they run against the test-only
# incident drill-test-1, never the judge seed incident, whose shared profile seeds judge searches
# (PLS_DRILL_INCIDENT picks another incident's family code). The drill family's join code goes from the macOS
# Keychain to a file on the device through a pipe, so it is never a command-line argument on this
# Mac or on the device; only the file's path is passed to the tests. The file is removed afterwards.
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_SERIAL:?set ANDROID_SERIAL to the device to test on}"
adb="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
classes="${1:-app.pointlastseen.family.live.DrillE2ETest,app.pointlastseen.family.live.ClipRulesLiveTest}"
incident="${PLS_DRILL_INCIDENT:-drill-test-1}"
# The tests write, and real families and judges join the judge seed incident, so it is refused before its code is read.
# Its id comes from shared/constants/judge-seed.json, so a renamed seed stays refused; an unreadable file refuses too.
seed="$(python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))["incidentId"])' ../shared/constants/judge-seed.json)" || seed=""
if [ -z "$seed" ] || [ "$incident" = "$seed" ]; then
  echo "run-drill-e2e: refusing incident '$incident': it is the judge seed incident (or the seed id could not be read); the live tests write, so run them on the test incident" >&2
  exit 2
fi
file=/data/local/tmp/pls-drill-code
trap '"$adb" shell "unlink $file" > /dev/null 2>&1 || true' EXIT
security find-generic-password -w -s pls-drill-family-code -a "$incident" | "$adb" shell "umask 077; cat > $file"
./gradlew -q :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class="$classes" \
  -Pandroid.testInstrumentationRunnerArguments.notAnnotation=androidx.test.filters.FlakyTest \
  -Pandroid.testInstrumentationRunnerArguments.plsJoinCodeFile="$file"
