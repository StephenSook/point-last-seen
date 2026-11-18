// The OpenStreetMap credit is an ODbL license line, so it is shown exactly when
// something derived from OpenStreetMap is on screen: the search grid (built from
// an OpenStreetMap extract by tools/grid-builder) or the basemap. An empty map
// shows no credit.

export const OSM_CREDIT = "Map data from OpenStreetMap";

/** `gridAttribution` is the line the grid builder stamped on the incident; when segments are drawn it is shown as given. */
export function mapCredit(drawn: { segments: number; basemap: boolean; gridAttribution?: string | undefined }): string | null {
  if (drawn.segments > 0 && drawn.gridAttribution) return drawn.gridAttribution;
  return drawn.segments > 0 || drawn.basemap ? OSM_CREDIT : null;
}
