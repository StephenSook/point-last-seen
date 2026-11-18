// The OpenStreetMap credit is an ODbL license line, so it is shown exactly when
// something derived from OpenStreetMap is on screen: the search grid (built from
// an OpenStreetMap extract by tools/grid-builder) or the basemap. An empty map
// shows no credit.

export const OSM_CREDIT = "Map data from OpenStreetMap";

export function mapCredit(drawn: { segments: number; basemap: boolean }): string | null {
  return drawn.segments > 0 || drawn.basemap ? OSM_CREDIT : null;
}
