# Changelog: web command post (lane C)

Each entry names what changed, its source (plan task or finding) and how it was verified, in commit order.

Commits before this file (gate, config, events, merge lanes, offline check, version.json, Remote Config, POA style) are listed in `git log -- web`.

## 2026-11-17

### feat(web): validate join requests and call joinIncident
- What: `joinRequest` cleans the join code (trim, upper case, no spaces or hyphens), requires 8 characters and an incident id, and sends a team only for the searcher role. `joinIncident` calls the callable and refreshes the ID token so new claims reach the rules at once.
- Source: plan Task 15 (`web/src/data/join.ts`), callable contract from Task 11.
- Verified: `src/data/join.test.ts`, 4 tests, failed first (module missing), then passed.

### feat(web): start Firebase with App Check first and an unlimited offline cache
- What: `getPls()` reads the build config, starts App Check with the reCAPTCHA Enterprise provider before any other service, opens Firestore with a persistent multi-tab cache of unlimited size, and sets up Auth and Functions (us-central1). `ensureSignedIn` signs in anonymously when there is no user.
- Source: plan Task 15 step 3, spec sections 11 and 14.
- Verified: export names read from the firebase 13.4.0 type files (`initializeAppCheck`, `ReCaptchaEnterpriseProvider`, `persistentLocalCache`, `persistentMultipleTabManager`, `CACHE_SIZE_UNLIMITED`, `signInAnonymously`); typecheck clean. Glue only, covered by the e2e smoke. Local smoke found anonymous sign-up returns 400 `CONFIGURATION_NOT_FOUND` because Authentication is not set up in the project yet (Task 0).

### feat(web): subscribe to the incident, teams, segments and phone clock offsets
- What: `subscribeIncident` keeps live views of the incident doc, the teams, each team's device docs (for `clockOffsetMs`) and the segments (geometry parsed from `geometryJson`; the reserved `ROW` segment carried as `rowPrior`, never drawn).
- Source: plan Task 15, spec section 7 data model, `clockOffsetMs` in spec 11.3.
- Verified: typecheck clean. Firestore glue, exercised by the e2e smoke once an incident can be seeded.

### feat(web): add the command post neutrals and layout from the visual system
- What: `theme/base.css` sets the spec 22.1 neutrals (bg-0 to bg-3, fg-1 to fg-4, line), change-cyan and alert-red as custom properties, visible focus, tabular numbers, the map-first three-column layout and a one-column layout under 900 px. Errors use neutral ink, because alert-red is reserved for hazards with an icon and a word.
- Source: plan Task 15 (plain UI), spec sections 22 and 22.1. The fonts and the token tests arrive with Task 39.
- Verified: hex values copied from the spec 22.1 table; build clean.

### feat(web): draw segments on a MapLibre map with percent plates and the OSM line
- What: `MapView` draws segment fills by `poaClass8` with the eight-step ramp, segment borders in the line colour, the printed percent on a bg-0 plate at each centre (HTML markers, so no remote glyph host is needed), fits the map to the segments once, and always shows the text line "Map data from OpenStreetMap". No basemap layers yet: those need the drill-site PMTiles extract from Task 10.
- Source: plan Task 15 (`web/src/map/MapView.tsx`), spec 22.1 (number on a plate, never on a fill), spec section 3 (OpenStreetMap license line).
- Verified: named exports checked in the maplibre-gl 6.19.0 type file (no default export); typecheck and build clean.

### feat(web): show merge lanes with sent and arrived times
- What: `MergeLanes` renders one lane per team from `mergeModel`: "No reports yet." while silent, and per card "sent 14:03 / arrived 14:21 (18 min without signal)", "on its way" before arrival, and "(phone clock looks wrong)" when the gap is negative or above 24 hours.
- Source: plan Task 15, spec 11.2 merge lanes.
- Verified: the lane data comes from `mergeModel` (10 unit tests); typecheck and build clean.
