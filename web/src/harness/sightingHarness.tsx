// Dev-server-only harness (web/harness/sighting.html): the sighting form over the
// synthetic grid, with no Firebase. Saving prints what the post would store, so the
// keyboard placing path can be checked end to end. Model reads are refused here.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SightingForm } from "../command/SightingForm";
import type { SightingInput } from "../data/sightings";
import { segmentChoices, segmentContaining, type LatLon } from "../map/geo";
import "../theme/fonts.css";
import "../theme/base.css";
import { HARNESS_SEGMENTS } from "./mapHarness";

function Harness() {
  const [place, setPlace] = useState<LatLon | null>(null);
  const [saved, setSaved] = useState<SightingInput | null>(null);
  return (
    <main style={{ width: 340, padding: 16 }}>
      <p className="drill">Synthetic test grid, not drill data.</p>
      <SightingForm
        place={place}
        placeSegmentId={place ? segmentContaining(place, HARNESS_SEGMENTS) : null}
        choices={segmentChoices(HARNESS_SEGMENTS)}
        onPlace={setPlace}
        onSave={async (input) => setSaved(input)}
        readNote={async () => ({ refused: "no-on-device-model" })}
        readNoteInCloud={async () => ({ refused: "not-in-cloud" })}
        onClose={() => {}}
      />
      <pre data-testid="saved">{saved ? JSON.stringify(saved.position) : ""}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
