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
const camReading = { sighting: { personVisible: true, firstSeen: "00:01", lastSeen: "00:05", entryEdge: "right", exitEdge: "left", topColor: "green", bottomColor: "black", topType: "", footwear: "", headwear: "", carriedItems: [], keyFrame: { time: "00:04", box2d: [400, 300, 600, 700] }, lighting: "day", legibility: "clear", evidence: "x" }, clipSha256: "d".repeat(64), clipStartMs: 1795859000000, clockConfirmed: true, cameraFacingDeg: 90 };
const familyCam = { ...base, eventId: "a".repeat(32), deviceId: "fam", authorUid: "fam", role: "family", type: "camera_sighting", reporter: "camera", position: null, positionSource: "none", rawText: null, inputMethod: "clip", reading: camReading, effect: { kind: "none", why: "incorporated_in_prior" } } as unknown as EventDoc;
const three: SightingCard[] = [
  { sighting: family, status: "awaiting", needsPlace: true, outside: false, camera: false },
  { sighting: caller, status: "awaiting", needsPlace: false, outside: false, camera: false },
  { sighting: familyCam, status: "awaiting", needsPlace: true, outside: false, camera: true },
];
// ?many=1: five more callers' reports, a decided one first in the list (the panel puts every awaiting one first).
const more = (n: number, status: SightingCard["status"]): SightingCard => ({
  sighting: { ...caller, eventId: String(n).repeat(32), rawText: `Caller ${n}.` } as EventDoc, status, needsPlace: false, outside: false, camera: false,
});
const cards: SightingCard[] = new URLSearchParams(location.search).get("many") === "1"
  ? [more(1, "confirmed"), ...three, more(2, "awaiting"), more(3, "rejected"), more(4, "awaiting"), more(5, "awaiting")]
  : three;

function Harness() {
  const [placing, setPlacing] = useState("");
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic reports, not drill data.</p>
      <SightingsPanel cards={cards} segmentOf={(c) => (c.needsPlace ? null : "AA")} onDecide={async () => (new URLSearchParams(location.search).has("note") ? "Rebuilt without downhill and level ground: the new start is outside the mapped segments." : undefined)} onPlace={(c) => setPlacing(c.sighting.eventId)} />
      <pre data-testid="placing">{placing}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
