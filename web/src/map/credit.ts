// The OpenStreetMap credit is an ODbL license line, so it is shown exactly when
// something derived from OpenStreetMap is on screen: the search grid (built from
// an OpenStreetMap extract by tools/grid-builder) or the basemap. An empty map
// shows no credit. It is one short line, "© OpenStreetMap contributors", linked to
// OpenStreetMap's copyright page (their guideline for web maps), with
// " · Protomaps" linked to its attribution guidelines when the Protomaps basemap is drawn.

export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
export const PROTOMAPS_ATTRIBUTION_URL = "https://github.com/protomaps/basemaps#licensing-and-attribution-guidelines";

export function mapCredit(drawn: { segments: number; basemap: boolean }): { protomaps: boolean } | null {
  return drawn.segments > 0 || drawn.basemap ? { protomaps: drawn.basemap } : null;
}
