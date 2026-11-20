# Practice drill for the iPhone

`ios-practice-pack.json` is the practice search the iPhone app ships, so a judge can open the searcher app without a
join code. It is exported from the same seed drill a judge's practice search on the web is copied from
(`shared/constants/judge-seed.json`), with the same changes a practice search gets: named "Practice search", labelled
as a training drill where nobody is missing, open, and with no events. It holds the seed's incident settings, its
segments, its shared profile and one plan for team T1 (the seed's latest plan at its prior version that no test
wrote; `approvedByUid` is the fixed string `practice-pack`). Nothing else from the seed ships: no events, no command
profile, no consent records, no join code hashes, no user ids. Timestamps are epoch milliseconds.

Never edit the file by hand. Regenerate it from the live seed and check it:

```
python3 -I tools/practice/export_practice_pack.py --write   # read the seed, write the pack
python3 -I tools/practice/export_practice_pack.py --check   # the committed pack still matches the seed
python3 -I tools/practice/export_practice_pack.py           # offline check of the committed file (CI runs this)
```
