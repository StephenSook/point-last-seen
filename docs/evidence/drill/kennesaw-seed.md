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

## Re-seeded at prior version 2, 2026-11-19

The first seed's segments had no `priorVersion` or `ringPoa`, which a segment written by the command post's prior
rebuild carries, so the iPhone could not build its mission ("The search area could not be read"). Steps 2 and 3 were
run again with the fixed tools, from the same grid, point last seen, terrain and layer, at `--prior-version 2`. The
seed tool now checks its docs against the apps' segment shape before writing and after:
`python3 -I tools/seed/segment_contract.py buildhybridai-2026-yg3m drill-kennesaw-1` reports 339 docs at prior
version 2, readable by the apps. The incident's other fields, its teams, its join codes and its terrain note are
unchanged.

## Re-seeded at prior version 3, temperate mountain, 2026-11-21

Before the drill, the terrain was set to temperate mountain: the grid is a wooded, hilly battlefield park, and on urban
terrain the Downhill and level ground layer is not used. Steps 2 and 3 were run again from the same grid, point last
seen and near-feature layer, with `--terrain temperate_mountain`, at `--prior-version 3` (the seed tool refuses a
reseed over an existing grid at the same version):
`npm run build-grid -w tools/grid-builder -- --prior <repo>/shared/grid/kennesaw-mountain-drill.grid.json --ipp 33.92614,-84.59069 --terrain temperate_mountain --linear --out kennesaw.segments.json`
(the `--prior` path is resolved from `tools/grid-builder`, so give it in full), then
`python3 -I tools/seed/seed_segments.py buildhybridai-2026-yg3m drill-kennesaw-1 kennesaw.segments.json --prior-version 3`.
The terrain note was set by field path to "Temperate mountain column, set before the drill for a wooded, hilly park;
not verified for this site."

Read back: terrain temperate_mountain, prior version 3, 339 documents at version 3 with the same ids as before (the
seed deleted none), `segment_contract.py` "339 docs at prior version 3, readable by the apps", teams T1, T2 and T3,
and no events or plans. The mass outside the grid (ROW) went from 0.6306 with the urban rings to 0.5532 with the
temperate mountain rings (0.3, 0.8, 1.9 and 8.3 km). The start segment, HE, has an elevation (294.45 m), so the
Downhill and level ground switch can be used.

## Back to urban at prior version 4, 2026-11-22

The project write-up opens with a local search and rescue lead's advice for this kind of park: "Well, I would treat it
as Urban." The drill's map starts that way, and so does the film. The terrain was switched through the live command
post, not by a seed: a command seat joined the drill (2026-11-22 20:36:31 UTC), chose "Urban (suburb, town, big
park)" in the Prior section's Distance table and pressed Rebuild prior. That wrote prior version 4 at 20:38:10 UTC,
with the near-feature layer on and the Downhill and level ground layer off (the urban table has no elevation split).
Command cannot write the terrain note, so it was set by field path to "Urban column, as a local search and rescue lead
advised for this kind of park; not verified for this site."

Read back: terrain urban, prior version 4, 339 documents at version 4, `segment_contract.py` "339 docs at prior
version 4, readable by the apps", and the urban rings (0.3, 1.1, 3.2 and 12.6 km). The mass outside the grid (ROW) is
0.6306, as with the first seed's urban rings. In the same session, command approved plan 1 from Suggest plan (Team 1
on HE, Team 2 on GT, Team 3 on HR, all trail segments within 200 m of the start), the family app shared the drill's
made-up profile, and command sent the family one rehearsal question.

