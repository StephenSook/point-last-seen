# Production checklist

Checks that run before any build or page is published. Each line names the command and the result it
must give.

## Android

- [ ] Publish only the Play Integrity release APK. Run `android/scan-apk.sh` on the exact signed APK (it
  runs inside `release.sh`): it must report 0 hits for debug tokens, token resources,
  `FIREBASE_APPCHECK_DEBUG_TOKEN` and the debug provider. A debug APK reports 5 and is never published.
- [ ] Raise the Remote Config key `minimum_version_android` only after the repo is public (not before Sat
  2026-11-28) and the release APK is a GitHub Release asset. The family app's update screen opens
  https://github.com/StephenSook/point-last-seen/releases/latest, which is a 404 while the repo is private.
  Check first: `gh repo view StephenSook/point-last-seen --json visibility` says PUBLIC, and
  `gh release view --repo StephenSook/point-last-seen` lists an .apk asset.

- [ ] Publish only a release APK that includes c05f679 (clip consent written 32 days out). An older APK
  writes 30 days, which the rules refuse, so it cannot read clips. Check: `git merge-base --is-ancestor c05f679
  <release commit>` exits 0.

## Firebase project

- [ ] Storage CORS matches `storage.cors.json` (the web app reads photo bytes with an XHR from the hosting
  origins). Apply with `gcloud storage buckets update gs://buildhybridai-2026-yg3m.firebasestorage.app
  --cors-file=storage.cors.json` and read back with `gcloud storage buckets describe ... --format=json`: the
  `cors_config` must equal the file. CORS is not access control; the Storage rules still decide every read.
- [ ] Every callable answers with its own JSON, not Cloud Run's HTML 401: firebase-tools grants a callable's
  public invoker (`roles/run.invoker` for `allUsers`) only when it creates the function, so a function whose
  first create failed needs `gcloud run services get-iam-policy <service>` checked after the retry.
- [ ] The Storage lifecycle rule is in place: `gcloud storage buckets describe gs://buildhybridai-2026-yg3m.firebasestorage.app
  --format=json` shows one Delete rule, age 30, prefixes clips/, photos/, packs/; the daily probe
  (`scripts/media_probe.py`) checks the same thing without credentials.
- [ ] `python3 -I scripts/check_rc_keys.py .` exits 0 (a CI gate): every template key is read by a client, every
  key a client reads is in the template, and no engine number is in Remote Config.
- [ ] Server prompt templates are published only from `shared/templates` with `python3 -I scripts/template_publish.py
  --publish` (dry run first; it reads each template back and refuses a locked one). Lock each live template before
  judging (`templates.modifyLock`), so the console cannot change what the apps call.
- [ ] Remote Config is published only with `python3 -I scripts/rc_publish.py --publish`, after its dry run: it
  reads the live template and ETag, refuses any live value it would change or drop unless that key is named
  with `--allow KEY`, validates, then publishes with If-Match. `firebase.json` names no template, so a plain
  `firebase deploy` cannot replace it. The template holds every key the three clients read
  (`scripts/test_rc_publish.py`).
- [ ] Before App Check is enforced on Firestore and Storage (both UNENFORCED, monitoring only, since 2026-11-19
  01:33 UTC): the 24-hour verdict read (`firebaseappcheck.googleapis.com/services/verification_count` per app) shows
  no unverified traffic beyond our own probes; the daily probe passes with its App Check token; and every local dev
  session has an App Check debug token set, because the reCAPTCHA Enterprise key allows only the two hosting
  origins (live-backend e2e sets it through `web/e2e/fixtures.ts` and fails without it). After enforcing each
  service, within 15 minutes: the probe, the command post, the Android note and clip, an iOS read and an admin tool
  read work, and a REST read with no App Check token is refused. To roll back, set the service's enforcement mode
  back to UNENFORCED.
- [ ] The clipReadings TTL policy is ACTIVE: `gcloud firestore fields ttls list --project buildhybridai-2026-yg3m`
  lists `clipReadings/fields/expiresAt` as ACTIVE (it is declared in firestore.indexes.json and deployed with
  the indexes).

## Judging window (2026-12-10 to 2026-12-16)

Every time-based value on a judged path, what it does on Dec 10 and Dec 16, and what keeps it right. Nothing
here may need an edit to the live site after the 2026-11-30 deadline: a value that could change behaviour
inside the window has a test (`scripts/test_judging_window.py`) or a line below that fails before submit.

| Value | Dec 10 and Dec 16 | What refreshes or guards it |
|---|---|---|
| Storage lifecycle, 30 days on clips/, photos/, packs/ | Nothing deleted: the project was created 2026-11-17, so the earliest deletion is 2026-12-17 | `test_judging_window.py` pins age x start > Dec 16; daily `media_probe.py` |
| clipReadings TTL (expiresAt 31 to 33 days out; clients write 32) | Drill readings from the Nov 22 drill expire Dec 23 or later | Rules window and the declared TTL, pinned by the test; Storage takes a clip only while its consent expires 31 or more days after the upload, so the consent outlives the clip; a sandbox copy must get a fresh expiresAt (line below) |
| Judge sandbox (`startJudgeSession`): expires 24 h after start, one new per visitor per hour, at most 50 new a day | Each judge's sandbox lives 24 h; its media goes within 15 min of the end; the sandbox itself is deleted a day after it ends | `deleteIncidentMedia` every 5 min and `deleteEndedSandboxesJob` every hour (no end date); the cap (line below) |
| App Check tokens (reCAPTCHA Enterprise, App Attest, DeviceCheck, Play Integrity) | 1 h token TTL, refreshed by the SDKs; no key or site key expires | Nothing to refresh; the daily probe checks AI Logic still refuses a call with no token |
| App Check enforcement on AI Logic | ENFORCED since 2026-11-17 18:32 UTC (read back 2026-11-18) | Daily `appcheck_control.py --no-token-only` fails loudly if it changes |
| Published run file (judge replay) | Carries `exportedAt`; the judge page applies no age limit | Nothing ages; the replay is a snapshot |
| `deleteIncidentMedia` schedule (Cloud Scheduler, every 5 min) | Runs throughout | No end date; every run writes `ops/storage`, and a `checkedAt` older than 20 min or two failing runs in a row fail the daily probe |
| Daily probe workflow (`probe.yml`, 13:23 UTC) | Runs; GitHub cron can start hours late | Both scripts retire after 2026-12-17, pinned by the test |
| GitHub 60-day inactivity cutoff for scheduled workflows (public repos) | Not reached: public from 2026-11-28, last push about 2026-11-30, cutoff about 2027-01-29 | Line below checks the last push date |
| Actions budget ($15, resets monthly on the 1st) | December has its own $15; the repo is public from 2026-11-28, so its minutes are free | Line below |
| Gemini spend cap ($25 budget) | Judge sandboxes call the cloud; burn rate NOT MEASURED yet | Per-uid hourly limit, daily sandbox cap, `kill_cloud`; line below measures it |
| Model versions pinned in prompts and Remote Config | A model shut down inside the window breaks the cloud route | The rules gate pins every id to `shared/constants/models.json` (read 2026-11-18); line below re-reads it |
| Artifact Registry cleanup (1 day) | Deletes old function images only; running functions keep serving | Nothing; a rollback rebuilds from source |

- [ ] Every judge-sandbox copy of a clip reading gets `expiresAt` set from the sandbox's own end (Task 23,
  `startJudgeSession`), never the drill's original value, so the TTL cannot remove a sandbox's readings early.
- [ ] The daily sandbox cap is the function's in-code value: `JUDGE_SESSIONS_PER_DAY = 50` new practice searches per
  UTC day across all visitors (`functions/src/judgeSession.ts`, counted in the admin-only `ops/judgeSessions-{YYYY-MM-DD}`,
  one document per day, so the sessions so far are the sum of those counts).
  Lower it there, and redeploy, if the Gemini burn rate line below needs it.
- [ ] Gemini burn rate: read the project's spend on 2026-11-29, divide by the sandbox sessions recorded so far,
  and confirm (cost per session) x (daily cap) x 7 days stays under the $25 cap with the drill and film spend
  already used. If not, lower the daily cap before submit.
- [ ] Re-read https://firebase.google.com/docs/ai-logic/models on 2026-11-28 or later: every id under `models`
  in `shared/constants/models.json` still shows no shutdown date before 2026-12-17, any newly retiring id moves
  to `banned`, and `readOn` is updated. The rules gate then fails on any source that still names a banned or
  unlisted id. Remote Config values are checked the same way before the template is published.
- [ ] `gh api repos/StephenSook/point-last-seen --jq .pushed_at` is after 2026-11-17 (the 60-day cutoff for
  scheduled workflows lands after 2026-12-16), and `gh api repos/StephenSook/point-last-seen/actions/workflows
  --jq '.workflows[] | "\(.state) \(.path)"'` shows probe.yml `active`, with its newest run under 26 hours old.
- [ ] The Actions budget for December is set (Settings > Billing > Budgets) or the repo is public, so the
  daily probe is not blocked by billing during the window.
