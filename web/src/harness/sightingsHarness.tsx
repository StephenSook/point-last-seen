// Dev-server-only harness (web/harness/sightings.html): the sightings panel with a family report that has no
// place yet and a caller's report that has one. "Place on map" is recorded on the page. No Firebase.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { EventDoc } from "@pls/engine";
import { SightingsPanel } from "../command/SightingsPanel";
import type { SightingCard } from "../command/sightingCards";
import "../theme/fonts.css";
import "../theme/base.css";

const base = { schemaVersion: 1, incidentId: "I1", teamId: null, seq: 1, clientTimeMs: 1, serverTime: null, isTrainingInject: false, route: null, planVersion: null, priorVersion: 1, inputMethod: "typed", targetEventId: null, decision: null, observedAtMs: 1795859000000 };
const family = { ...base, eventId: "f".repeat(32), deviceId: "fam", authorUid: "fam", role: "family", type: "sighting", reporter: "family", position: null, positionSource: "none", rawText: "Where: by the creek. Blue coat", reading: null, effect: { kind: "none", why: "needs_command" } } as unknown as EventDoc;
const caller = { ...base, eventId: "c".repeat(32), deviceId: "cmd", authorUid: "cmd", role: "command", type: "sighting", reporter: "public_caller", position: { lat: 1, lon: 1, accuracyM: null }, positionSource: "map_click", rawText: null, reading: null, effect: { kind: "clue", influences: { AA: "strong_for" }, authenticity: "medium" } } as unknown as EventDoc;
const cards: SightingCard[] = [
  { sighting: family, status: "awaiting", needsPlace: true, outside: false },
  { sighting: caller, status: "awaiting", needsPlace: false, outside: false },
];

function Harness() {
  const [placing, setPlacing] = useState("");
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic reports, not drill data.</p>
      <SightingsPanel cards={cards} segmentOf={(c) => (c.needsPlace ? null : "AA")} onDecide={async () => {}} onPlace={(c) => setPlacing(c.sighting.eventId)} />
      <pre data-testid="placing">{placing}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
