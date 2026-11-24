# Point Last Seen: privacy policy

Point Last Seen is a field app for search team training drills. Nobody is missing in a drill: every drill uses
made-up information. This page says what the iPhone app collects, why, and where it goes. Its section on the
command post website says what that website sends when it hits an error.

## What the app collects

- **Your reports.** The words you type or dictate into a report, and how the app read them (the kind of report,
  the segments, and which model or rule read it). Any phone number in a report is removed on the phone before the
  report is stored or read by any model.
- **Your location, if you allow it.** Only while the app is open, and only to place a report on the search map.
  You can turn it off in iPhone Settings at any time.
- **An account number.** The app signs in without a name, email or password. Firebase gives the phone an
  anonymous user number, so command can tell which team's phone sent a report.
- **The team you joined.** The join code you type connects the phone to one team in one drill.
- **Crash and performance reports.** If the app crashes or runs slowly, Firebase Crashlytics and Firebase
  Performance Monitoring send technical details (the device model, the iOS version, timings). These are not
  linked to your account number.
- **Alerts for your team.** So the phone can get an alert when its team's task changes, it subscribes to its
  team's alert topic in Firebase Cloud Messaging. Firebase holds the phone's messaging token for that; the drill's
  own database does not store it.

The app does not collect your name, email, contacts, photos or microphone audio. The keyboard's dictation key is
Apple's; the app gets only the typed text.

## How reports are read

- On your iPhone, Apple's on-device model reads each report. Nothing leaves the phone for that read.
- In the cloud, only when you turn on "Allow cloud reading" in Ready check and the phone cannot read a report:
  Google's Gemini model, through Firebase AI Logic, reads the report's words (phone numbers removed) with the
  team's segments and the drill subject's description. This is off by default and turns off again each time the
  app starts. The cloud route needs iOS 27; on iOS 26 it is never used.
- If no model can read a report, the phone reads it with fixed rules.

## Where it goes and who sees it

- Reports, the team and the account number are stored in the drill's Firebase project (Google Cloud), so the
  search's command post can see them.
- In a training drill, everyone who has joined that drill with one of its codes (the search command, every
  searcher team and the missing person's family) can read every report in it for as long as the drill stays
  open. No one who has not joined can read them.
- The data goes only to Google's Firebase services and, with cloud reading on, Google's Gemini model, which
  process it for the app. The app has no ads, does not track you across apps or websites, and does not sell your
  data or share it with anyone else.

## How long it is kept

- Drill data is deleted 30 days after the search command closes the drill. The four drills we use for
  development, judging, testing and our film are deleted on January 1, 2027, or the next day if a step has to
  be retried.
- The practice drill keeps its reports on the phone only; they are never sent. Ending the practice drill
  deletes them from the phone.

## The command post website

- **Error reports.** When the command post website hits an error it does not handle, it sends Firebase
  Crashlytics a report: the kind of error, where in the website's code it happened, a Firebase error code or HTTP
  status if there is one, the website's version, your browser's user-agent string (the browser and system names
  and versions), and random session and installation numbers that Firebase keeps in your browser. The error's own
  message is removed in your browser before the report is sent, so an error report holds none of your
  text, photos, clips or join codes, and no account number. A visit with no such error sends no report. Error reports are kept for 30 days.

## Contact

Questions, or a request to delete your data: https://github.com/StephenSook/point-last-seen/issues
Don't post personal details in an issue.

Last updated: November 23, 2026
