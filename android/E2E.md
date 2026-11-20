# Live device tests (drill incident)

These tests run on a device or emulator against the deployed Firebase project and the synthetic
drill incident. They write real documents there, so they run only when asked for.

## Run

```sh
ANDROID_SERIAL=emulator-5554 bash android/run-drill-e2e.sh
```

With no argument it runs `DrillE2ETest` (join, profile, sighting, clip, photo) and
`ClipRulesLiveTest` (a sighting completion and a takeover against the clip reading rules). Pass
test classes, comma-separated, to run others.

## The join code

The live tests write, so they run against the test-only incident `drill-test-1` (same grid, teams
and segments as `drill-dev-1`), never `drill-dev-1`, whose shared profile seeds judge searches.
The family's join code lives in the macOS Keychain (service `pls-drill-family-code`, account
`drill-test-1`; `PLS_DRILL_INCIDENT` picks another account). The script pipes it into a file on the device and passes the tests only
that file's path, so the code is never a command-line argument, on the Mac or on the device. The
tests read it through the device shell and never log it. The script removes the file when it ends.

Entering the code by hand through the app's join screen on an emulator (for a demo or a manual
check) uses `adb shell input text`, which does put the code on a command line on this Mac for a
moment. That is accepted for the drill code only, which opens nothing but the synthetic drill
incident and can be rotated. Never do it with a real incident's code.

## Release build on a real phone

`release-probe.sh` checks the release build's App Check provider (Play Integrity) on one phone:

```sh
ANDROID_SERIAL=<serial from adb devices> bash android/release-probe.sh
```

One run per phone at a time (a second run stops at once). Before building, it stops unless the phone
answers, the app is already installed on it (this is an update) and no test package is. It builds the release test APK, then the signed release app through `release.sh`
(with its APK scan, release config check and version check), installs the app as an update
(`adb install -r`, which keeps the app's data and does not open it), installs the test APK without
replacing one, runs the one `ReleaseAppCheckProbeTest` method and prints its `PLS-PROBE` lines
(outcomes and error text, never a token). It then removes the test package it installed, whether the
probe passed or not, and nothing else. Exit 0 means the runner finished with exactly that one test
started and passed: the release provider got a token and the note came back from the cloud. A skipped,
ignored or failed test, any other result, or a test package it could not remove or check, exits 1. The
note call prefers the phone's own model, so a phone that answers it on the phone fails the probe (its
line says `source=ON_DEVICE`) rather than passing it. A phone with a debug build of the app refuses
the update (different signing key). An emulator fails the attestation (HTTP 403), so the probe needs a
real phone. `PLS_PROBE_SKIP_BUILD=1` reuses the APKs already built.
