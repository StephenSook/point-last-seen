// The camera sighting card (spec section 12.1): three facts (last-seen time, heading,
// clothing) and "See the frame", the clip's clearest frame with the model's box. Code, not
// the model, gives the time (clip start plus lastSeen) and the heading (facing plus exit edge).

import { lastSeenMs, type CameraSightingInput, type RouteRecord } from "@pls/engine";
import { useEffect, useState } from "react";
import { receiptLines } from "../ai/receipt";
import { ClipBand } from "../extras/clip/ClipBand";
import type { TrackView } from "./CameraClipPanel";
import { ClipTimeMachine } from "./ClipTimeMachine";
import { trackSentLine } from "./timeMachine";

const POINTS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

// A read clip is stored with the search before Gemini reads it (deleted by command, or at 30 days
// by the bucket lifecycle rule); the receipt says so, matching the clip form's cloud consent.
export const CLIP_STORED_LINE = "Stored: the clip, with this search, until command deletes it or for 30 days.";

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

/** The local clip paused at a second; the model's box is drawn only at its key frame. */
function Frame({ clip, atS, box }: { clip: Blob; atS: number; box: number[] | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(clip);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [clip]);
  if (!url) return null;
  const [y0, x0, y1, x1] = (box ?? [0, 0, 0, 0]) as [number, number, number, number];
  return (
    <div className="clip-frame" data-testid="clip-frame">
      <video
        src={url}
        muted
        playsInline
        preload="auto"
        aria-label={`Clip frame at ${atS} s`}
        ref={(v) => {
          if (v && v.readyState >= 1 && v.currentTime !== atS) v.currentTime = atS;
        }}
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = atS;
        }}
      />
      {box && <div className="clip-box" style={{ top: `${y0 / 10}%`, left: `${x0 / 10}%`, height: `${(y1 - y0) / 10}%`, width: `${(x1 - x0) / 10}%` }} />}
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
  /** The clip's length in whole seconds, for the person-in-view band; null when not known. */
  durationS?: number | null;
  /** Where the read ran and what it sent, for the "What ran" receipt (absent: no receipt). */
  route?: RouteRecord | null;
  sentBytes?: number;
  /** The clip's track for the time machine (absent: no track read was asked for). */
  track?: TrackView | null;
  /** Remote Config time_machine_enabled. */
  timeMachine?: boolean;
};

export function SightingCard({ reading, clipStartMs, bearingDeg, colorSuppressed, cached, clip, durationS = null, route = null, sentBytes, track = null, timeMachine = false }: Props) {
  // The second the clip is shown at; null while it is hidden.
  const [frameS, setFrameS] = useState<number | null>(null);
  const [machineOpen, setMachineOpen] = useState(false);
  const machineS = track && track.status !== "reading" && track.durationS ? track.durationS : durationS;
  const canOpen = clip !== null && timeMachine && track?.status !== "reading" && !!machineS;
  const keyS = seconds(reading.keyFrame.time);
  const f = cardFacts(reading, clipStartMs, bearingDeg, colorSuppressed);
  return (
    <section className="clip-card" aria-label="Camera sighting" data-testid="clip-card">
      <p className="num">{f.time}</p>
      <p>{f.direction}</p>
      <p>{f.clothing}</p>
      <ClipBand durationS={durationS} reading={reading} onSeek={clip ? setFrameS : undefined} />
      {cached && <p className="muted small">The sighting was read before; the clip was not sent again for it.</p>}
      {route && sentBytes !== undefined && (
        <details className="receipt">
          <summary>What ran</summary>
          {receiptLines({ asked: "the cloud, with the clip's three consents", route, sentBytes, what: "the clip, as base64" })
            .map((l) => (cached && l.startsWith("Sent:") ? "Sent for the sighting: nothing now; it came from an earlier read of the same clip." : l))
            .map((l) => (
              <p key={l} className="small">{l}</p>
            ))}
          <p className="small">{CLIP_STORED_LINE}</p>
          {track && track.status !== "reading" && track.sent && <p className="small">{trackSentLine(track.sent.frames, track.sent.outlineFrames)}</p>}
        </details>
      )}
      {track?.status === "reading" && <p className="muted small" role="status">Tracking the person in the clip.</p>}
      {track?.status === "failed" && <p className="muted small" role="status">{track.message}</p>}
      {clip && (
        <button type="button" className="btn ghost" aria-pressed={frameS === keyS} onClick={() => setFrameS((v) => (v === keyS ? null : keyS))}>
          See the frame
        </button>
      )}
      {clip && frameS !== null && <Frame clip={clip} atS={frameS} box={frameS === keyS ? reading.keyFrame.box2d : null} />}
      {canOpen && (
        <button type="button" className="btn ghost" aria-pressed={machineOpen} onClick={() => setMachineOpen((v) => !v)}>
          Open the time machine
        </button>
      )}
      {canOpen && machineOpen && clip && machineS && (
        <ClipTimeMachine clip={clip} durationS={machineS} reading={reading} track={track?.status === "ready" ? track.track : null} />
      )}
    </section>
  );
}
