# Report-reading eval (iPhone)

How well the iPhone turns a searcher's report into the fields the search uses, read by Apple's on-device
model, beside the app's own rules as a baseline. Both arms use the app's real reader; neither reaches the
cloud. The first run's numbers are below: measured on 20 made-up drill reports, not an accuracy claim for real
searches.

## The answer key

- Written by the builder's AI assistant (Claude Opus 5.5, a different model family from the model tested), at
  the builder's request, before any model run. The writer had read the app's kind definitions and this README,
  including the tuning notes on object reports, and ran no reader on these reports.
- Each row is a short drill report and the answers the writer expects: the kind (`cleared`, `sighting`,
  `clue`, `found` or `unclear`), up to two segment ids on the drill grid (an empty list means no segment is
  expected) and the place feature (`creek_or_drainage`, `water`, `road`, `trail`, `structure`, `brush`, `woods`,
  `field`, `other` or `none`).
- Grid: `piedmont-park-dev` (segment ids AA to CO). Made-up drill content only: no real person, place or
  health detail.
- Frozen in this folder as `pls-drill-reports-v1.json`, converted unedited from the sheet as written
  (`pls-drill-reports-v1-key.csv`), with both SHA-256s pinned in tests, so a run always names the exact key it
  scored against. A key is never edited after a run; a changed key gets a new name.
- After Sunday's drill, its reports become a second, fresh set, labelled the same way by a person.

## The arms

| Arm | What reads the report | Network | Cloud |
|---|---|---|---|
| Rules only | The app's rules, with no model | Off | Never |
| On-device | Apple's on-device model (Foundation Models), called by the app's own reader, in a drill incident | Airplane Mode | Never |

Each arm reads every row once, in key order, with the team's segments from the drill mission loaded on the
phone and no position fix. A model read that runs out of time or is refused falls back to the rules, as in the
app; the result records how many rows a model actually read.

## Scoring

- A row is right when both the kind and the set of segment ids match the key. The feature is scored separately,
  on the rows where the key gives one.
- No reading (an invalid reply) and a refused read count as misses, and every miss is listed by row.
- Each arm's rows right carry a 95% Wilson interval. The two arms are compared on the same rows with an exact
  two-sided McNemar test on the rows only one arm got right.
- The scoring is `EvalScorer` and `EvalReport` in PLSCore, with their tests.

## Run 1, 2026-11-22

On an iPhone 17 Pro (iOS 27.2.1), debug build 1.0.0 (1) from commit `ee331aaf`, in the practice drill, with
Airplane Mode on and Wi-Fi off; both arms run once from the eval screen. The result file is
`eval-pls-drill-reports-v1-1795376366383.json` (run at 2026-11-22 19:39 UTC), committed unchanged; it names the
key's SHA-256 (`f98c6f5d...`).

| Arm | Right of 20 | 95% interval | Read by a model | Invalid | Blocked |
|---|---|---|---|---|---|
| Rules only | 13 | 0.43 to 0.82 | 0 | 0 | 0 |
| On-device | 9 | 0.26 to 0.66 | 17 | 0 | 1 |

- The rules alone got more right: 5 rows only the rules got right, 1 only the on-device arm got right. The exact
  McNemar p is 0.22, so at 20 rows this is not a significant difference, and the two intervals overlap.
- Every miss but one was a wrong kind. The other was a blocked read: on the on-device arm, n10's reading had the
  key's kind, but the read was blocked, which counts as a miss.
- The on-device arm is the app's real path, not the model alone: Apple's model read 17 rows, and the router sent 3
  to the rules (n16 to the evidence protocol, n20 and n10 to the parser). Model reads took a median 1,974 ms (at
  most 2,362 ms).
- Apple's model read three object finds as `found` (n3 footprints, n9 a wrapper, n11 a water bottle), the same
  weakness as the tuning notes below.
- After the run, the key's writer marked n12 and n18 as rows a second labeller might label differently; the key is
  unchanged, and relabelling both would not change which arm got more right.
- The limits below apply: 20 made-up reports, a key written by the builder's AI assistant, one labeller.

## Running it

1. Install a debug build on the iPhone, start the practice drill (or join a drill), and turn on Airplane Mode.
2. Ready check, then "Report-reading eval", then "Run both arms".
3. The screen shows each arm's score and saves the result file to the app's Documents folder. The file records
   the answer key's SHA-256, the app version, build and commit, the SHA-256 of the guided prompt the model was
   given, the device and the time.
4. The result file is copied from the phone and committed in this folder beside the key.

## Limits

- One labeller: the builder's AI assistant wrote the key, so it reflects one reader's judgement of each
  report. Results are reported as from one labeller unless a second person labels 10 of the 20 rows blind and
  the two keys are compared.
- About 20 rows give wide intervals: a difference between the arms has to be large to show.
- The reports are drill sentences, not words from a real search.

## Tuned before the key, and not shipped

Before this key was written, the phone's read path was tuned on 10 other drill sentences in the simulator. Those
sentences are tuning data, not a held-out set, so they give no accuracy number. One problem was found there and
not fixed:

- A report that an object was found ("Found a blue coat by the creek", "Found a shoe on the path") is read by
  Apple's model as `found` (the person found), not as a `clue`.
- Two prompt lines were tried, each read twice with the same sentences. "A report of an object (a coat, a shoe, a
  bag) is a clue, not the person found." moved both object reports to `cleared`, still not `clue`. "Use kind found
  only when the missing person is found. If the report found an object, such as a coat, a shoe or a bag, use kind
  clue." made both `clue`, but a sighting then read as `found` and an unclear report as `cleared`: it traded two
  errors for two others. Neither line shipped.
