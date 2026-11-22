# One rehearsal family push on a Samsung A16, 2026-11-22

One push, measured once (n=1). This is one rehearsal, not a typical latency.

- **Phone:** Samsung A16 (SM-A166U), Android 16, on USB to a Mac.
- **App:** the `android-judge-5` release file, `point-last-seen-family-8fcc0803.apk` (SHA-256
  `e4e982021176e987b0b278c574c72d61e55c0ca1d8a7052710bd627bdc6d3cb9`, versionCode 1795339691), read from the
  installed `base.apk`.
- **Search:** the drill incident `drill-kennesaw-1`. The app joined it as family at 20:36:06Z, through the app's
  own join call. The join code was read from a file on the phone and was never typed or shown (local evidence,
  not in the repo).
- **Phone state:** notifications allowed for the app, Do Not Disturb off. The app was in the background: Home was
  pressed at 20:40:22Z and the launcher was on top. No phone setting was changed.

| Step | Time (UTC) | Read from |
|---|---|---|
| The search lead's question reached the server | 20:43:35.517Z | the question document's `createdAt` |
| The document was committed | 20:43:35.559Z | the document's create time |
| The notice was posted on the phone | 20:43:39.867Z | the phone's notification record (`pde_enqueued_time_ms`) |

From the commit to the notice on the phone: **4.31 s**. This covers the server function's trigger and the
delivery by Firebase Cloud Messaging.

- **What the phone showed:** channel `assignments`, title "Training drill", text "The search lead has a question."
  The notice carries no question text: the app reads the question from Firestore when it opens.
- **Clock check:** the phone's clock was 4 ms behind the Mac's UTC clock in the same read, so the times above are
  within about 0.1 s.
- **Count:** one question document on the incident, so one push. The question was left unanswered.
- **Not measured:** the app in the foreground, a locked screen, a second push, or any other phone or network.
