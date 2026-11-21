// Dev-server-only harness (web/harness/debrief.html): the debrief section with two cleared segments, AA (no
// debrief yet) and AB (debriefed by Team 2's own device). Saves are recorded on the page; ?save=fail refuses.
// No Firebase.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DebriefSection } from "../command/DebriefSection";
import type { Debrief, DebriefInput } from "../data/debriefs";
import "../theme/fonts.css";
import "../theme/base.css";

const fail = new URLSearchParams(location.search).get("save") === "fail";
const cleared = [
  { segmentId: "AA", eventId: "a".repeat(32), deviceId: "d1", teamId: "T1" },
  { segmentId: "AB", eventId: "b".repeat(32), deviceId: "d2", teamId: "T2" },
];
const teams = [{ teamId: "T1", name: "Team 1" }, { teamId: "T2", name: "Team 2" }];
const stored: Record<string, Debrief> = {
  AB: {
    segmentId: "AB", tookMinutes: 30, worked: "Line search along the creek", didNotWork: "Radio dead zone",
    coverageStatedPct: 50, clues: "Wrapper by the footbridge", hazards: "Fast water at the ford",
    byUid: "d2", createdAtMs: 1, clearedEventId: "b".repeat(32),
  },
};

function Harness() {
  const [saved, setSaved] = useState<string>("");
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic segments, not drill data.</p>
      <DebriefSection
        cleared={cleared}
        debriefs={stored}
        teams={teams}
        onSave={async (segmentId: string, input: DebriefInput, existing: boolean, clearedEventId: string | null) => {
          if (fail) throw new Error("refused");
          setSaved(JSON.stringify({ segmentId, input, existing, clearedEventId }));
        }}
      />
      <pre data-testid="saved">{saved}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
