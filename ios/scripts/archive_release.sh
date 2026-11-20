#!/usr/bin/env bash
# Archives a Release build of the iPhone app and exports the .ipa for App Store Connect into a local
# folder. It uploads nothing. Then it checks the exported app: release push and App Attest
# entitlements, the icon, the privacy manifest, the encryption answer, the build number and commit,
# and that the debug-only eval screen is not in it.
#
# Usage: bash ios/scripts/archive_release.sh <build-number> <out-dir>
# Needs Xcode signed in to the developer team (automatic signing creates any missing profile).
set -euo pipefail
if [ "$#" -ne 2 ]; then echo "usage: bash ios/scripts/archive_release.sh <build-number> <out-dir>" >&2; exit 64; fi
build=$1
out=$(cd "$2" && pwd)
team=Y8XVCMLQCZ
cd "$(git rev-parse --show-toplevel)"
commit=$(git rev-parse HEAD)
if ! git diff --quiet HEAD -- ios ':(exclude)ios/PLSCore/Package.resolved'; then
  echo "archive_release: ios/ has uncommitted changes; the build would not match its commit" >&2
  exit 1
fi
(cd ios && xcodegen generate --spec project.yml --quiet)

xcodebuild -project ios/PLS.xcodeproj -scheme PLS -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$out/PLS.xcarchive" -allowProvisioningUpdates DEVELOPMENT_TEAM=$team \
  CURRENT_PROJECT_VERSION="$build" PLS_BUILD_COMMIT="$commit" archive > "$out/archive.log" 2>&1
echo "archive_release: archived build $build from $commit"

cat > "$out/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>$team</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST
xcodebuild -exportArchive -archivePath "$out/PLS.xcarchive" -exportPath "$out/export" \
  -exportOptionsPlist "$out/ExportOptions.plist" -allowProvisioningUpdates > "$out/export.log" 2>&1
ipa="$out/export/PLS.ipa"
[ -f "$ipa" ] || { echo "archive_release: no PLS.ipa exported" >&2; exit 1; }

# Check what was exported, not what was asked for.
check="$out/check"
rm -rf "$check"; mkdir -p "$check"
ditto -x -k "$ipa" "$check"
app="$check/Payload/PLS.app"
fail=0
ent=$(codesign -d --entitlements :- "$app" 2>/dev/null)
want() { if ! printf '%s' "$2" | grep -q "$3"; then echo "archive_release: FAIL $1"; fail=1; else echo "archive_release: ok $1"; fi; }
want "push entitlement is production" "$ent" "<key>aps-environment</key>[[:space:]]*<string>production</string>"
want "App Attest is production" "$ent" "<key>com.apple.developer.devicecheck.appattest-environment</key>[[:space:]]*<string>production</string>"
info() { /usr/libexec/PlistBuddy -c "Print :$1" "$app/Info.plist" 2>/dev/null || true; }
[ "$(info CFBundleVersion)" = "$build" ] && echo "archive_release: ok build number $build" || { echo "archive_release: FAIL build number"; fail=1; }
[ "$(info PLSBuildCommit)" = "$commit" ] && echo "archive_release: ok commit recorded" || { echo "archive_release: FAIL commit"; fail=1; }
[ "$(info ITSAppUsesNonExemptEncryption)" = "false" ] && echo "archive_release: ok encryption answer" || { echo "archive_release: FAIL encryption answer"; fail=1; }
[ "$(info CFBundleIcons:CFBundlePrimaryIcon:CFBundleIconName)" = "AppIcon" ] && echo "archive_release: ok icon" || { echo "archive_release: FAIL icon"; fail=1; }
[ -f "$app/PrivacyInfo.xcprivacy" ] && echo "archive_release: ok privacy manifest" || { echo "archive_release: FAIL privacy manifest"; fail=1; }
if strings "$app/PLS" | grep -q "Report-reading eval"; then echo "archive_release: FAIL the debug eval screen is in the release"; fail=1
else echo "archive_release: ok no debug eval screen"; fi
codesign --verify --deep --strict "$app" && echo "archive_release: ok signature" || { echo "archive_release: FAIL signature"; fail=1; }
exit $fail
