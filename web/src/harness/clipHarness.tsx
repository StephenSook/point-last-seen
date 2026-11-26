// Dev-server-only harness (web/harness/clip.html): the clip intake over the synthetic grid,
// with no Firebase. Reading prints what the post would pass to readClip and answers
// "could not read", so the form's checks and order can be tested with a generated clip.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { ClipReadOutcome } from "../ai/clipRead";
import type { TriageResult } from "../camera/triage";
import { CameraClipPanel, TRACK_FAILED, type TrackView } from "../camera/CameraClipPanel";
import type { ClipIntakeInput } from "../camera/ClipIntake";
import { segmentChoices, segmentContaining, type LatLon } from "../map/geo";
import "../theme/fonts.css";
import "../theme/base.css";
import { HARNESS_SEGMENTS } from "./mapHarness";

// ?outcome=read answers with a fixed reading that fits the 6 s test clip, to show the card.
const FIXED: ClipReadOutcome = {
  kind: "read", sha256: "0".repeat(64), cached: false, colorSuppressed: false, bearingDeg: 0, sentBytes: 5000,
  route: { platform: "web", path: "cloud", stage: "sdk", model: "gemini-3.5-flash-lite", reason: "sdk_only_in_cloud", latencyMs: 4100, sdkReported: true, blocked: null, decidedAtMs: 0 },
  reading: {
    personVisible: true, firstSeen: "00:01", lastSeen: "00:05", entryEdge: "right", exitEdge: "left",
    topColor: "blue", bottomColor: "black", topType: "rain jacket", footwear: "boots", headwear: "",
    carriedItems: ["umbrella"], keyFrame: { time: "00:04", box2d: [400, 300, 600, 700] },
    lighting: "day", legibility: "clear", evidence: "Synthetic reading for the harness.",
  },
};
const params = new URLSearchParams(location.search);
// ?outcome=failed-early: the read fails before any consent record exists; failed-late: after one was written.
const outcomes: Record<string, ClipReadOutcome> = {
  read: FIXED,
  "failed-early": { kind: "failed", recorded: false },
  "failed-late": { kind: "failed", recorded: true },
};
const answer: ClipReadOutcome = outcomes[params.get("outcome") ?? ""] ?? { kind: "could-not-read" };
// ?triage=no-model|no-motion|no-person|flagged: a fixed triage answer (no on-device model here).
const TRIAGE: Record<string, TriageResult> = {
  "no-model": { kind: "no-model" },
  "no-motion": { kind: "no-motion", latencyMs: 5 },
  "no-person": { kind: "no-person", windows: [], latencyMs: 5, source: "on_device" },
  flagged: { kind: "flagged", window: { startS: 1, endS: 5 }, windows: [], latencyMs: 5 },
};
const triage = params.get("triage");
// ?track=1: the time machine is on and the track read answers with a fixed track that walks the box right across
// the 6 s test clip; ?track=fail: the track read fails.
const trackMode = params.get("track");
const TRACK: TrackView = {
  status: "ready",
  durationS: 6,
  framesSent: 6,
  track: { version: "track-v1", window: { startS: 0, endS: 6 }, entries: [0, 1, 2, 3, 4, 5].map((t) => ({ t, box: [400, 100 + 100 * t, 600, 300 + 100 * t] as const, source: "cloud" as const })) },
};
// ?slowtriage=1: triage answers only on "Triage finishes", so a delete can land while it runs.
const slowTriage = params.get("slowtriage") === "1";
let finishTriage: (() => void) | null = null;
// ?track=slow: the track read answers only on "Track finishes", and the page records whether the job was still
// current then.
let finishTrack: (() => void) | null = null;

function Harness() {
  const [camera, setCamera] = useState<LatLon | null>(null);
  const [asked, setAsked] = useState<ClipIntakeInput | null>(null);
  const [confirmed, setConfirmed] = useState<string>("");
  const [how, setHow] = useState<string>("");
  // How many reads reached the model fake: a test of a second read waits for it before checking its options.
  const [calls, setCalls] = useState(0);
  // "Media deleted" stands for a delete of this search's media, from this seat or announced by another.
  const [revocation, setRevocation] = useState(0);
  const [trackCalls, setTrackCalls] = useState(0);
  const [trackCurrent, setTrackCurrent] = useState("");
  return (
    <main style={{ width: trackMode ? 1100 : 340, padding: 16 }}>
      <p className="drill">Synthetic test grid and clip, not drill data.</p>
      <CameraClipPanel
        camera={camera}
        cameraSegmentId={camera ? segmentContaining(camera, HARNESS_SEGMENTS) : null}
        choices={segmentChoices(HARNESS_SEGMENTS)}
        onPlaceCamera={setCamera}
        onTriage={triage ? async () => {
          if (slowTriage) await new Promise<void>((resolve) => (finishTriage = resolve));
          return TRIAGE[triage]!;
        } : undefined}
        onRead={async (input, h) => {
          setAsked(input);
          setHow(JSON.stringify(h));
          setCalls((n) => n + 1);
          return answer;
        }}
        onConfirm={(o, input) => {
          setConfirmed(JSON.stringify({ sha256: o.sha256, bearingDeg: o.bearingDeg, camera: input.camera }));
          return { version: 8, ack: Promise.resolve(), ...(new URLSearchParams(location.search).has("note") ? { note: "Rebuilt without downhill and level ground: the new start is outside the mapped segments." } : {}) };
        }}
        onClose={() => {}}
        revocation={revocation}
        timeMachine={trackMode !== null}
        onTrack={trackMode ? async (_o, _input, h) => {
          setTrackCalls((n) => n + 1);
          if (trackMode === "slow") {
            await new Promise<void>((resolve) => (finishTrack = resolve));
            setTrackCurrent(String(h.stillCurrent?.() ?? "unset"));
          }
          return trackMode === "fail" ? { status: "failed", message: TRACK_FAILED, durationS: 6 } : TRACK;
        } : undefined}
      />
      <button type="button" onClick={() => setRevocation((n) => n + 1)}>
        Media deleted
      </button>
      <button type="button" onClick={() => finishTriage?.()}>
        Triage finishes
      </button>
      <button type="button" onClick={() => finishTrack?.()}>
        Track finishes
      </button>
      <pre data-testid="track-calls">{trackCalls}</pre>
      <pre data-testid="track-current">{trackCurrent}</pre>
      <pre data-testid="confirmed">{confirmed}</pre>
      <pre data-testid="how">{how}</pre>
      <pre data-testid="calls">{calls}</pre>
      <pre data-testid="asked">{asked ? JSON.stringify({ ...asked, bytes: asked.bytes.length }) : ""}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
