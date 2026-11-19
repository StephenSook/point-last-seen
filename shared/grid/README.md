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

## Credit and licence

Map data © OpenStreetMap contributors, available under the Open Database License (ODbL) 1.0:
https://www.openstreetmap.org/copyright. These grids are derived from OpenStreetMap data and are offered under
the same licence. Each file also carries this credit in its `attribution` field, which the map shows.
