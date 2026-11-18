// Dev-server-only harness (web/harness/clip.html): the clip intake over the synthetic grid,
// with no Firebase. Reading prints what the post would pass to readClip and answers
// "could not read", so the form's checks and order can be tested with a generated clip.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { ClipReadOutcome } from "../ai/clipRead";
import type { TriageResult } from "../camera/triage";
import { CameraClipPanel } from "../camera/CameraClipPanel";
import type { ClipIntakeInput } from "../camera/ClipIntake";
import { segmentChoices, segmentContaining, type LatLon } from "../map/geo";
import "../theme/fonts.css";
import "../theme/base.css";
import { HARNESS_SEGMENTS } from "./mapHarness";

// ?outcome=read answers with a fixed reading that fits the 6 s test clip, to show the card.
const FIXED: ClipReadOutcome = {
  kind: "read", sha256: "0".repeat(64), cached: false, colorSuppressed: false, bearingDeg: 0, route: null,
  reading: {
    personVisible: true, firstSeen: "00:01", lastSeen: "00:05", entryEdge: "right", exitEdge: "left",
    topColor: "blue", bottomColor: "black", topType: "rain jacket", footwear: "boots", headwear: "",
    carriedItems: ["umbrella"], keyFrame: { time: "00:04", box2d: [400, 300, 600, 700] },
    lighting: "day", legibility: "clear", evidence: "Synthetic reading for the harness.",
  },
};
const params = new URLSearchParams(location.search);
const answer = params.get("outcome") === "read" ? FIXED : ({ kind: "could-not-read" } as const);
// ?triage=no-model|no-motion|no-person|flagged: a fixed triage answer (no on-device model here).
const TRIAGE: Record<string, TriageResult> = {
  "no-model": { kind: "no-model" },
  "no-motion": { kind: "no-motion", latencyMs: 5 },
  "no-person": { kind: "no-person", windows: [], latencyMs: 5 },
  flagged: { kind: "flagged", window: { startS: 1, endS: 5 }, windows: [], latencyMs: 5 },
};
const triage = params.get("triage");

function Harness() {
  const [camera, setCamera] = useState<LatLon | null>(null);
  const [asked, setAsked] = useState<ClipIntakeInput | null>(null);
  const [confirmed, setConfirmed] = useState<string>("");
  const [how, setHow] = useState<string>("");
  return (
    <main style={{ width: 340, padding: 16 }}>
      <p className="drill">Synthetic test grid and clip, not drill data.</p>
      <CameraClipPanel
        camera={camera}
        cameraSegmentId={camera ? segmentContaining(camera, HARNESS_SEGMENTS) : null}
        choices={segmentChoices(HARNESS_SEGMENTS)}
        onPlaceCamera={setCamera}
        priorVersion={8}
        onTriage={triage ? async () => TRIAGE[triage]! : undefined}
        onRead={async (input, h) => {
          setAsked(input);
          setHow(JSON.stringify(h));
          return answer;
        }}
        onConfirm={(o, input) => {
          setConfirmed(JSON.stringify({ sha256: o.sha256, bearingDeg: o.bearingDeg, camera: input.camera }));
          return { version: 8, ack: Promise.resolve() };
        }}
        onClose={() => {}}
      />
      <pre data-testid="confirmed">{confirmed}</pre>
      <pre data-testid="how">{how}</pre>
      <pre data-testid="asked">{asked ? JSON.stringify({ ...asked, bytes: asked.bytes.length }) : ""}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
