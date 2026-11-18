# Extras changelog

Lane E (extras): web/src/extras/**, web/extras-harness/**, web/e2e/extras/**, web/CHANGELOG-EXTRAS.md, web/public/extras/**, tools/extras/** (after lane A's grant). Plan: PLS-EXTRAS-PLAN.md. Newest first. Each entry gives what changed, its source and how it was verified.

## 2026-11-18

- Extras lane shell (Task 1): `laneC.ts` is the only file that imports lane C modules and `@pls/engine`; `types.ts`; `ExtrasDock` (one "More" button with `aria-haspopup="menu"` and an empty menu that closes on Escape and on blur; renders nothing when access is denied or there is no view); `JudgeExtras` (renders nothing yet); a dev-only harness page (`web/extras-harness/dock.html`, never in the production build) and the extras Playwright config (port 5176). Guard test `imports.test.ts`: only `laneC.ts` imports from outside the folder, no file imports the animation library or calls a model, and a floor of 5 files walked so an empty walk cannot pass. Source: PLS-EXTRAS-PLAN Task 1; built in the Codex build lane, reviewed by the orchestrator. Verified: the guard failed first (fewer than 5 files), then passes; web suite and typecheck exit 0; `bash scripts/ci-local.sh` exit 0 on the series head. Browser interaction of the dock is not yet run (the build sandbox could not bind a port); it is covered by the Task 16 e2e.
