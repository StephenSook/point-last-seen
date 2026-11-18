// Dev-server-only harness (web/harness/clip.html): the clip intake over the synthetic grid,
// with no Firebase. Reading prints what the post would pass to readClip and answers
// "could not read", so the form's checks and order can be tested with a generated clip.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { ClipReadOutcome } from "../ai/clipRead";
import { ClipIntake, type ClipIntakeInput } from "../camera/ClipIntake";
import { SightingCard } from "../camera/SightingCard";
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
const answer = new URLSearchParams(location.search).get("outcome") === "read" ? FIXED : ({ kind: "could-not-read" } as const);

function Harness() {
  const [camera, setCamera] = useState<LatLon | null>(null);
  const [asked, setAsked] = useState<ClipIntakeInput | null>(null);
  const [card, setCard] = useState<{ outcome: Extract<ClipReadOutcome, { kind: "read" }>; input: ClipIntakeInput } | null>(null);
  return (
    <main style={{ width: 340, padding: 16 }}>
      <p className="drill">Synthetic test grid and clip, not drill data.</p>
      <ClipIntake
        camera={camera}
        cameraSegmentId={camera ? segmentContaining(camera, HARNESS_SEGMENTS) : null}
        choices={segmentChoices(HARNESS_SEGMENTS)}
        onPlaceCamera={setCamera}
        onRead={async (input) => {
          setAsked(input);
          if (answer.kind === "read") setCard({ outcome: answer, input });
          return answer;
        }}
        onClose={() => {}}
      />
      {card && (
        <SightingCard
          reading={card.outcome.reading}
          clipStartMs={card.input.clipStartMs}
          bearingDeg={card.outcome.bearingDeg}
          colorSuppressed={card.outcome.colorSuppressed}
          cached={card.outcome.cached}
          clip={new Blob([card.input.bytes as BlobPart], { type: card.input.mimeType })}
        />
      )}
      <pre data-testid="asked">{asked ? JSON.stringify({ ...asked, bytes: asked.bytes.length }) : ""}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
