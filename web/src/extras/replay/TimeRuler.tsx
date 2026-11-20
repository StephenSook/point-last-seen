import { useLayoutEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from "react";
import type { ReplayData } from "./replayData";
import { elapsedLabel, nextMark, rulerModel, sliderScale, valueText, type MarkKind } from "./ruler";
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

export function TimeRuler({ data, w, tMs, onChange, timeZone }: {
  data: ReplayData;
  w: ReplayWindow;
  tMs: number;
  onChange: (t: number) => void;
  timeZone: string;
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
  return (
    <div className="extras-ruler">
      {/* The clock is in the facts line above; the slider announces both, so this readout is not read twice. */}
      <div className="extras-ruler-clock" aria-hidden="true">
        <span>Elapsed</span> <span className="extras-ruler-elapsed">{elapsedLabel(tMs, w.startMs)}</span>
      </div>
      <div className="extras-ruler-track" ref={track}>
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          <line className="extras-ruler-scale" x1={0} x2={W} y1={SCALE_Y} y2={SCALE_Y} />
          {m.ticks.map((t) => (
            <g key={t.tMs}>
              <line className="extras-ruler-tick" x1={t.x} x2={t.x} y1={SCALE_Y} y2={SCALE_Y + (t.label ? 6 : 3)} />
              {/* A label at either edge hangs inward, so it is never cut off. */}
              {t.label && <text className="extras-ruler-label" x={t.x} y={H - 4} textAnchor={t.x < 20 ? "start" : t.x > W - 20 ? "end" : "middle"}>{t.label}</text>}
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
          aria-valuetext={valueText(tMs, w.startMs, timeZone)}
          onChange={(e) => onChange(scale.timeOf(Number(e.target.value)))}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
