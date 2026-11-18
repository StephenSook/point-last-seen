# Changelog: web command post (lane C)

Each entry names what changed, its source (plan task or finding) and how it was verified, in commit order.

Commits before this file (gate, config, events, merge lanes, offline check, version.json, Remote Config, POA style) are listed in `git log -- web`.

## 2026-11-17

### feat(web): validate join requests and call joinIncident
- What: `joinRequest` cleans the join code (trim, upper case, no spaces or hyphens), requires 8 characters and an incident id, and sends a team only for the searcher role. `joinIncident` calls the callable and refreshes the ID token so new claims reach the rules at once.
- Source: plan Task 15 (`web/src/data/join.ts`), callable contract from Task 11.
- Verified: `src/data/join.test.ts`, 4 tests, failed first (module missing), then passed.
