// The command post map: segments filled by POA lightness, a printed percent
// on a dark plate at each centre, and the OpenStreetMap license line.

import { Map as MlMap, Marker, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre looks for its worker next to its own module; after bundling that file is not there, so the
// build emits it as an asset and MapLibre is told where it is.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { deltaLabel, type ChangeResult } from "../command/changeModel";
import { motionScope, playReportBeat } from "../motion/engine";
import { reportBeatPlan } from "../motion/plan";
import { mapCredit } from "./credit";
import { useEffect, useRef } from "react";
import type { LatLon } from "./geo";
import { centreFeatures, MAP_INK, POA_RAMP, segmentFeatures, type MapSegment } from "./poaStyle";

const rampBy = (cls: unknown) => ["match", cls, 0, POA_RAMP[0], 1, POA_RAMP[1], 2, POA_RAMP[2], 3, POA_RAMP[3], 4, POA_RAMP[4], 5, POA_RAMP[5], 6, POA_RAMP[6], POA_RAMP[7]];
const FILL_COLOR = rampBy(["get", "cls"]);
const FILL_COLOR_OLD = rampBy(["coalesce", ["get", "clsOld"], ["get", "cls"]]);
// "fade" is per-segment feature state, 0 (old lightness) to 1 (new); absent means 1. The two
// layers trade opacity, so at 1 the old fill is gone and the map looks exactly as before the beat.
const FADE = ["coalesce", ["feature-state", "fade"], 1];

setWorkerUrl(workerUrl);

type Props = {
  segments: readonly MapSegment[];
  poa: Readonly<Record<string, number>>;
  /** When set, a click on the map reports its point (used to place a sighting). */
  onMapClick?: (p: LatLon) => void;
  pin?: LatLon | null;
  /** The grid's own license line (incident.gridAttribution). */
  attribution?: string | undefined;
  /** Segments moved by the newest report, largest move first. The three largest get the cyan outline and a chip. */
  moved?: readonly { segmentId: string; deltaPts: number }[];
  /** Called with the map once its style and sources exist, and with null when it is removed. */
  onReady?: (map: MlMap | null) => void;
  /** The newest report's change. When `key` changes after the first one seen, the REPORT beat plays. */
  beat?: { key: string; before: Readonly<Record<string, number>>; change: ChangeResult; distanceM: Readonly<Record<string, number>> } | null;
};

const NO_MOVED: readonly { segmentId: string; deltaPts: number }[] = [];
const movedFilter = (ids: string[]) => ["in", ["get", "segmentId"], ["literal", ids]] as never;

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

export function MapView({ segments, poa, onMapClick, pin = null, attribution, moved = NO_MOVED, onReady, beat = null }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const fitted = useRef(false);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const pinMarker = useRef<Marker | null>(null);
  const chips = useRef<Marker[]>([]);
  // Set once the style and our sources exist. isStyleLoaded() turns false again while a source updates,
  // so it cannot gate redraws: a redraw parked on "load" then would never run.
  const ready = useRef(false);
  const reduced = useRef(false);
  const lastBeatKey = useRef<string | null | undefined>(undefined);
  const beatRun = useRef<{ cancel(): void } | null>(null);

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
      m.addLayer({ id: "seg-fill-old", type: "fill", source: "segments", paint: { "fill-color": FILL_COLOR_OLD as never, "fill-opacity": ["*", 0.9, ["-", 1, FADE]] as never } });
      m.addLayer({ id: "seg-fill", type: "fill", source: "segments", paint: { "fill-color": FILL_COLOR as never, "fill-opacity": ["*", 0.9, FADE] as never } });
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
      // Moved by the newest report (22.1): 2 px cyan on a 2 px bg-0 casing each side, so it reads on every step.
      m.addLayer({ id: "moved-casing", type: "line", source: "segments", filter: movedFilter([]), paint: { "line-color": MAP_INK.edgeCasing, "line-width": 6 } });
      m.addLayer({ id: "moved-line", type: "line", source: "segments", filter: movedFilter([]), paint: { "line-color": MAP_INK.moved, "line-width": 2 } });
      ready.current = true;
      readyRef.current?.(m);
    });
    m.on("click", (e) => clickRef.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
    m.on("idle", () => el.current?.setAttribute("data-map-state", "idle"));
    map.current = m;
    const scope = motionScope((r) => {
      reduced.current = r;
    });
    return () => {
      beatRun.current?.cancel();
      scope.revert();
      for (const mk of [...markers.current, ...chips.current]) mk.remove();
      m.remove();
      map.current = null;
      ready.current = false;
      readyRef.current?.(null);
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      const fc = segmentFeatures(segments, poa, beat?.before);
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
  }, [segments, poa, beat?.before]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      // Only the three largest moves: a strong report nudges nearly every segment, and an all-cyan map says nothing.
      const top = moved.slice(0, 3);
      const ids = top.map((c) => c.segmentId);
      for (const id of ["moved-casing", "moved-line"]) if (m.getLayer(id)) m.setFilter(id, movedFilter(ids));
      for (const mk of chips.current) mk.remove();
      chips.current = top.flatMap((c) => {
        const seg = segments.find((x) => x.segmentId === c.segmentId);
        if (!seg) return [];
        // The marker's own element gets its opacity rewritten by MapLibre every frame, so the
        // visible chip is an inner element the beat can fade.
        const anchor = document.createElement("div");
        const chip = document.createElement("div");
        chip.className = "delta-chip";
        chip.dataset["testid"] = "delta-chip";
        chip.textContent = deltaLabel(c.deltaPts);
        anchor.append(chip);
        // Above the dot (the plate hangs below it).
        return [new Marker({ element: anchor, anchor: "bottom", offset: [0, -16] }).setLngLat([seg.centroid.lon, seg.centroid.lat]).addTo(m)];
      });
    };
    if (ready.current) draw();
    else m.once("load", draw);
  }, [moved, segments]);

  // The REPORT beat (22.1): lightness cross-fades nearest first, the cyan outline pulses once, the
  // chips rise. Not on the first change seen (a reload shows the final map); reduced motion shows
  // the final values at once and fades the chips in over 150 ms.
  useEffect(() => {
    const m = map.current;
    const key = beat?.key ?? null;
    const prev = lastBeatKey.current;
    lastBeatKey.current = key;
    if (!m || !beat || prev === undefined || prev === key || !ready.current) return;
    beatRun.current?.cancel();
    const index = new Map(segments.map((s, i) => [s.segmentId, i]));
    const ids = beat.change.changed.map((c) => c.segmentId).filter((id) => index.has(id));
    const setFade = (id: string, t: number) => m.setFeatureState({ source: "segments", id: index.get(id)! }, { fade: t });
    const chipEls = () => chips.current.flatMap((c) => (c.getElement().firstElementChild instanceof HTMLElement ? [c.getElement().firstElementChild as HTMLElement] : []));
    const wrap = el.current?.parentElement;
    wrap?.setAttribute("data-beat", "playing");
    if (!reduced.current) for (const id of ids) setFade(id, 0);
    for (const e of chipEls()) e.style.opacity = "0";
    beatRun.current = playReportBeat(reportBeatPlan(beat.change, beat.distanceM, reduced.current), {
      progress: (step, seg, t) => {
        if (step === "lightness" && seg) setFade(seg, t);
        else if (step === "pulse" && m.getLayer("moved-line")) m.setPaintProperty("moved-line", "line-width", 2 + 3 * Math.sin(Math.PI * t));
        else if (step === "chips" || step === "fade")
          for (const e of chipEls()) {
            e.style.opacity = String(t);
            e.style.translate = `0 ${(1 - t) * 6}px`;
          }
      },
      done: () => {
        for (const id of ids) setFade(id, 1);
        if (m.getLayer("moved-line")) m.setPaintProperty("moved-line", "line-width", 2);
        for (const e of chipEls()) {
          e.style.opacity = "1";
          e.style.translate = "";
        }
        wrap?.setAttribute("data-beat", "done");
      },
    });
  }, [beat?.key]);

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
