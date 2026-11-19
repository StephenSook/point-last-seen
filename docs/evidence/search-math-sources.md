# Sources for the search math constants

Each value in `shared/constants/engine-params.json` marked SOURCED below comes from the work quoted here. The
quotes were re-read at the source on 2026-11-18.

## Sweep and hasty speeds: `sweepSpeedMps` 0.39, `hastySpeedMps` 0.53

Hashimoto A, Aung E, Koester R, Abaid N (2026). Speed, slope, and synchrony: Empirical insights into SAR searcher
behavior. PLoS One 21(6): e0339541. Published 15 June 2026. https://doi.org/10.1371/journal.pone.0339541

> "Median speeds were 0.53 m/s (IQR 0.26 − 0.87) for hasty searches and 0.39 m/s (IQR 0.20 − 0.63) for sweep
> searches"

The study measured GPS tracks of searchers on real SAR missions (61 tracks from 13 cases). Its data are open:
https://doi.org/10.5281/zenodo.18637221 (CC BY 4.0). The engine uses the medians as the default speed V in the
track length L = V x T x searchers when a team reports only its time.

## Effective sweep width: `sweepWidthFactor` 1.645

Koester RJ et al. (2014). Use of the visual range of detection to estimate effective sweep width for land search
and rescue based on 10 detection experiments in North America. Wilderness Environ Med 25(2): 132-142. As reproduced
in Koester RJ (2018), Determining Probabilistic Spatial Patterns of Lost Persons and their Detection
Characteristics in Land Search & Rescue (PhD thesis, University of Portsmouth):
https://pure.port.ac.uk/ws/portalfiles/portal/13065953/Koester_Thesis_Final_Revised.pdf

> "It was found on average W ≈ 1.645 × Rd with a strong correlation (R2 = .827)."

Rd is the average maximum detection range a team measures on site. The engine sets W = 1.645 x Rd.

## Distance rings

See `isrid-dementia-p164.md`.
