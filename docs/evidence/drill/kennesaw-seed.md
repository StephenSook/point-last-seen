# Kennesaw Mountain drill: the seed, run on 2026-11-19

Status: SEEDED. The drill incident `drill-kennesaw-1` exists in the live project with made-up drill data. Nobody is
missing.

Kennesaw Mountain National Battlefield Park staff confirmed by email on 2026-11-19 that this training exercise does
not require a Special Use Permit, and suggested the trails south of Dallas Highway.

## The grid

`shared/grid/kennesaw-mountain-drill.grid.json`: 338 segments, 4.21 km2, from Kennesaw Mountain National
Battlefield Park (OpenStreetMap relation 143353, National Park Service) south of Dallas Highway (Georgia 120), which
crosses the park at about 33.945 to 33.952 north: the Kolb's Farm trails, the Cheatham Hill trails (Assault Trail,
Illinois Monument, Cease Fire) and Old John Ward. The window stops about 100 m below the road. Map data ©
OpenStreetMap contributors (ODbL). To rebuild it, with the outputs in a scratch folder:

```bash
# 1. The park relation (Overpass): relation["name"="Kennesaw Mountain National Battlefield Park"]; out geom;  -> park-raw.json
# 2. The site: the park's outline with its inholdings as holes, clipped to the window south of the road
npm run build-grid -w tools/grid-builder -- --site-from-osm park-raw.json --relation 143353 \
  --window 33.9070,-84.6110,33.9440,-84.5840 --out kennesaw-south.site.geojson
# 3. The features in that window (highway, waterway, natural and building ways and relations; out geom) from
#    https://overpass-api.de/api/interpreter -> kennesaw-south.osm.json
# 4. The grid, and the walkers' route graph from the same extract
npm run build-grid -w tools/grid-builder -- kennesaw-south.site.geojson kennesaw-mountain-drill \
  --osm kennesaw-south.osm.json --out kennesaw-mountain-drill.grid.json
npm run build-grid -w tools/grid-builder -- --graph kennesaw-mountain-drill.grid.json --osm kennesaw-south.osm.json \
  --out kennesaw-mountain-drill.graph.json
# 5. The basemap tiles, from a Protomaps Basemap daily build
pmtiles extract https://build.protomaps.com/20261118.pmtiles kennesaw-mountain-drill.pmtiles \
  --bbox=-84.6123,33.9058,-84.5828,33.9470
```

The committed grid came from an extract with OpenStreetMap data as of 2026-11-19 20:26 UTC. A later extract can
differ as the map is edited; `shared/grid/README.md` gives each file's sha256.

## Terrain

Urban, the default for a new incident: Atlanta-area parks count as urban for a Georgia search lead, and the park sits
inside suburban Cobb County. The incident carries `terrainNote`: "Default terrain column (urban), not verified for
this site." Temperate mountain is the other ISRID column that fits; command can switch to it in the terrain picker,
which writes the next prior version.

## What was run

From the repository root with the gcloud user's token. Each step is create-only or versioned.

1. The incident, its teams T1, T2 and T3, and its three join codes (in the macOS Keychain, never printed, under
   services `pls-drill-searcher-code`, `pls-drill-family-code` and `pls-drill-command-code`, account
   `drill-kennesaw-1`):
   `python3 -I tools/seed/seed_drill.py buildhybridai-2026-yg3m drill-kennesaw-1 "Training drill, Kennesaw Mountain (south of Dallas Highway)" T1 T2 T3`
2. The prior, from the scenario's point last seen on the Kolb Farm Loop Trail (33.92614, -84.59069), urban, with
   the near-feature layer on:
   `npm run build-grid -w tools/grid-builder -- --prior shared/grid/kennesaw-mountain-drill.grid.json --ipp 33.92614,-84.59069 --terrain urban --linear --out kennesaw.segments.json`
3. The segments and the prior at the incident's starting version:
   `python3 -I tools/seed/seed_segments.py buildhybridai-2026-yg3m drill-kennesaw-1 kennesaw.segments.json --prior-version 1`
4. The terrain note, by field path, on the incident: `terrainNote`.

Read back: the incident is a drill, open, labelled "Training drill. Nobody is missing.", grid
`kennesaw-mountain-drill`, terrain urban with its note, prior version 1 with `priorBuiltAt` set, teams T1, T2 and
T3, and 339 segment documents (338 and ROW). `npm run export -w tools/export-run -- --incident drill-kennesaw-1 --out
<scratch file>` passes every check.
