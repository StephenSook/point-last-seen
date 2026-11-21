import { useEffect, useMemo, useState, type ChangeEvent, type JSX } from "react";
import { MapView, type MapLibreMap } from "../hostApp";
import { attachTrack, readTrack, trackCollection, trackUpTo, type Track } from "../track/track";
import type { ExtrasMapLike } from "../types";
import { framePlates } from "./framePlates";
import { lastReportRoute, pendingLine, runCarriesRoutes, type ReplayData } from "./replayData";
import { markTimes, nextMarkTime, playStops } from "./ruler";
import { attachOutline, outlineCollection } from "./outline";
import { changedSegments, frameKey, replayWindow, stateAt, type ReplayWindow } from "./stateAt";
import { TimeRuler } from "./TimeRuler";
import { attachTrail, legText, legs, trailCollections, trailOrder, trailPoints } from "./trail";
import { usePlayback } from "./usePlayback";

const NO_POA: Readonly<Record<string, number>> = {};
const REDUCE = "(prefers-reduced-motion: reduce)";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia === "function" && matchMedia(REDUCE).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const q = matchMedia(REDUCE);
    const on = () => setReduced(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * The replay of one incident: its map at the chosen time, the sightings trail and the time ruler. It prints the drill
 * line itself unless the page around it already does (`drillLine={false}`, the judge page, which shows it above its
 * heading). With `trackInput` (the command post only) it can draw a role-player's GPS track from a file on this
 * computer; the track is never uploaded, and the judge page never offers it.
 */
export function ReplayPanel({ data, drillLine = true, trackInput = false }: { data: ReplayData; drillLine?: boolean; trackInput?: boolean }): JSX.Element {
  const w = useMemo(() => replayWindow(data), [data]);
  if (w === null) return <p>No report has arrived yet, so there is nothing to replay.</p>;
  return <ReplayBody data={data} w={w} drillLine={drillLine} trackInput={trackInput} />;
}

function ReplayBody({ data, w, drillLine, trackInput }: { data: ReplayData; w: ReplayWindow; drillLine: boolean; trackInput: boolean }) {
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const reduced = useReducedMotion();
  const stops = useMemo(() => playStops(data, w), [data, w]);
  const { tMs, setT, playing, toggle } = usePlayback(w, stops, reduced);
  // Recompute the map only when the frame's content changes (an arrival, a plan, the prior mark), not on every
  // move of the slider: tMs moves the clock and the head line; the key moves the map.
  const key = frameKey(data, w, tMs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const frame = useMemo(() => stateAt(data, tMs), [data, w, key]);
  const marks = useMemo(() => markTimes(data, w), [data, w]);
  const hasRoutes = useMemo(() => runCarriesRoutes(data.events), [data]);
  const order = useMemo(() => trailOrder(trailPoints(frame)), [frame]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const changed = useMemo(() => changedSegments(data, tMs), [data, w, key]);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const walked = useMemo(() => (track ? trackUpTo(track, tMs) : null), [track, tMs]);

  // The outline goes on before the trail, so the trail's dots sit on top of it.
  useEffect(() => {
    if (!map) return;
    const outline = attachOutline(map as unknown as ExtrasMapLike);
    return () => outline.remove();
  }, [map]);
  useEffect(() => {
    if (!map) return;
    attachOutline(map as unknown as ExtrasMapLike).set(outlineCollection(data.segments, changed));
  }, [map, data, changed]);
  useEffect(() => {
    if (!map) return;
    const trail = attachTrail(map as unknown as ExtrasMapLike);
    return () => trail.remove();
  }, [map]);
  useEffect(() => {
    if (!map) return;
    attachTrail(map as unknown as ExtrasMapLike).set(trailCollections(frame));
  }, [map, frame]);
  // The role-player's track, only once a file is loaded: drawn under nothing else the replay owns, above the map.
  useEffect(() => {
    if (!map || !track) return;
    const t = attachTrack(map as unknown as ExtrasMapLike);
    return () => t.remove();
  }, [map, track]);
  useEffect(() => {
    if (!map || !walked) return;
    attachTrack(map as unknown as ExtrasMapLike).set(trackCollection(walked));
  }, [map, walked]);

  // Read in this browser only: the file never leaves this computer.
  async function loadTrack(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    let json: unknown;
    try {
      json = JSON.parse(await f.text());
    } catch {
      json = null;
    }
    const r = readTrack(json);
    setTrack(r.ok ? r.track : null);
    setTrackError(r.ok ? null : r.reason);
  }

  const step = (dir: 1 | -1) => {
    const t = nextMarkTime(marks, tMs, dir);
    if (t !== null) setT(t);
  };
  const prev = nextMarkTime(marks, tMs, -1);
  const next = nextMarkTime(marks, tMs, 1);
  // A run with no route on any report shows no route line, rather than "Route not reported" at every step.
  const route = hasRoutes ? lastReportRoute(frame.shown) : null;

  return (
    <div className="extras-replay" data-phase={frame.phase}>
      {drillLine && data.drillLabel && <p className="drill extras-drill-line">{data.drillLabel}</p>}
      {/* The scrubber sits right under the map, as a weather map's time bar does; Play is at its left. */}
      <div className="extras-replay-stage">
        {/* data-frame: each segment's percent and place as handed to the map, so a check can pair them. */}
        {/* data-outlined: the segments outlined as changed by the latest report, so a check can read them. */}
        <div
          className="extras-replay-map"
          data-frame={frame.phase === "replayable" ? JSON.stringify(framePlates(data.segments, frame.view.result.poa)) : undefined}
          data-outlined={changed.join(" ")}
          data-track-points={walked ? String(walked.lines.reduce((n, l) => n + l.length, 0)) : undefined}
        >
          <MapView segments={data.segments} poa={frame.phase === "replayable" ? frame.view.result.poa : NO_POA} onReady={setMap} attribution={data.gridAttribution ?? undefined} />
        </div>
        <TimeRuler data={data} w={w} tMs={tMs} onChange={setT} timeZone={timeZone} play={reduced ? null : { playing, toggle }} />
      </div>
      {/* The time and the report count are the slider's one clock, so the facts line has no clock of its own. */}
      <div className="extras-replay-facts" role={playing ? undefined : "status"}>
        {frame.phase === "replayable" ? (
          <>
            <span>Match code <span className="num" data-testid="replay-code">{frame.view.code}</span></span>
            <span>{frame.planVersion === null ? "No plan approved yet" : `Plan v${frame.planVersion}`}</span>
          </>
        ) : (
          <span data-testid="replay-not-stored">Earlier prior. The map for this time is not stored.</span>
        )}
        {changed.length > 0 && (
          <span data-testid="replay-changed">{changed.length === 1 ? "1 segment changed, outlined" : `${changed.length} segments changed, outlined`}</span>
        )}
        {route && <span data-testid="replay-route">Last report: {route}</span>}
      </div>
      {pendingLine(data) && <p className="muted">{pendingLine(data)}</p>}
      {order.length >= 2 && (
        <div className="extras-replay-legs">
          <p className="label">Order of confirmed sightings. Not a track.</p>
          <ol>
            {legs(order).map((l) => <li key={`${l.fromId}-${l.toId}`} className="num">{legText(l)}</li>)}
          </ol>
        </div>
      )}
      <div className="extras-replay-controls">
        <button type="button" className="btn ghost" onClick={() => step(-1)} disabled={prev === null}>Previous report</button>
        <button type="button" className="btn ghost" onClick={() => step(1)} disabled={next === null}>Next report</button>
      </div>
      {trackInput && (
        <div className="extras-track-load">
          <label>
            Load a GPS track from this computer{" "}
            <input type="file" accept=".json,application/json" onChange={(e) => void loadTrack(e)} />
          </label>
          <p className="muted">The role-player's track from the import tool. It is read here and never uploaded.</p>
          {trackError && <p role="alert">This track cannot be shown. {trackError}</p>}
          {track && (
            <p data-testid="track-label">
              {track.synthetic ? "SYNTHETIC track, made up for tests." : "The role-player's GPS track."} Run {track.runId}, grid {track.gridId}. Shown on this computer only.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
