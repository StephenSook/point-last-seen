import { useRef, useState, type JSX, type KeyboardEvent, type PointerEvent } from "react";
import { farFirst, project, type CubeView } from "./project";
import type { CubePoint, CubeScene } from "./scene";

const SIZE = 400;
const TILT = 30;
const STEP = 15;
const KIND_WORD: Record<CubePoint["kind"], string> = { report: "Report", sighting: "Sighting", camera: "Camera sighting" };

function clock(tMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone }).format(tMs);
}

function waitWords(s: number | null): string {
  if (s === null) return "Phone clock not trusted";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`;
}

/** The marker at a bar's foot; kinds differ by shape, never by hue. */
function Foot({ kind, x, y }: { kind: CubePoint["kind"]; x: number; y: number }) {
  if (kind === "report") return <rect x={x - 3.5} y={y - 3.5} width={7} height={7} />;
  if (kind === "sighting") return <circle cx={x} cy={y} r={4} />;
  return <path d={`M ${x} ${y - 5} L ${x + 4.5} ${y + 3.5} L ${x - 4.5} ${y + 3.5} Z`} />;
}

export function SpaceTimeCube({ scene, timeZone }: { scene: CubeScene; timeZone: string }): JSX.Element {
  const [azimuthDeg, setAzimuth] = useState(30);
  const drag = useRef<{ x: number; az: number } | null>(null);
  const v: CubeView = { azimuthDeg, tiltDeg: TILT, size: SIZE };
  const P = (x: number, y: number, t: number) => project({ x, y, t }, scene, v);

  const h = scene.halfM;
  const floor = scene.floor.map((f) => ({ id: f.segmentId, d: f.ring.map(([x, y], i) => {
    const p = P(x, y, scene.t0);
    return `${i === 0 ? "M" : "L"} ${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`;
  }).join(" ") + " Z" }));
  const axisBase = P(-h, -h, scene.t0);
  const axisTop = P(-h, -h, scene.t1);
  const byId = new Map(scene.points.map((p) => [p.id, p]));
  const orderPath = scene.order.flatMap((id) => {
    const p = byId.get(id);
    return p ? [P(p.x, p.y, p.t0)] : [];
  });
  const bars = farFirst(scene.points.map((p) => {
    const foot = P(p.x, p.y, p.t0);
    const top = P(p.x, p.y, p.t1);
    // A faint drop line ties a point high in the cube to its place on the floor.
    const ground = P(p.x, p.y, scene.t0);
    return { p, foot, top, ground, depth: foot.depth };
  }));

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setAzimuth((a) => (a + (e.key === "ArrowRight" ? STEP : -STEP) + 360) % 360);
    }
  }
  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    drag.current = { x: e.clientX, az: azimuthDeg };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    // Drag turns the cube in the same 15 degree steps as the arrow keys.
    const raw = drag.current.az + (e.clientX - drag.current.x) * 0.5;
    setAzimuth(((Math.round(raw / STEP) * STEP) % 360 + 360) % 360);
  }

  const rows = [...scene.points].sort((a, b) => a.t0 - b.t0 || (a.id < b.id ? -1 : 1));
  return (
    <div className="extras-cube">
      <svg
        className="extras-cube-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Space-time view turned to ${azimuthDeg} degrees. The table below lists the same reports.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { drag.current = null; }}
        data-azimuth={azimuthDeg}
      >
        <g className="extras-cube-floor">{floor.map((f) => <path key={f.id} d={f.d} />)}</g>
        <line className="extras-cube-axis" x1={axisBase.sx} y1={axisBase.sy} x2={axisTop.sx} y2={axisTop.sy} />
        <text className="extras-cube-label" x={axisBase.sx - 6} y={axisBase.sy + 14} textAnchor="end">{clock(scene.t0, timeZone).slice(0, 5)}</text>
        <text className="extras-cube-label" x={axisTop.sx - 6} y={axisTop.sy} textAnchor="end">{clock(scene.t1, timeZone).slice(0, 5)}</text>
        {orderPath.length >= 2 && (
          <path className="extras-cube-order" d={orderPath.map((p, i) => `${i === 0 ? "M" : "L"} ${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`).join(" ")} />
        )}
        {bars.map(({ p, foot, top, ground }) => (
          <g key={p.id} className="extras-cube-point">
            {p.t0 > scene.t0 && <line className="extras-cube-drop" x1={ground.sx} y1={ground.sy} x2={foot.sx} y2={foot.sy} />}
            {p.t1 > p.t0 && (
              <line className={p.kind === "report" ? "extras-cube-bar" : "extras-cube-stem"} data-bar={p.id}
                x1={foot.sx} y1={foot.sy} x2={top.sx} y2={top.sy} />
            )}
            <Foot kind={p.kind} x={foot.sx} y={foot.sy} />
          </g>
        ))}
      </svg>
      <div className="extras-cube-legend">
        <p>Up is time.</p>
        <p>A bar is a report waiting for signal.</p>
        <p>Lines join confirmed sightings in order. They are not a track.</p>
      </div>
      <p className="muted small">Arrow keys or a drag turn the view.</p>
      <table className="extras-cube-table">
        <caption>The same reports as numbers</caption>
        <thead><tr><th scope="col">Report</th><th scope="col">Sent or seen</th><th scope="col">Arrived</th><th scope="col">Waited for signal</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} data-row={p.id} data-wait-s={p.waitS ?? ""}>
              <th scope="row">{KIND_WORD[p.kind]}</th>
              <td className="num">{clock(p.t0, timeZone)}</td>
              <td className="num">{clock(p.t1, timeZone)}</td>
              <td className="num">{waitWords(p.waitS)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
