# Test drill for automated checks: the seed, run on 2026-11-19

Status: SEEDED. The incident `drill-test-1` exists in the live project for the apps' live and device tests, so
those tests never write to the drill that every judge practice search is copied from (`JUDGE_SEED_INCIDENT` in
`functions/src/judgeSession.ts`). Made-up drill data only; nobody is missing.

## What it holds

The same setup as the development drill: the `piedmont-park-dev` grid, the point last seen at 33.786579,
-84.373309 (typed), the temperate flat terrain with the near-feature layer on, teams T1 and T2, and 67 segments
plus ROW at prior version 1. Its segment ids equal the development drill's.

## What was run

From the repository root with the gcloud user's token. Each step is create-only or versioned.

1. The incident, its teams and its three join codes (in the macOS Keychain, never printed, under services
   `pls-drill-searcher-code`, `pls-drill-family-code` and `pls-drill-command-code`, account `drill-test-1`):
   `python3 -I tools/seed/seed_drill.py buildhybridai-2026-yg3m drill-test-1 "Test drill for automated checks (synthetic)" T1 T2`
2. The prior, from the development drill's point last seen and terrain:
   `npm run build-grid -w tools/grid-builder -- --prior shared/grid/piedmont-park-dev.grid.json --ipp 33.786579,-84.373309 --terrain temperate_flat --linear --out test1.segments.json`
3. The segments and the prior at the incident's starting version:
   `python3 -I tools/seed/seed_segments.py buildhybridai-2026-yg3m drill-test-1 test1.segments.json --prior-version 1`

Read back: the incident is a drill, open, labelled "Training drill. Nobody is missing.", grid `piedmont-park-dev`,
terrain temperate flat with the linear layer on, prior version 1 with `priorBuiltAt` set, teams T1 and T2, and 68
segment documents whose ids equal the development drill's. Each join code's Keychain entry holds 8 characters.

## Re-seeded at prior version 2, 2026-11-19

The first seed's segments had no `priorVersion` or `ringPoa`, so the iPhone could not build its mission. Steps 2 and
3 were run again with the fixed seed tools at `--prior-version 2`, and
`python3 -I tools/seed/segment_contract.py buildhybridai-2026-yg3m drill-test-1` reports 68 docs at prior version 2,
readable by the apps.
