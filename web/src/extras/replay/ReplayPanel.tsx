import { useEffect, useMemo, useState, type JSX } from "react";
import { MapView, type MapLibreMap } from "../laneC";
import type { ExtrasMapLike } from "../types";
import { pendingLine, type ReplayData } from "./replayData";
import { clockLabel, markTimes, nextMarkTime } from "./ruler";
import { replayWindow, stateAt, type ReplayWindow } from "./stateAt";
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

/** The replay of one incident: its map at the chosen time, the sightings trail and the time ruler. */
export function ReplayPanel({ data }: { data: ReplayData }): JSX.Element {
  const w = useMemo(() => replayWindow(data), [data]);
  if (w === null) return <p>No report has arrived yet, so there is nothing to replay.</p>;
  return <ReplayBody data={data} w={w} />;
}

function ReplayBody({ data, w }: { data: ReplayData; w: ReplayWindow }) {
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const reduced = useReducedMotion();
  const { tMs, setT, playing, toggle } = usePlayback(w, reduced);
  const frame = useMemo(() => stateAt(data, tMs), [data, tMs]);
  const marks = useMemo(() => markTimes(data, w), [data, w]);
  const order = useMemo(() => trailOrder(trailPoints(frame)), [frame]);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    if (!map) return;
    const trail = attachTrail(map as unknown as ExtrasMapLike);
    return () => trail.remove();
  }, [map]);
  useEffect(() => {
    if (!map) return;
    attachTrail(map as unknown as ExtrasMapLike).set(trailCollections(frame));
  }, [map, frame]);

  const step = (dir: 1 | -1) => {
    const t = nextMarkTime(marks, tMs, dir);
    if (t !== null) setT(t);
  };
  const prev = nextMarkTime(marks, tMs, -1);
  const next = nextMarkTime(marks, tMs, 1);

  return (
    <div className="extras-replay" data-phase={frame.phase}>
      {data.drillLabel && <p className="drill extras-drill-line">{data.drillLabel}</p>}
      <div className="extras-replay-map">
        <MapView segments={data.segments} poa={frame.phase === "replayable" ? frame.view.result.poa : NO_POA} onReady={setMap} attribution={data.gridAttribution ?? undefined} />
      </div>
      <div className="extras-replay-facts" role={playing ? undefined : "status"}>
        <span className="num">{clockLabel(tMs, timeZone)}</span>
        <span>{frame.shown.length === 1 ? "1 report arrived" : `${frame.shown.length} reports arrived`}</span>
        {frame.phase === "replayable" ? (
          <>
            <span>Match code <span className="num" data-testid="replay-code">{frame.view.code}</span></span>
            <span>{frame.planVersion === null ? "No plan approved yet" : `Plan v${frame.planVersion}`}</span>
          </>
        ) : (
          <span data-testid="replay-not-stored">Earlier prior. The map for this time is not stored.</span>
        )}
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
      <TimeRuler data={data} w={w} tMs={tMs} onChange={setT} timeZone={timeZone} />
      <div className="extras-replay-controls">
        {!reduced && <button type="button" className="btn" onClick={toggle}>{playing ? "Pause" : "Play"}</button>}
        <button type="button" className="btn ghost" onClick={() => step(-1)} disabled={prev === null}>Previous report</button>
        <button type="button" className="btn ghost" onClick={() => step(1)} disabled={next === null}>Next report</button>
      </div>
    </div>
  );
}
