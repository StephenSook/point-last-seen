// The person-in-view band (P-40, hand-off H4): an SVG strip over the clip's length. The cloud
// reading's span is solid; on-device checks, if a caller ever passes them, are hatched, so the
// sources differ by pattern, not by hue. A click shows the frame at that second; Enter shows
// the first second the person is in view.

import { useId, type JSX } from "react";
import { bandModel, bandText, intervalsFromReading, seconds, type BandInterval } from "./band";

const W = 300;
const H = 14;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Reading = { personVisible: boolean; firstSeen: string; lastSeen: string; keyFrame: { time: string } };

export function ClipBand({ durationS, reading, extra = [], onSeek }: { durationS: number | null; reading: Reading | null; extra?: readonly BandInterval[]; onSeek?: (s: number) => void }): JSX.Element {
  const hatch = useId();
  const intervals = [...(reading ? intervalsFromReading(reading) : []), ...extra];
  const m = bandModel(durationS, intervals, reading ? seconds(reading.keyFrame.time) : null, W);
  const first = intervals[0]?.startS ?? 0;
  const interactive = onSeek
    ? {
        role: "button",
        tabIndex: 0,
        "aria-label": `Show the frame at ${mmss(first)}`,
        onClick: (e: React.MouseEvent<SVGSVGElement>) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(Math.round(((e.clientX - r.left) / r.width) * m.scale));
        },
        onKeyDown: (e: React.KeyboardEvent<SVGSVGElement>) => {
          if (e.key === "Enter") onSeek(first);
        },
      }
    : { "aria-hidden": true };
  return (
    <div className="clip-band" data-testid="clip-band">
      <p className="small">{reading ? bandText(reading) : "No person seen."}{m.openEnded ? " Clip length not known." : ""}</p>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} {...interactive}>
        <defs>
          <pattern id={hatch} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--fg-2)" strokeWidth="2" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="var(--bg-3)" />
        {m.rects.map((r, i) => (
          <rect key={i} x={r.x} y="2" width={r.w} height={H - 4} fill={r.source === "cloud_read" ? "var(--fg-2)" : `url(#${hatch})`} />
        ))}
        {m.keyX !== null && <line x1={m.keyX} x2={m.keyX} y1="0" y2={H} stroke="var(--fg-1)" strokeWidth="2" />}
      </svg>
    </div>
  );
}
