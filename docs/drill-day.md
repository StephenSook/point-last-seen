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
3. Tap **Allow location** and allow it.
4. Set **Allow cloud reading** in Ready check. On: when Apple's model is not available, does not support the phone's
   language, or the report is too long for it, Google's model reads the report (phone numbers removed) while there is
   signal. A report Apple's model refuses, cannot parse or takes too long on is not sent: the phone tries a plainer read
   or its rules instead. Off: every report stays on the phone (Apple's model, then the phone's rules). Stephen's
   iPhone: on for this drill, so the drill shows the cloud route in those cases. Volunteers' phones: their own
   choice. The switch is off by default and is not saved, so after any relaunch (a
   force-quit, a phone restart or a reinstall), open Ready check and turn it back on. The cloud route needs iOS 27;
   on iOS 26 it is off whatever the switch says.
5. For filming, turn on **Say in words where each report was read (for filming)** under **Show sources**.
6. Optional, in a practice drill only: **Ready check**, then **Check both read routes**. It saves a route-check file
   (section 5). Ready check also offers it in any drill or judge incident, including `drill-kennesaw-1`; do not run it
   there, because its cloud route sends the reader's tools, the person's description included.

## 3. Drill morning: print each team's paper

Do this after command approves plan v1 on the command post. The Plan panel says "Approved as plan v1. Sent."

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
   - Headers and footers: off. With them on, the browser adds the page address and date to the page.
4. Check the printout before handing it out:
   - One page per sheet. The footer reads "IAP Page 1 of 1".
   - Block 7 starts "Training drill. Nobody is missing. Do not dial 911."
   - The match code in block 7 is the code in the command post header (MATCH).
5. Open **More**, then **Print radio cards**. The same box is on this page, also off; tick it to put the names and
   approach notes on every card. Print with the same settings, and cut along the dashed line. Give each team its own
   card.
6. During the drill, a team reads its match code over the radio, one character at a time. Command types it into
   **More**, then **Check a radio code**. "Same map" means the team and command see the same prior version and the
   same reports.
7. If command approves a new plan, print again: the paper names the plan version it was printed for.

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

3. Copy a route-check file, if section 2's step 6 made one. Its name is shown on screen after "Saved".

   ```
   xcrun devicectl device copy from --device <phone-id> --domain-type appDataContainer --domain-identifier app.pointlastseen.field --source Documents/route-check-<number>.json --destination <folder>/route-check-<number>.json
   ```

4. The outbox holds the drill's report text, with phone numbers already removed. Read it before any of it goes into
   the repository, and never commit it raw.
