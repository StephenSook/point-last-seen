# ISRID dementia profile: distance, elevation and find-location tables

Source: Koester, *Lost Person Behavior*, "Dementia (Alzheimer's)", p. 164. Read from the publisher's public sample,
https://www.dbs-sar.com/LPB/Dementia.pdf, on 2026-11-18. The text was extracted with `pdftotext -layout`, and the
values were checked a second time against the same PDF. The numbers below are copied as printed.

## Distance (horizontal) from the IPP, kilometres

| | Temperate Mtn | Temperate Flat | Dry Mtn | Dry Flat | Urban |
|---|---|---|---|---|---|
| n | 95 | 175 | 14 | 15 | 336 |
| 25% | 0.3 | 0.3 | 1.0 | 0.5 | 0.3 |
| 50% | 0.8 | 1.0 | 1.9 | 1.6 | 1.1 |
| 75% | 1.9 | 2.4 | 3.1 | 3.6 | 3.2 |
| 95% | 8.3 | 12.8 | 6.1 | 11.8 | 12.6 |

The same table in miles: Urban 0.2, 0.7, 2.0, 7.8; Temperate Flat 0.2, 0.6, 1.5, 7.9; Temperate Mtn 0.2, 0.5, 1.2, 5.1.

In use: the Temperate Mtn, Temperate Flat and Urban columns are the prior's rings
(`shared/constants/engine-params.json`, km) and the walkers' distances (`shared/constants/walker-params.json`, m).
A Georgia SAR lead treats a suburb or a big park around Atlanta as urban, so new incidents start urban.

## Elevation (vertical) change from the IPP (feet)

| | Temperate Uphill | Temperate Down | Temperate Same | Dry Uphill | Dry Down | Dry Same |
|---|---|---|---|---|---|---|
| % | 19% | 42% | 39% | 50% | 38% | 13% |
| 50% (feet) | 75 | 60 | | 317 | 187 | |

The 25%, 75% and 95% rows are blank in the source, no n is printed for this table, and the source does not say how
much change counts as "Same". There is no urban column.

In use: the Temperate shares are the engine's elevation layer (`shared/constants/engine-params.json`, `elevation`), off
by default, with "Same" taken as within 3 m of the start segment (ours). The layer refuses urban terrain, for which
this table has no split. The Dry column is not used: the engine has no dry terrain.

## Find location (%)

| | Temperate | Dry | Urban |
|---|---|---|---|
| n | 207 | 7 | 223 |
| Structure | 20% | 29% | 35% |
| Road | 18% | 14% | 36% |
| Linear | 9% | | 9% |
| Drainage | 9% | 14% | 4% |
| Water | 7% | 14% | 6% |
| Brush | 6% | | 1% |
| Woods | 17% | | 3% |
| Field | 14% | 29% | 6% |

A blank cell is blank in the source. Not used yet. The urban shares are kept here for a later layer that would
weight structures and roads in an urban search; no engine code reads them.
