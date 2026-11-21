# App Review drill: the seed, run on 2026-11-21

Status: SEEDED. The incident `drill-review-1` exists in the live project so Apple's reviewer can join a search with
the iPhone app, see a mission, and try reporting and blocking. Made-up drill data only; nobody is missing.

## What it holds

The same setup as the test drill: the `piedmont-park-dev` grid, the point last seen at 33.786579, -84.373309
(typed), the temperate flat terrain with the near-feature layer on, teams T1 and T2, and 67 segments plus ROW at
prior version 1. Its mode is exactly `drill`, which the iPhone app needs before it sends anything to a model.

## What was run

From the repository root with the gcloud user's token. Each step is create-only or versioned.

1. The incident, its teams and its three join codes (in the macOS Keychain, never printed, under services
   `pls-drill-searcher-code`, `pls-drill-family-code` and `pls-drill-command-code`, account `drill-review-1`):
   `python3 -I tools/seed/seed_drill.py buildhybridai-2026-yg3m drill-review-1 "App Review drill (synthetic)" T1 T2`
2. The prior, from the development drill's point last seen and terrain:
   `npm run build-grid -w tools/grid-builder -- --prior <repo>/shared/grid/piedmont-park-dev.grid.json --ipp 33.786579,-84.373309 --terrain temperate_flat --linear --out review1.segments.json`
3. The segments and the prior at the incident's starting version:
   `python3 -I tools/seed/seed_segments.py buildhybridai-2026-yg3m drill-review-1 review1.segments.json --prior-version 1`

## Checked

- Read back: mode `drill`, status open, labelled "Training drill. Nobody is missing.", grid `piedmont-park-dev`,
  terrain temperate flat, prior version 1 with `priorBuiltAt` set, teams T1 and T2.
- `python3 -I tools/seed/segment_contract.py buildhybridai-2026-yg3m drill-review-1` reports 68 docs at prior version
  1, readable by the apps.
- Each join code's Keychain entry holds 8 characters.
- A live join with the searcher code (with App Check) read the incident as a member, then deleted its own sign-in
  with `deleteMyAccount`.

It is not in the retention keep list, so it stays while it is open and is deleted 30 days after it is closed.
