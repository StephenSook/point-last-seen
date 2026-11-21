// Dev-server-only harness (web/harness/sighting.html): the sighting form over the
// synthetic grid, with no Firebase. Saving prints what the post would store, so the
// keyboard placing path can be checked end to end. Model reads are refused here, except ?read=slow: the
// laptop read answers (top red) only when "Model answers" is pressed, so the note can change first.

import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { SightingForm } from "../command/SightingForm";
import type { SightingRead } from "../ai/sightingText";
import type { SightingInput } from "../data/sightings";
import { segmentChoices, segmentContaining, type LatLon } from "../map/geo";
import "../theme/fonts.css";
import "../theme/base.css";
import { HARNESS_SEGMENTS } from "./mapHarness";

function Harness() {
  const [place, setPlace] = useState<LatLon | null>(null);
  const [saved, setSaved] = useState<SightingInput | null>(null);
  const answer = useRef<(() => void) | null>(null);
  const slow = new URLSearchParams(location.search).get("read") === "slow";
  // ?quote=...: the evidence quote the slow read answers with (default none).
  const quote = new URLSearchParams(location.search).get("quote") ?? "";
  // ?read=cloud: no laptop model; after the consent tap the cloud answers (top red) with its route and size.
  const cloud = new URLSearchParams(location.search).get("read") === "cloud";
  // ?lang=other: the cloud read's language screen refuses the note.
  const notEnglish = new URLSearchParams(location.search).get("lang") === "other";
  // ?paused=1: command has paused cloud reading before the form opens; ?paused=late: it pauses after the consent tap.
  const paused = new URLSearchParams(location.search).get("paused");
  // ?read=timeout: the laptop's model does not answer within the read's time limit.
  const timeout = new URLSearchParams(location.search).get("read") === "timeout";
  return (
    <main style={{ width: 340, padding: 16 }}>
      <p className="drill">Synthetic test grid, not drill data.</p>
      <SightingForm
        cloudPaused={paused === "1"}
        place={place}
        placeSegmentId={place ? segmentContaining(place, HARNESS_SEGMENTS) : null}
        choices={segmentChoices(HARNESS_SEGMENTS)}
        onPlace={setPlace}
        onSave={async (input) => setSaved(input)}
        readNote={
          slow
            ? () =>
                new Promise<SightingRead>((resolve) => {
                  answer.current = () => resolve({ reading: { direction: "unknown", topColor: "red", bottomColor: "unknown", footwear: "", carried: "", evidenceQuote: quote } });
                })
            : timeout
              ? async () => ({ refused: "timeout" as const })
              : async () => ({ refused: "no-on-device-model" })
        }
        readNoteInCloud={async (text) =>
          paused === "late"
            ? { refused: "cloud-paused" as const }
            : notEnglish
            ? { refused: "not-english" as const }
            : cloud
            ? {
                reading: { direction: "unknown", topColor: "red", bottomColor: "unknown", footwear: "", carried: "", evidenceQuote: "" },
                route: { platform: "web", path: "cloud", stage: "sdk", model: "gemini-3.5-flash-lite", reason: "consented_cloud_read", latencyMs: 800, sdkReported: true, blocked: null, decidedAtMs: 0 },
                sentBytes: new TextEncoder().encode(text).length,
              }
            : { refused: "not-in-cloud" }
        }
        onClose={() => {}}
      />
      {slow && (
        <button type="button" onClick={() => answer.current?.()}>
          Model answers
        </button>
      )}
      <pre data-testid="saved">{saved ? JSON.stringify(saved.position) : ""}</pre>
      <pre data-testid="saved-read">{saved ? JSON.stringify(saved.readFilled ?? null) : ""}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
