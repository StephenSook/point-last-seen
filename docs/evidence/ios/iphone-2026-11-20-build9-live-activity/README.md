# iPhone Live Activity on a real phone, 2026-11-20 (build 9)

Build 9 of the iPhone app (version 0.1.0, commit 5bf58a3e, an Ad Hoc release build signed for this
phone, installed over USB over build 8 with its data kept) on an iPhone 17 Pro (iPhone18,1), iOS 27.2.1
(24B156), joined to a training drill (made-up data; nobody is missing) with segment AE assigned.

`live-activity-lock-screen.png` (1046 x 320) is the app's Live Activity on the phone's lock screen at
about 03:51 UTC on November 21 (10:51 PM Eastern on November 20). It shows the three lines the widget
draws (`ios/PLSWidgets/TaskLiveActivity.swift:12-14`):

- "Training drill. Nobody is missing."
- "Your segments: AE"
- "All reports delivered." (the status line when nothing is waiting to send,
  `ios/PLSCore/Sources/PLSCore/TaskStatus.swift:28`)

How it was captured: the phone's owner locked the phone and woke it to the lock screen; nothing else
was tapped and no setting was changed. The screenshot was taken over USB with
`xcrun devicectl device capture screenshot`, and the image was cropped inside the Live Activity's
card, so the lock screen's clock, wallpaper and notifications are not in it. The full screenshot was
deleted after cropping and is not kept anywhere.

On the first start of a drill, iOS asks "Allow Live Activities from Point Last Seen?"; the phone's
owner tapped Allow. The drill-day checklist says to do that before leaving signal.

What this does not show: the Live Activity updating as reports are sent or as the assignment changes,
or the Dynamic Island view. It is one capture on one phone, on iOS 27.
