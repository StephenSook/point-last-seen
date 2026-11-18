// The camera sighting card (spec section 12.1): three facts (last-seen time, heading,
// clothing) and "See the frame", the clip's clearest frame with the model's box. Code, not
// the model, gives the time (clip start plus lastSeen) and the heading (facing plus exit edge).

import { lastSeenMs, type CameraSightingInput } from "@pls/engine";
import { useEffect, useState } from "react";

const POINTS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

export function compassName(deg: number): string {
  return POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const known = (v: string) => v.trim() !== "" && v !== "unknown" && v !== "none";

export function cardFacts(s: CameraSightingInput, clipStartMs: number, bearingDeg: number | null, colorSuppressed: boolean, timeZone?: string) {
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone }).format(lastSeenMs(clipStartMs, s.lastSeen));
  const top = [known(s.topColor) ? s.topColor : "", s.topType].filter(known).join(" ");
  const parts = [top, known(s.bottomColor) ? `${s.bottomColor} bottoms` : "", s.footwear, s.headwear].filter(known);
  if (s.carriedItems.length > 0) parts.push(`carrying ${s.carriedItems.join(", ")}`);
  const clothing = cap(parts.join(", ")) + (colorSuppressed ? " (night: no colors)" : "");
  return {
    time: `Last seen ${time}`,
    direction: bearingDeg === null ? "Direction not known" : `Heading ${compassName(bearingDeg)}`,
    clothing,
  };
}

function seconds(mmss: string): number {
  const [m, s] = mmss.split(":").map(Number);
  return (m ?? 0) * 60 + (s ?? 0);
}

/** The clearest frame from the local clip, paused at the model's key frame, with its box. */
function Frame({ clip, time, box }: { clip: Blob; time: string; box: number[] }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(clip);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [clip]);
  const [y0, x0, y1, x1] = box as [number, number, number, number];
  if (!url) return null;
  return (
    <div className="clip-frame" data-testid="clip-frame">
      <video
        src={url}
        muted
        playsInline
        preload="auto"
        aria-label={`Clip frame at ${time}`}
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = seconds(time);
        }}
      />
      <div className="clip-box" style={{ top: `${y0 / 10}%`, left: `${x0 / 10}%`, height: `${(y1 - y0) / 10}%`, width: `${(x1 - x0) / 10}%` }} />
    </div>
  );
}

type Props = {
  reading: CameraSightingInput;
  clipStartMs: number;
  bearingDeg: number | null;
  colorSuppressed: boolean;
  /** True when the reading was stored before: the clip was not sent again. */
  cached: boolean;
  /** The clip on this laptop, for "See the frame"; null when only the reading is here. */
  clip: Blob | null;
};

export function SightingCard({ reading, clipStartMs, bearingDeg, colorSuppressed, cached, clip }: Props) {
  const [showFrame, setShowFrame] = useState(false);
  const f = cardFacts(reading, clipStartMs, bearingDeg, colorSuppressed);
  return (
    <section className="clip-card" aria-label="Camera sighting" data-testid="clip-card">
      <p className="num">{f.time}</p>
      <p>{f.direction}</p>
      <p>{f.clothing}</p>
      {cached && <p className="muted small">Read before, not sent again.</p>}
      {clip && (
        <button type="button" className="btn ghost" aria-pressed={showFrame} onClick={() => setShowFrame((v) => !v)}>
          See the frame
        </button>
      )}
      {clip && showFrame && <Frame clip={clip} time={reading.keyFrame.time} box={reading.keyFrame.box2d} />}
    </section>
  );
}
