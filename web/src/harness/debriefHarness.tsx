// Dev-server-only harness (web/harness/debrief.html): the debrief section with two cleared segments, AA (no
// debrief yet) and AB (debriefed by Team 2's own device). Saves are recorded on the page, and the row then shows what
// was saved, as the app's own row shows the stored debrief; ?save=fail refuses.
// ?paper=sample offers the paper sheet read with a canned on-device reply for AA, ?paper=other one for AB, and
// ?paper=refuse a laptop with no on-device model; the read's own cleaning runs on the reply. No Firebase.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { RouteRecord } from "@pls/engine";
import { readDebriefSheetOnDevice } from "../ai/debriefSheetRead";
import type { PaperRead } from "../command/DebriefPaperRead";
import { DebriefSection } from "../command/DebriefSection";
import type { Debrief, DebriefInput } from "../data/debriefs";
import "../theme/fonts.css";
import "../theme/base.css";

const params = new URLSearchParams(location.search);
const fail = params.get("save") === "fail";
const paper = params.get("paper");
const cleared = [
  { segmentId: "AA", eventId: "a".repeat(32), deviceId: "d1", teamId: "T1" },
  { segmentId: "AB", eventId: "b".repeat(32), deviceId: "d2", teamId: "T2" },
];
const teams = [{ teamId: "T1", name: "Team 1" }, { teamId: "T2", name: "Team 2" }];
const initial: Record<string, Debrief> = {
  AB: {
    segmentId: "AB", tookMinutes: 30, worked: "Line search along the creek", didNotWork: "Radio dead zone",
    coverageStatedPct: 50, clues: "Wrapper by the footbridge", hazards: "Fast water at the ford",
    byUid: "d2", createdAtMs: 1, clearedEventId: "b".repeat(32),
  },
};

// Made-up values, like the SAMPLE sheet's, naming no one; "other" is a sheet for AB.
const reply = {
  team: "team 1", segment: paper === "other" ? "ab" : "aa", minutes: "45", coverage: "75",
  worked: "LINE SEARCH 10 M APART ALONG THE CREEK", didNotWork: "THICK BRUSH ON THE NORTH SLOPE",
  clues: "BLUE SCARF ON TRAIL MARKER 4", hazards: "LOOSE ROCK BY THE OVERLOOK",
};
const route: RouteRecord = {
  platform: "web", path: "on_device", stage: "sdk", model: "chrome-built-in", reason: "sdk_only_on_device",
  latencyMs: 900, sdkReported: true, blocked: null, decidedAtMs: 1,
};

function Harness() {
  const [saved, setSaved] = useState<string>("");
  const [stored, setStored] = useState(initial);
  const [jpeg, setJpeg] = useState("");
  const paperRead: PaperRead | undefined = paper
    ? async (jpegBase64, segmentId) => {
        setJpeg(jpegBase64.slice(0, 12));
        const r = await readDebriefSheetOnDevice(jpegBase64, { segmentId, segmentIds: ["AA", "AB"], teams }, {
          available: async () => paper !== "refuse",
          generate: async () => ({ text: JSON.stringify(reply), inferenceSource: "on_device" }),
          timeoutMs: 5_000,
        });
        return "read" in r ? { read: r.read, route } : r;
      }
    : undefined;
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
          setStored((s) => ({ ...s, [segmentId]: { ...input, segmentId, byUid: "harness", createdAtMs: 2, clearedEventId } }));
        }}
        paperRead={paperRead}
      />
      <pre data-testid="saved">{saved}</pre>
      <pre data-testid="read-jpeg">{jpeg}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
