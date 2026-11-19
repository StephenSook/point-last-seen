# Kennesaw Mountain drill: the seed, ready and not run

Status: NOT RUN. Nothing below has written to the live project. It waits for the park's written permission. If the
park says no, the drill runs on the Piedmont Park grid (`drill-dev-1`) instead.

## The grid

`shared/grid/kennesaw-mountain-drill.grid.json`: 285 segments, 3.76 km2, from Kennesaw Mountain National
Battlefield Park (OpenStreetMap relation 143353, National Park Service) inside a 2.4 km window around the Visitor
Center and the Kennesaw Mountain and Little Kennesaw Mountain summits. Map data © OpenStreetMap contributors (ODbL).
To rebuild it, with the outputs in a scratch folder:

```bash
# 1. The park relation (Overpass): relation["name"="Kennesaw Mountain National Battlefield Park"]; out geom;  -> park-raw.json
# 2. The site: the park's outline with its inholdings as holes, clipped to the window
npm run build-grid -w tools/grid-builder -- --site-from-osm park-raw.json --relation 143353 \
  --window 33.9651,-84.5930,33.9869,-84.5670 --out kennesaw.site.geojson
# 3. The Overpass query for the site's box; run it at https://overpass-api.de/api/interpreter -> kennesaw.osm.json
npm run build-grid -w tools/grid-builder -- --query kennesaw.site.geojson > query.overpassql
# 4. The grid, and the walkers' route graph from the same extract
npm run build-grid -w tools/grid-builder -- kennesaw.site.geojson kennesaw-mountain-drill --osm kennesaw.osm.json \
  --out kennesaw-mountain-drill.grid.json
npm run build-grid -w tools/grid-builder -- --graph kennesaw-mountain-drill.grid.json --osm kennesaw.osm.json \
  --out kennesaw-mountain-drill.graph.json
```

The committed grid came from an extract with OpenStreetMap data as of 2026-11-19 02:06 UTC (743 elements). A later
extract can differ as the map is edited.

## Terrain

Urban, the default for a new incident: a Georgia SAR lead treats a big park around Atlanta as urban, and the park
sits inside suburban Cobb County. Temperate mountain is the other ISRID column that fits a forested mountain;
command can switch to it in the terrain picker, which writes the next prior version.

## Seeding the drill incident (after the permission, and after the urban terrain is on main)

Run from the repository root with the gcloud user's token. Each step is create-only or versioned.

1. Create the incident, its teams and its three join codes (kept in the macOS Keychain, never printed):
   `python3 -I tools/seed/seed_drill.py buildhybridai-2026-yg3m drill-kennesaw-1 "Kennesaw Mountain drill (synthetic)" T1 T2`
2. Build its prior from the scenario's point last seen (the Visitor Center, 33.98304, -84.57794, unless the drill
   plan names another point):
   `npm run build-grid -w tools/grid-builder -- --prior shared/grid/kennesaw-mountain-drill.grid.json --ipp 33.98304,-84.57794 --terrain urban --out kennesaw.segments.json`
3. Install the segments and the prior at the next version (the incident starts at version 1):
   `python3 -I tools/seed/seed_segments.py buildhybridai-2026-yg3m drill-kennesaw-1 kennesaw.segments.json --prior-version 2`
4. Check it: the incident reads terrain urban, priorVersion 2 and a priorBuiltAt; there are 286 segment documents
   (285 and ROW); `npm run export -w tools/export-run -- --incident drill-kennesaw-1 --out <scratch file>` passes
   every check.
