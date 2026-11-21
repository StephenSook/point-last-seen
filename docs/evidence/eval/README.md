# Report-reading eval (iPhone)

How well the iPhone turns a searcher's report into the fields the search uses, read by Apple's on-device
model, beside the app's own rules as a baseline. Both arms use the app's real reader; neither reaches the
cloud. No numbers are recorded here until the first run on the phone.

## The answer key

- Written by one person (the builder) before any model run. Each row is a short drill report and the answers
  that person expects: the kind (`cleared`, `sighting`, `clue`, `found` or `unclear`), up to two segment ids on
  the drill grid (an empty list means no segment is expected) and the place feature (`creek_or_drainage`,
  `water`, `road`, `trail`, `structure`, `brush`, `woods`, `field`, `other` or `none`).
- Grid: `piedmont-park-dev` (segment ids AA to CO). Made-up drill content only: no real person, place or
  health detail.
- Frozen in this folder as `pls-drill-reports-v1.json`, with its SHA-256 pinned in a test, so a run always
  names the exact key it scored against. A key is never edited after a run; a changed key gets a new name.
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
  on the rows where the person gave one.
- No reading (an invalid reply) and a refused read count as misses, and every miss is listed by row.
- Each arm's rows right carry a 95% Wilson interval. The two arms are compared on the same rows with an exact
  two-sided McNemar test on the rows only one arm got right.
- The scoring is `EvalScorer` and `EvalReport` in PLSCore, with their tests.

## Running it

1. Install a debug build on the iPhone, join the drill, and turn on Airplane Mode.
2. Ready check, then "Report-reading eval", then "Run both arms".
3. The screen shows each arm's score and saves the result file to the app's Documents folder. The file records
   the answer key's SHA-256, the app version, build and commit, the SHA-256 of the guided prompt the model was
   given, the device and the time.
4. The result file is copied from the phone and committed in this folder beside the key.

## Limits

- One labeller: one person wrote the key, so it reflects one reader's judgement of each report. Results are
  reported as from one labeller unless a second person labels 10 of the 20 rows blind and the two keys are
  compared.
- About 20 rows give wide intervals: a difference between the arms has to be large to show.
- The reports are drill sentences, not words from a real search.

## Tuned before the key, and not shipped

Before this key exists, the phone's read path was tuned on 10 other drill sentences in the simulator. Those
sentences are tuning data, not a held-out set, so they give no accuracy number. One problem was found there and
not fixed:

- A report that an object was found ("Found a blue coat by the creek", "Found a shoe on the path") is read by
  Apple's model as `found` (the person found), not as a `clue`.
- Two prompt lines were tried, each read twice with the same sentences. "A report of an object (a coat, a shoe, a
  bag) is a clue, not the person found." moved both object reports to `cleared`, still not `clue`. "Use kind found
  only when the missing person is found. If the report found an object, such as a coat, a shoe or a bag, use kind
  clue." made both `clue`, but a sighting then read as `found` and an unclear report as `cleared`: it traded two
  errors for two others. Neither line shipped.
