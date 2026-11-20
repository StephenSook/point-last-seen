# Drill day: Kennesaw Mountain

The drill incident is `drill-kennesaw-1`: teams T1, T2 and T3 on the `kennesaw-mountain-drill` grid, south of Dallas
Highway. It holds made-up drill data. Nobody is missing. This page covers the paper each team carries and how the
finished run reaches the judge page.

## 1. Checked before the drill

- The assignment sheet (ICS 204-shaped) and the radio cards render the drill's teams and real segment ids from its
  grid, with the training line. A unit test pins this (`web/src/extras/print/kennesawPaper.test.ts`).
- Each assignment sheet prints on exactly one Letter page. A sheet holds up to five teams, so T1 to T3 fit on one
  sheet. A browser check prints each case to PDF and counts its pages, including tasks long enough to wrap.
- One radio card per team, two cards per page, each with the training line, the team, its segments and its task, and
  the map match code spelled out letter by letter.

## 2. Drill morning: print each team's paper

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

## 3. After the drill: publish the run to the judge page

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
