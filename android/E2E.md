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

The drill family's join code lives in the macOS Keychain (service `pls-drill-family-code`,
account `drill-dev-1`). The script pipes it into a file on the device and passes the tests only
that file's path, so the code is never a command-line argument, on the Mac or on the device. The
tests read it through the device shell and never log it. The script removes the file when it ends.

Entering the code by hand through the app's join screen on an emulator (for a demo or a manual
check) uses `adb shell input text`, which does put the code on a command line on this Mac for a
moment. That is accepted for the drill code only, which opens nothing but the synthetic drill
incident and can be rotated. Never do it with a real incident's code.
