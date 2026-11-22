// Dev-server-only harness (web/harness/debrief.html): the debrief section with two cleared segments, AA (no
// debrief yet) and AB (debriefed by Team 2's own device). Saves are recorded on the page, and the row then shows what
// was saved, as the app's own row shows the stored debrief; ?save=fail refuses.
// ?paper=sample offers the paper sheet read with a canned on-device reply for AA, ?paper=other one for AB, and
// ?paper=refuse a laptop with no on-device model; the read's own cleaning runs on the reply. ?details=1 puts the
// section inside a closed-able Details, as the command post's rail does. No Firebase.

import { useRef, useState, type ReactNode } from "react";
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
const inDetails = params.get("details") === "1";
// ?prefill=AA or AB: a search report the sighting form sent to that segment's debrief at load; "Send a search report"
// sends another. ?late=1: AB's stored debrief arrives only when "Team debrief arrives" is pressed. ?save=slow: a save
// finishes only when "Save finishes" is pressed.
const prefillSegment = params.get("prefill");
// ?target=AA: the segment "Send a search report" sends to (default the ?prefill segment, else AB).
const target = params.get("target") ?? prefillSegment ?? "AB";
const REPORTS = ["Combed the bank, no sign.", "Swept the trail, no trace."];
const late = params.get("late") === "1";
const slowSave = params.get("save") === "slow";
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

// The section as the command post's rail holds it: under a Details that command can close.
const wrap = (section: ReactNode) => (inDetails ? <details open><summary>Details</summary>{section}</details> : section);

function Harness() {
  const [saved, setSaved] = useState<string>("");
  const [stored, setStored] = useState<Record<string, Debrief>>(late ? {} : initial);
  const [prefill, setPrefill] = useState(prefillSegment ? { segmentId: prefillSegment, note: "Swept the creek bank twice, no trace.", seq: 1 } : null);
  const finishSave = useRef<(() => void) | null>(null);
  const [jpeg, setJpeg] = useState("");
  const [reads, setReads] = useState(0);
  const paperRead: PaperRead | undefined = paper
    ? async (jpegBase64, segmentId) => {
        setJpeg(jpegBase64.slice(0, 12));
        setReads((n) => n + 1);
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
      {wrap(<DebriefSection
        cleared={cleared}
        debriefs={stored}
        teams={teams}
        onSave={async (segmentId: string, input: DebriefInput, existing: boolean, clearedEventId: string | null) => {
          if (fail) throw new Error("refused");
          if (slowSave) await new Promise<void>((r) => { finishSave.current = r; });
          setSaved(JSON.stringify({ segmentId, input, existing, clearedEventId }));
          setStored((s) => ({ ...s, [segmentId]: { ...input, segmentId, byUid: "harness", createdAtMs: 2, clearedEventId } }));
        }}
        paperRead={paperRead}
        prefill={prefill}
      />)}
      <button type="button" onClick={() => setPrefill((p) => { const seq = (p?.seq ?? 0) + 1; return { segmentId: target, note: REPORTS[(seq - 1) % 2]!, seq }; })}>
        Send a search report
      </button>
      <button type="button" onClick={() => setPrefill((p) => (p ? { ...p, seq: p.seq + 1 } : p))}>
        Send the same report again
      </button>
      <button type="button" onClick={() => setStored((s) => ({ ...s, AB: initial["AB"]! }))}>
        Team debrief arrives
      </button>
      <button type="button" onClick={() => finishSave.current?.()}>
        Save finishes
      </button>
      <pre data-testid="saved">{saved}</pre>
      <pre data-testid="read-jpeg">{jpeg}</pre>
      <pre data-testid="read-count">{reads}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
