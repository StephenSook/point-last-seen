# Family app accessibility, 2026-11-18

Debug build of lane-android on the `pls_phone` emulator (Android 17, API 37).

## What the tests check (all pass: 87 instrumented tests)

- **Accessibility Test Framework (ATF 4.1.1) on every UI test.** All 13 screen and flow test
  classes call `rule.enableAccessibilityChecks()`, so ATF checks contrast, touch-target size,
  speakable text and duplicate descriptions on every tap and assertion
  (`android/app/src/androidTest/.../ui/*Test.kt`).
- **Every screen state audited** (`AccessibilityChecksTest`, 16 states: every screen plus
  error, drill, read and 911-script states). Each tappable node is scrolled into view in turn,
  and the test fails on any ATF result, any tappable node with nothing for TalkBack to say, or a
  touch area under 48 dp.
- **Font scale 2.0** (`FontScaleTest`): call-first, status, note consent and sighting. Fails
  on text cut at the bottom, ellipsized, with a line wider than its space, or past the screen
  edge, and on any main action that cannot be scrolled to and seen. A control proves the check
  catches a text cut to one line.

## What ATF found, and the fix

- The profile's toggle rows ("Share the type with searchers", "They may have a car" and the
  checkbox rows for what searchers should know) laid out under 48 dp. The checkbox rows sit
  close together, so their touch areas could only grow to 40 dp: "This item's height is 40dp.
  Consider making the height of this touch target 48dp or larger" (TouchTargetSizeCheck).
  Each row now has a 48 dp minimum height (commit 17e94b9).
- Nothing else: no contrast, speakable-text or duplicate-description results on any screen.

## TalkBack labels

- Every tappable node has spoken text, by test (above) and on the running app: a
  `uiautomator` dump of the status screen gives six controls, each with its own label: "Share a
  camera clip", "Add recent photos", "I remembered something", "Someone saw them", "Edit
  profile", "About this phone".
- The only non-text content is the key frame image on a clip read ("Key frame from the clip")
  and the status ring, which is a fixed decoration and hidden from TalkBack on purpose.
- The app sets no accessibility hints or custom state descriptions, so there is no hint that
  can describe something a control does not do (the pattern of an earlier iPhone VoiceOver bug).

## Font scale 2.0 on the running app

`font-scale-2-*.png`: the four key screens with the system font scale at 2.0 (set with
`adb shell settings put system font_scale 2.0`, reset to 1.0 after). Long labels wrap inside
their buttons and chips; nothing is cut off. The join code was typed between screenshots and is
in none of them (OCR over the four images: 0 hits; control text read in all four).

Not checked: a person using TalkBack by ear on a real phone.
