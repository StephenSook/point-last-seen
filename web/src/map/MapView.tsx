// The command post map: segments filled by POA lightness, a printed percent
// on a dark plate at each centre, and the OpenStreetMap license line.

import { Map as MlMap, Marker, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre looks for its worker next to its own module; after bundling that file is not there, so the
// build emits it as an asset and MapLibre is told where it is.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { mapCredit } from "./credit";
import { useEffect, useRef } from "react";
import type { LatLon } from "./geo";
import { centreFeatures, MAP_INK, POA_RAMP, segmentFeatures, type MapSegment } from "./poaStyle";

const FILL_COLOR = ["match", ["get", "cls"], 0, POA_RAMP[0], 1, POA_RAMP[1], 2, POA_RAMP[2], 3, POA_RAMP[3], 4, POA_RAMP[4], 5, POA_RAMP[5], 6, POA_RAMP[6], POA_RAMP[7]];

setWorkerUrl(workerUrl);

type Props = {
  segments: readonly MapSegment[];
  poa: Readonly<Record<string, number>>;
  /** When set, a click on the map reports its point (used to place a sighting). */
  onMapClick?: (p: LatLon) => void;
  pin?: LatLon | null;
  /** The grid's own license line (incident.gridAttribution). */
  attribution?: string | undefined;
};

function bounds(segments: readonly MapSegment[]): [[number, number], [number, number]] | null {
  if (segments.length === 0) return null;
  let w = 180, s = 90, e = -180, n = -90;
  for (const seg of segments) {
    const rings = seg.geometry.type === "Polygon" ? seg.geometry.coordinates : seg.geometry.coordinates.flat();
    for (const ring of rings) for (const [x, y] of ring as [number, number][]) {
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
    }
  }
  return [[w, s], [e, n]];
}

export function MapView({ segments, poa, onMapClick, pin = null, attribution }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const fitted = useRef(false);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const pinMarker = useRef<Marker | null>(null);
  // Set once the style and our sources exist. isStyleLoaded() turns false again while a source updates,
  // so it cannot gate redraws: a redraw parked on "load" then would never run.
  const ready = useRef(false);

  useEffect(() => {
    if (!el.current) return;
    const m = new MlMap({
      container: el.current,
      style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#110F0D" } }] },
      center: [0, 0],
      zoom: 1,
      attributionControl: false,
    });
    m.on("load", () => {
      m.addSource("segments", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "seg-fill", type: "fill", source: "segments", paint: { "fill-color": FILL_COLOR as never, "fill-opacity": 0.9 } });
      // Edges: a bg-0 casing under an fg-4 line, so a boundary reads on dark and light steps alike.
      m.addLayer({ id: "seg-casing", type: "line", source: "segments", paint: { "line-color": MAP_INK.edgeCasing, "line-width": 3 } });
      m.addLayer({ id: "seg-line", type: "line", source: "segments", paint: { "line-color": MAP_INK.edgeLine, "line-width": 1 } });
      // Second signal: a dot at each centre, sized by probability (22.1).
      m.addSource("centres", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "centre-dot",
        type: "circle",
        source: "centres",
        paint: { "circle-radius": ["get", "r"], "circle-color": MAP_INK.dot, "circle-stroke-color": MAP_INK.dotRing, "circle-stroke-width": 1.5 },
      });
      ready.current = true;
    });
    m.on("click", (e) => clickRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
    m.on("idle", () => el.current?.setAttribute("data-map-state", "idle"));
    map.current = m;
    return () => {
      for (const mk of markers.current) mk.remove();
      m.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      const fc = segmentFeatures(segments, poa);
      (m.getSource("segments") as GeoJSONSource | undefined)?.setData(fc as never);
      (m.getSource("centres") as GeoJSONSource | undefined)?.setData(centreFeatures(segments, poa) as never);
      for (const mk of markers.current) mk.remove();
      markers.current = fc.features.flatMap((f, i) => {
        const seg = segments[i];
        if (!seg || f.properties.label === "") return [];
        const plate = document.createElement("div");
        plate.className = "plate";
        plate.textContent = f.properties.label;
        // The plate hangs just below the largest dot (14 px), so the number never covers the dot.
        return [new Marker({ element: plate, anchor: "top", offset: [0, 16] }).setLngLat([seg.centroid.lon, seg.centroid.lat]).addTo(m)];
      });
      const b = bounds(segments);
      if (b && !fitted.current) {
        m.fitBounds(b, { padding: 40, duration: 0 });
        fitted.current = true;
      }
    };
    if (ready.current) draw();
    else m.once("load", draw);
  }, [segments, poa]);

  useEffect(() => {
    const m = map.current;
    pinMarker.current?.remove();
    pinMarker.current = null;
    if (!m || !pin) return;
    const el = document.createElement("div");
    el.className = "pin";
    el.setAttribute("aria-label", "Sighting place");
    pinMarker.current = new Marker({ element: el }).setLngLat([pin.lon, pin.lat]).addTo(m);
  }, [pin]);

  // No basemap is drawn yet, so only the OSM-derived segments earn the credit.
  const credit = mapCredit({ segments: segments.length, basemap: false, gridAttribution: attribution });
  return (
    <div className={onMapClick ? "map-wrap picking" : "map-wrap"}>
      <div ref={el} className="map" data-testid="map" />
      {segments.length === 0 && <div className="map-empty">No segments yet. Build the prior to draw the map.</div>}
      {credit && (
        <div className="map-credit" data-testid="map-credit">
          {credit}
        </div>
      )}
    </div>
  );
}
