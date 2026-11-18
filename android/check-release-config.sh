#!/usr/bin/env bash
# Checks what a built APK ships, from its own BuildConfig: the offline 911 script screen must be
# on (BuildConfig.SCRIPT_911 = true). release.sh runs it on the exact signed file.
# Exit 0 when it is on, 1 when it is off or missing, 2 when the check cannot run.
set -euo pipefail
apk="${1:?usage: check-release-config.sh <apk>}"
[ -s "$apk" ] || { echo "check-release-config: no such APK: $apk" >&2; exit 2; }
aa="${ANDROID_HOME:-$HOME/Library/Android/sdk}/cmdline-tools/latest/bin/apkanalyzer"
[ -x "$aa" ] || { echo "check-release-config: apkanalyzer not found at $aa" >&2; exit 2; }
code="$("$aa" dex code --class app.pointlastseen.family.BuildConfig "$apk")" || { echo "check-release-config: could not read BuildConfig" >&2; exit 2; }
if printf '%s\n' "$code" | grep -q 'SCRIPT_911:Z = true'; then
  echo "check-release-config: the 911 script screen is on"
  exit 0
fi
echo "check-release-config: the 911 script screen is OFF or missing in $apk" >&2
exit 1
