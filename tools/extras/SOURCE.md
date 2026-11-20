# Sources for tools/extras

## Ground elevation (build_elevation.py)

- **Service:** USGS Elevation Point Query Service (The National Map), `https://epqs.nationalmap.gov/v1/json`,
  documented at `https://apps.nationalmap.gov/epqs/` and `https://epqs.nationalmap.gov/v1/docs`. It reads the
  USGS 3D Elevation Program (3DEP). Answers are in metres (`units=Meters`).
- **Licence:** US public domain. The USGS page "Copyrights and Credits"
  (`https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits`, re-read 2026-11-18, and
  again 2026-11-20 before the drill site's run)
  says: "USGS-authored or produced data and information are considered to be in the U.S. Public Domain."
- **Credit line, as that page asks:** "Credit: U.S. Geological Survey". Every elevation file carries
  `"credit": "U.S. Geological Survey"`, and the terrain legend prints it.
- **One successful call:** 2026-11-18T22:15:59Z, HTTP 200, `application/json`, at one Piedmont Park cell
  centroid, value `258.837890625` m, `resolution: 1`.
- **Drill site run:** `kennesaw-mountain-drill`, 338 cells, 1,644 points, finished 2026-11-20T21:46:06Z
  (`web/public/extras/terrain/kennesaw-mountain-drill.elevation.json`, `fetchedAt` 2026-11-20).
- **What is sent:** only the sample points of grid cells (each cell's centroid and up to four points inside it).
  Never a start point, an address or anything about a person. The grid is public OpenStreetMap geography.
- **Pace:** one request a second or slower. Inside a run, only a server error is asked again, once, after 10 s;
  any other failed answer stops the run. The service page states no bulk-use policy; it links a separate Bulk
  Point Query tool. On 2026-11-20 its answers took 5 to 8 s, and now and then one was not JSON (the same point
  answered JSON when asked a minute later). So the drill site's run used `--cache`, at 1.5 to 2 s a request, and
  a stopped run was started again after 60 s: 7 runs in all, at most 25 allowed. NOT VERIFIED: the service's rate limit and its no-data value; the tool's
  range check (-500 to 9000 m) refuses a sentinel value either way.
- **NOT VERIFIED:** the vertical accuracy of 3DEP at a given site, so whether the display's 3 m "about level"
  band (ours) is wider than the data's error.
- **What it may claim:** a display layer only. The search prior has no elevation term.
