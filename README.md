# Point Last Seen

A search-planning aid for search and rescue training drills.

Searchers send a field report with no signal. Their own iPhone reads it with an
on-device model and redraws the probability shading of their segments. When a
connection returns, the command post merges every report and drafts new
assignments. A person at command approves every assignment change.

All model calls go through Firebase AI Logic.

Status: in development for #BuildHybridAI 2026. Training drill use only.

## Layout

- `shared/`: schemas, constants, the shared test vectors and the TypeScript engine
- `tools/`: the vector generator and the grid builder
- `functions/`: Cloud Functions, with Firestore and Storage security rules at the root
- `ios/`: the searcher app and its Swift engine package
- `web/`: the command post
- `android/`: the family app
- `scripts/`: local and CI gates

## Checks

Run every CI check locally:

```
bash scripts/ci-local.sh
```

## License

Apache-2.0. See `LICENSE` and `NOTICE`. Map data under `shared/grid/` is ODbL.
