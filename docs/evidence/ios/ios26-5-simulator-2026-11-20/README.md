# The iPhone app on an iOS 26.5 simulator, 2026-11-20

The iPhone app built with its deployment target at iOS 26.0, run on an iPhone 17 Pro simulator with the iOS 26.5
runtime (23F77) on a Mac, in a debug build with the App Check debug provider.

- The app's test suite: 203 tests passed. The four tests of iOS 27 error types were skipped there ("Requires iOS
  27"), as marked.
- The reader on the same 10 drill sentences used for the simulator checks on iOS 27: Apple's model reported itself
  available, but every read failed at once with an error from Foundation Models whose underlying error says the
  simulator runtime has no model assets ("There are no underlying assets"). Each report was then read by the app's
  rules, as the reader does when no model can read. No read went to the cloud: on iOS 26 the cloud route is off.

What this shows: the app installs, runs its tests and reads every report on iOS 26, and it never reaches the cloud
there. What it does not show: a read by Apple's model on iOS 26. The simulator has no model to run; that needs a
real phone on iOS 26 with Apple Intelligence turned on.
