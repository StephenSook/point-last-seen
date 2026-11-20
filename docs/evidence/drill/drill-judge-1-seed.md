# Judge drill: the seed, run on 2026-11-20

Status: SEEDED. The incident `drill-judge-1` exists in the live project so judges can try the phone apps: the
searcher app on an iPhone and the family app on Android, with one searcher code and one family code. It is a
training drill: made-up data only, nobody is missing, and its name and label say so.

## What it holds

The same story as a judge's practice search on the web (copied from the judge seed, `drill-dev-1`) and as the
iPhone's practice drill (`shared/practice/ios-practice-pack.json`): the seed's grid (`piedmont-park-dev`), point last
seen, terrain, prior and engine settings, its 67 segments plus ROW at prior version 5, teams T1 and T2, its shared
profile, and one plan (the seed's latest plan at prior version 5 that no test wrote: version 19, T1 to segment BO, T2
to segment BP; `approvedByUid` is the fixed string `judge-drill-baseline`). Mode `drill`, label "Training drill.
Nobody is missing.", name "Judge drill (training; nobody is missing)".

Every judge who joins holds the same claims, so judges share this drill and see each other's reports. The rules
tests (`functions/test/rules/judgeDrill.test.ts`) show that a searcher or family member can make the normal report,
answer and profile writes and nothing more: no one can close, relabel, pause, re-plan or delete it, write its
segments or teams, or change another member's report or answer.

## What was run

From the repository root with the gcloud user's token.

1. The incident, its teams and its three primary codes (in the macOS Keychain, never printed, services
   `pls-drill-{searcher,family,command}-code`, account `drill-judge-1`):
   `python3 -I tools/seed/seed_drill.py buildhybridai-2026-yg3m drill-judge-1 "Judge drill (training; nobody is missing)" T1 T2`
2. The baseline from the judge seed: `python3 -I tools/practice/judge_drill.py --write` (73 docs).
3. The judges' two codes, each expiring 2026-12-17T23:59:59Z (Keychain only, account `drill-judge-1-judges`):
   `python3 -I tools/seed/seed_drill.py --add-code buildhybridai-2026-yg3m drill-judge-1 searcher drill-judge-1-judges --expires 2026-12-17T23:59:59Z`,
   then the same with `family`.

Read back: `judge_drill.py --check` reports the 73 baseline docs match the seed and 0 docs added by judges;
`tools/seed/segment_contract.py buildhybridai-2026-yg3m drill-judge-1` reports 68 docs at prior version 5, readable
by the apps; each judge code's doc names `drill-judge-1`, its one role, and `expiresAt` 2026-12-17T23:59:59Z, and
each Keychain entry holds 8 characters.

## Later

- Reset on demand only, never between 2026-12-10 and 2026-12-16 (the tool refuses): `judge_drill.py --reset` lists
  what it would delete (docs judges added and their media), `--reset --yes` deletes it and rewrites the baseline.
- After judging, revoke both codes with `seed_drill.py --revoke-code ... drill-judge-1-judges` (searcher, then
  family); they stop working at 2026-12-17T23:59:59Z regardless.
