# Cloud model latency

Why every live cloud path uses the flash-lite model family. All times are wall-clock times for one
`generateContent` call through Firebase AI Logic.

| Model | Call | Samples | Time | When |
|---|---|---|---|---|
| `gemini-3.8-flash` | Web, cloud only, a five-word reply | 1 | 116,071 ms (333 thinking tokens) | 2026-11-17 |
| `gemini-3.5-flash-lite` | Direct text call, warm, before cloudGuard | 10 | median 839 ms, max 1,248 ms | 2026-11-18 |
| `gemini-3.5-flash-lite` | Direct text call, warm, with cloudGuard | 10 | median 925 ms, max 1,164 ms | 2026-11-18 |

The `gemini-3.8-flash` time is one sample from our own Chrome test of on-device and hybrid inference. Its raw
record is local evidence, not in the repo. One sample does not give a typical time, but a search team cannot wait
two minutes for a reply, so live paths do not use that model: the rules gate (`scripts/rules_gate.py`, `SLOW_MODEL`)
fails CI on any live use of it, and cloudGuard refuses any model not on `shared/constants/models.json`.

The two flash-lite rows come from a hand-run check against the live project, before and after cloudGuard was
deployed (`docs/SECURITY.md` row 12). The check script is local evidence, not in the repo.
