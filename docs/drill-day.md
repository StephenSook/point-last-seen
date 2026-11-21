# Drill day: Kennesaw Mountain

The drill incident is `drill-kennesaw-1`: teams T1, T2 and T3 on the `kennesaw-mountain-drill` grid, south of Dallas
Highway. It holds made-up drill data. Nobody is missing. This page covers the searchers' iPhones, the paper each team
carries, and how the finished run reaches the judge page.

## 1. Checked before the drill

- The assignment sheet (ICS 204-shaped) and the radio cards render the drill's teams and real segment ids from its
  grid, with the training line. A unit test pins this (`web/src/extras/print/kennesawPaper.test.ts`).
- Each assignment sheet prints on exactly one Letter page. A sheet holds up to five teams, so T1 to T3 fit on one
  sheet. A browser check prints each case to PDF and counts its pages, including tasks long enough to wrap.
- One radio card per team, two cards per page, each with the training line, the team, its segments and its task, and
  the map match code spelled out letter by letter.

## 2. Before leaving signal: each searcher's iPhone

1. With the phone plugged into the Mac, check its build. Note the phone's identifier from the first command; the second
   must say build 8 (commit 8dfa5358). The app itself shows only "App version 0.1.0", not the build.

   ```
   xcrun devicectl list devices
   xcrun devicectl device info apps --device <phone-id> --bundle-id app.pointlastseen.field
   ```

2. Open **Ready check** (top right). Under "Before you leave signal", every row must read ready: "Signed in"; "Pack:
   loaded"; "App version 0.1.0: current"; "On-device model: ready (AFM 3 Core Advanced)". If the model row says Apple
   Intelligence is off or still downloading, fix that in Settings while there is signal.
   If a phone's model row still does not read ready before leaving signal, write down which phone and why (for example
   "Apple Intelligence still downloading"): that phone's reports are read in the cloud when cloud reading is on and it
   has signal, and by its rules otherwise, and the note explains a missing on-device count after the drill.
3. Tap **Allow location** and allow it.
4. On the first start of a drill, iOS asks "Allow Live Activities from Point Last Seen?". Tap **Allow** while there is
   still signal, so the lock screen shows the team's status: "Training drill. Nobody is missing.", "Your segments:
   ..." and "All reports delivered." (`ios/PLSWidgets/TaskLiveActivity.swift`).
5. Set **Allow cloud reading** in Ready check. On: when Apple's model is not available, does not support the phone's
   language, or the report is too long for it, Google's model reads the report (phone numbers removed) while there is
   signal. A report Apple's model refuses, cannot parse or takes too long on is not sent: the phone tries a plainer read
   or its rules instead. Off: every report stays on the phone (Apple's model, then the phone's rules). Stephen's
   iPhone: on for this drill, so the drill shows the cloud route in those cases. Volunteers' phones: their own
   choice. The switch is off by default and is not saved, so after any relaunch (a
   force-quit, a phone restart or a reinstall), open Ready check and turn it back on. The cloud route needs iOS 27;
   on iOS 26 it is off whatever the switch says.
6. For filming, turn on **Say in words where each report was read (for filming)** under **Show sources**.
7. Optional, in a practice drill only: **Ready check**, then **Check both read routes**. It saves a route-check file
   (section 5). Ready check also offers it in any drill or judge incident, including `drill-kennesaw-1`; do not run it
   there, because its cloud route sends the reader's tools, the person's description included.

## 3. Drill morning: print each team's paper

Do this after command approves plan v1 on the command post. The Plan panel says "Approved as plan v1. Sent."

The drill printer reported low ink: print a test page on Saturday, and if it fails, print at a library.

1. On the command post, open **More**, then **Print assignment sheet**.
2. Check the pre-filled Date From and Time From. Fill Branch, Division, Group or Staging Area only if the drill uses
   them. The box **Print the person's names and approach notes** is off. Tick it when teams should carry the names
   the person answers to (for example "Answers to Roberta (also Bea, Mom)") and how to approach them: a person may
   answer only to an old name. Paper leaves the app, so leave it off unless the search lead wants it.
3. Press **Print**. In the printer dialog, set:
   - Destination: the printer.
   - Paper size: Letter.
   - Margins: Default.
   - Scale: Default (100%). Not "Fit to page".
   - Background graphics: on.
   - Two-sided: off. A printer that defaults to two-sided puts two teams' sheets back to back.
   - Headers and footers: off. With them on, the browser adds the page address and date to the page.
4. Check the printout before handing it out:
   - One page per sheet. The footer reads "IAP Page 1 of 1".
   - Block 7 starts "Training drill. Nobody is missing. Do not dial 911."
   - The match code in block 7 is the code in the command post header, labelled Radio check.
5. Open **More**, then **Print radio cards**. The same box is on this page, also off; tick it to put the names and
   approach notes on every card. Print with the same settings, and cut along the dashed line. Give each team its own
   card.
6. Open **More**, then **Print debrief sheets**. It prints one Letter page per segment of the approved plan, with the
   team and the segment typed, then two blank sheets for a sweep the plan did not name. Print with the same settings
   and give each team its sheets. After its sweep, a team fills in its sheet in BLOCK CAPITALS, ticks one coverage box,
   and writes no one's name or phone number on it. Command reads the sheet at the command post and checks every field
   before it is saved.
7. During the drill, a team reads its match code over the radio, one character at a time. Command types it into
   **More**, then **Check a radio code**. "Same map" means the team and command see the same prior version and the
   same reports.
8. If command approves a new plan, print again: the paper names the plan version it was printed for.

## 4. After the drill: publish the run to the judge page

The judge page replays the published run. To replace the development run with the drill's run:

1. Sign in to gcloud as a project member. The exporter reads the incident with that sign-in. It never writes to the
   incident.
2. From the repository root, run:

   ```
   python3 -I tools/extras/publish_drill_run.py --incident drill-kennesaw-1 --date 2026-11-22 --place "Kennesaw Mountain"
   ```

   It exports the incident with the run exporter, labelled "REAL DRILL, Kennesaw Mountain, 2026-11-22". The exporter
   refuses a run that breaks the public run's rules and writes nothing. If it refuses, it prints each breach; fix
   the cause and run it again. The script then replaces `web/public/evidence/published-run.json`, re-pins
   `web/src/extras/replay/publishedRun.expect.json`, and runs the replay's check. It never commits, pushes or deploys.
3. Compare the printed `endCode` with the match code on the live command post for `drill-kennesaw-1`. They must
   match. If they do not, stop: a report may have arrived after the export, or one may still be on its way.
4. Commit the two files on a branch, open a pull request, run `bash scripts/ci-local.sh`, merge, and deploy hosting.
5. On the judge page, check:
   - The replay shows "REAL DRILL, Kennesaw Mountain, 2026-11-22" under "Watch the drill replay".
   - Its last frame shows the same match code.
   - The space-time view appears only if the run passes its gate: four or more positioned reports, and one report
     that waited a minute or more for signal.

## 5. After the drill: pull each iPhone's files

Do this with the Mac before anything else touches the phone. Installing over USB keeps the app's data, but deleting
the app or ending a practice drill removes it, so do not reinstall before pulling. `<phone-id>` is the identifier from
`xcrun devicectl list devices`.

1. List what is there:

   ```
   xcrun devicectl device info files --device <phone-id> --domain-type appDataContainer --domain-identifier app.pointlastseen.field --subdirectory "Library/Application Support"
   ```

2. Copy the report outbox (the reports this phone sent or still holds). A practice drill keeps its own outbox at
   `Library/Application Support/PLS-practice/outbox.json` while it runs.

   ```
   xcrun devicectl device copy from --device <phone-id> --domain-type appDataContainer --domain-identifier app.pointlastseen.field --source "Library/Application Support/PLS/outbox.json" --destination <folder>/outbox.json
   ```

3. Copy a route-check file, if section 2's step 7 made one. Its name is shown on screen after "Saved".

   ```
   xcrun devicectl device copy from --device <phone-id> --domain-type appDataContainer --domain-identifier app.pointlastseen.field --source Documents/route-check-<number>.json --destination <folder>/route-check-<number>.json
   ```

4. The outbox holds the drill's report text, with phone numbers already removed. Read it before any of it goes into
   the repository, and never commit it raw.

## 6. The role-player's GPS track and each team's closest pass

Do this only if the person playing the missing person carried a GPS logger (or a phone app that records a track).
The track itself is that person's location: it stays on this computer, outside the repository, and is never committed
or published unless the person gives written consent to publish it. Only each team's closest pass goes on the judge
page.

Before the drill:

1. The role-player agrees, before the drill, that each team's closest-pass distance (rounded to the nearest 10 m, and
   "within 10 m" when nearer) and its time will be published on the judge page. The track itself never is.
2. Set the logger to record a point at least every 5 seconds and to export GPX. Start it before the drill starts.
3. Write down the drill's start and end times with the time zone, for example `2026-11-22T13:00:00-05:00`.

After the drill, once section 4 has replaced the published run:

1. Copy the GPX file into a folder outside the repository whose name ends in `.local`, for example
   `~/pls-tracks.local/`. The tool refuses to write the track anywhere inside the repository, where a build could
   serve it or a commit could take it.
2. From the repository root, run (use the run id section 4 printed):

   ```
   python3 -I tools/extras/import_track.py --gpx ~/pls-tracks.local/<file>.gpx \
       --grid shared/grid/kennesaw-mountain-drill.grid.json --run web/public/evidence/published-run.json \
       --from <start> --to <end> --source gps-logger \
       --track-out ~/pls-tracks.local/<runId>.track.json \
       --passes-out web/public/extras/passes/<runId>.passes.json
   ```

   It keeps only points inside the drill grid (plus 200 m) and inside the window, so the drive to the park never
   reaches a file. Its last line says how many points it kept and dropped, and how many teams have a pass.
3. If it stops on a jump ("reached at ... m/s"), the logger lost its fix there. Delete that point from a copy of the
   GPX file and run it again. If it stops for another reason, it says why and writes nothing.
4. Check that the passes file holds no place: `grep -c '"lat"' web/public/extras/passes/<runId>.passes.json` must
   print 0. Commit the passes file with the published run. Never commit the track or the GPX file.
5. On the judge page, under "Watch the drill replay", "Closest passes" lists one line per team: how far its nearest
   report was from the role-player, rounded to the nearest 10 m ("within 10 m" when nearer), and when. Teams carried no logger, so a pass is measured only at the moments a
   team sent a report placed by its phone's GPS.
6. For the debrief, open the drill's replay on the command post, and choose "Load a GPS track from this computer" with
   `~/pls-tracks.local/<runId>.track.json`. The path walked so far follows the slider. Nothing is uploaded.
