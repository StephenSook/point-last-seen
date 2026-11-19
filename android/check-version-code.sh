#!/usr/bin/env bash
# Checks that a built APK's versionCode is the HEAD commit's time (epoch seconds), so every newer
# build installs as an update over an older one. Usage: bash android/check-version-code.sh <apk>
# Exit 0 when it matches, 1 when it does not, 2 when the APK or the tools cannot be read.
set -uo pipefail
apk="${1:?usage: check-version-code.sh <apk>}"
[ -f "$apk" ] || { echo "check-version-code: no APK at $apk"; exit 2; }
aapt2="${ANDROID_HOME:-$HOME/Library/Android/sdk}/build-tools/37.0.0/aapt2"
[ -x "$aapt2" ] || { echo "check-version-code: aapt2 not found"; exit 2; }
want="$(git -C "$(dirname "$0")" log -1 --format=%ct)"
[ -n "$want" ] || { echo "check-version-code: no HEAD commit time"; exit 2; }
badging="$(mktemp)"
trap 'python3 -I -c "import os,sys; os.remove(sys.argv[1])" "$badging"' EXIT
"$aapt2" dump badging "$apk" > "$badging" || { echo "check-version-code: aapt2 could not read $apk"; exit 2; }
got="$(sed -n "s/.*versionCode='\([0-9]*\)'.*/\1/p" "$badging" | head -1)"
if [ "$got" != "$want" ]; then
  echo "check-version-code: versionCode is ${got:-missing}, want the HEAD commit time $want"
  exit 1
fi
echo "check-version-code: versionCode $got is the HEAD commit time"
