# Search grids

Each `<site>.grid.json` divides a search area into segments (`tools/grid-builder`, `build-grid`), with each
segment's area, centroid, neighbours, stream links and its share near roads, trails, streams and water.

- `piedmont-park-dev.grid.json`: the development site, Piedmont Park in Atlanta, Georgia, United States. It is
  the grid the drill incident and every judge's practice search use until the drill site is chosen. Built
  from an OpenStreetMap extract of the park on 2026-11-18.

- `kennesaw-mountain-drill.grid.json`: a second drill site, ready but not yet used: Kennesaw Mountain National
  Battlefield Park, Cobb County, Georgia (OpenStreetMap relation 143353, operated by the National Park Service).
  The whole park would need about 945 cells, more than one prior batch can write, so the site is the park inside a
  2.4 km window around the Visitor Center and the Kennesaw Mountain and Little Kennesaw Mountain summits
  (south 33.9651, west -84.5930, north 33.9869, east -84.5670): 285 segments, 3.76 km2, with the park's private
  inholdings kept out as holes. Built from an OpenStreetMap extract of that window read on 2026-11-19 (data as of
  02:06 UTC), with `build-grid --site-from-osm`, `--query` and the grid build. Its drill incident starts urban (a
  big park inside suburban Cobb County); temperate mountain is the other column that fits, and command can switch
  it in the terrain picker.

## The development site's route graph and basemap tiles

The deployed grid has two more files beside it, which the web build copies to `/tiles/`:

- `piedmont-park-dev.graph.json`: the route graph the walkers model moves on (1,549 edges, 1,203 nodes), bounded
  by the grid's box. It rebuilds byte for byte from the grid and the same OpenStreetMap extract with
  `build-grid --graph shared/grid/piedmont-park-dev.grid.json --osm <extract> --out <file>`
  (sha256 `64e6bd89b0f7750c6013b85f18edbd8e7dfb6bd187480aa24f7ff4ba83c7ccc1`).
- `piedmont-park-dev.pmtiles`: the basemap, cut with `pmtiles extract` from a Protomaps Basemap daily build
  (basemap 4.15.2, OpenStreetMap data as of 2026-11-18 04:00 UTC, zoom 0 to 15, bounds west -84.3821, south
  33.7792, east -84.3645, north 33.7989). Daily builds expire, so this file is kept rather than rebuilt
  (sha256 `ea2a879d9e6d2298905a00254eeb55e8bf7b0e93d406d30d3636d5fc1f2b71c5`).

## Credit and licence

Map data © OpenStreetMap contributors, available under the Open Database License (ODbL) 1.0:
https://www.openstreetmap.org/copyright. These grids are derived from OpenStreetMap data and are offered under
the same licence. Each file also carries this credit in its `attribution` field, which the map shows. The basemap
tiles are Protomaps Basemap layers (https://protomaps.com) derived from OpenStreetMap, under the same ODbL terms,
and from Natural Earth, which is in the public domain.
