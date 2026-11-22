import { useLayoutEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from "react";
import type { ReplayData } from "./replayData";
import { nextMark, reportCount, rulerModel, sliderScale, valueText, type MarkKind } from "./ruler";
import type { ReplayWindow } from "./stateAt";

// The SVG is drawn in CSS pixels at the track's measured width, so labels and shapes are never stretched.
const H = 56;
const SCALE_Y = 30;

function Mark({ kind, x }: { kind: MarkKind; x: number }) {
  // Marks differ by shape, never by hue.
  switch (kind) {
    case "report":
      return <rect x={x - 3.5} y={SCALE_Y - 16} width={7} height={7} />;
    case "sighting":
      return <circle cx={x} cy={SCALE_Y - 12.5} r={4} />;
    case "camera":
      return <path d={`M ${x} ${SCALE_Y - 17} L ${x + 4.5} ${SCALE_Y - 8} L ${x - 4.5} ${SCALE_Y - 8} Z`} />;
    case "plan":
      return <rect x={x - 1.5} y={SCALE_Y - 20} width={3} height={20} />;
    case "prior":
      return (
        <>
          <rect x={x - 4} y={SCALE_Y - 20} width={2} height={20} />
          <rect x={x + 2} y={SCALE_Y - 20} width={2} height={20} />
        </>
      );
  }
}

/**
 * The scrubber under the replay map: Play at its left (none with reduced motion), then the time track with its one
 * clock over the head. The span before the current prior came into use has no stored map and is shaded.
 */
export function TimeRuler({ data, w, tMs, onChange, timeZone, play }: {
  data: ReplayData;
  w: ReplayWindow;
  tMs: number;
  onChange: (t: number) => void;
  timeZone: string;
  play: { playing: boolean; toggle(): void } | null;
}): JSX.Element {
  const track = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => setW(Math.max(120, Math.round(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const m = useMemo(() => rulerModel(data, w, W, timeZone), [data, w, W, timeZone]);
  const span = Math.max(w.endMs - w.startMs, 1);
  const scale = useMemo(() => sliderScale(w), [w]);
  const toX = (t: number) => Math.min(W, Math.max(0, ((t - w.startMs) / span) * W));
  const toT = (x: number) => w.startMs + (x / W) * span;

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const step = e.shiftKey ? 60_000 : 10_000;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = tMs + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = tMs - step;
    else if (e.key === "." || e.key === ",") {
      const x = nextMark(m, toX(tMs), e.key === "." ? 1 : -1);
      if (x !== null) next = toT(x);
    } else return;
    e.preventDefault();
    if (next !== null) onChange(Math.min(w.endMs, Math.max(w.startMs, next)));
  }

  const head = toX(tMs);
  // The replay's one clock. The slider announces the same words, so the bubble itself is not read twice.
  const clock = valueText(tMs, w.startMs, reportCount(data, tMs));
  // No stored map from the window start until the current prior came into use (the whole window when never).
  const unstoredX = w.priorInUseFromMs > w.startMs ? toX(Math.min(w.priorInUseFromMs, w.endMs)) : 0;
  return (
    <div className="extras-scrubber">
      {play && (
        <button type="button" className="btn extras-scrubber-play" onClick={play.toggle}>
          {play.playing ? "Pause" : "Play"}
        </button>
      )}
      <div className="extras-ruler-track" ref={track}>
        <div className="extras-ruler-bubble" aria-hidden="true" style={{ left: `${Math.min(Math.max(head, 0), W)}px` }} data-edge={head < 90 ? "start" : head > W - 90 ? "end" : undefined}>
          {clock}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          {unstoredX > 0 && (
            <>
              <rect className="extras-ruler-unstored" x={0} y={0} width={unstoredX} height={SCALE_Y} />
              {unstoredX >= 100 && <text className="extras-ruler-unstored-label" x={4} y={9}>No stored map</text>}
            </>
          )}
          <line className="extras-ruler-scale" x1={0} x2={W} y1={SCALE_Y} y2={SCALE_Y} />
          {m.ticks.map((t) => (
            <g key={t.tMs}>
              <line className="extras-ruler-tick" x1={t.x} x2={t.x} y1={SCALE_Y} y2={SCALE_Y + (t.label ? 6 : 3)} />
              {/* A label at either edge hangs inward, so it is never cut off. */}
              {t.label && <text className="extras-ruler-label" x={t.x} y={H - 4} textAnchor={t.anchor}>{t.label}</text>}
            </g>
          ))}
          {m.spans.map((s) => <rect key={s.eventId} className="extras-ruler-span" x={s.x0} y={SCALE_Y + 8} width={Math.max(1, s.x1 - s.x0)} height={4} />)}
          {m.bands.map((b) => <rect key={b.eventId} className="extras-ruler-band" x={b.x0} y={SCALE_Y - 4} width={b.x1 - b.x0} height={4} />)}
          <g className="extras-ruler-marks">
            {m.marks.map((k) => <Mark key={k.id} kind={k.kind} x={k.x} />)}
          </g>
          <line className="extras-ruler-head" x1={head} x2={head} y1={0} y2={H} />
        </svg>
        <input
          type="range"
          className="extras-ruler-input"
          min={0}
          max={scale.max}
          step={1000}
          value={scale.valueOf(tMs)}
          aria-label="Replay time"
          aria-valuetext={clock}
          onChange={(e) => onChange(scale.timeOf(Number(e.target.value)))}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
