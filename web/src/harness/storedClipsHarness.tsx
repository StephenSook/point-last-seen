// Dev-server-only harness (web/harness/stored-clips.html): the command post's list of clips this search has read,
// with the synthetic 6 s test clip. No Firebase: the list, the clip and the track come from fixed values here.
// ?track=stored: the clip has a stored track; ?track=none: it has none. ?off=1: the time machine flag is off.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { StoredClipsPanel } from "../camera/StoredClipsPanel";
import type { StoredClip } from "../data/storedClips";
import type { Track } from "../extras/timemachine/types";
import "../theme/fonts.css";
import "../theme/base.css";

const params = new URLSearchParams(location.search);
const SHA = "e".repeat(64);
const MARK = { byUid: "u", atMs: 0 };
const CLIP: StoredClip = {
  record: {
    sha256: SHA, storagePath: `clips/drill-test-1/${SHA}.mp4`, durationS: 6, clipStartMs: new Date(2026, 10, 22, 14, 5, 0).getTime(), clockConfirmed: true, cameraFacingDeg: 90,
    reading: {}, route: null, consent: { personInClip: MARK, footageOwner: MARK, cloudProcessing: MARK, publicUse: null },
    expiresAtMs: Date.UTC(2026, 11, 22), createdAtMs: 0, createdByUid: "u",
  },
  sighting: {
    personVisible: true, firstSeen: "00:01", lastSeen: "00:05", entryEdge: "right", exitEdge: "left",
    topColor: "blue", bottomColor: "black", topType: "rain jacket", footwear: "boots", headwear: "",
    carriedItems: [], keyFrame: { time: "00:04", box2d: [400, 300, 600, 700] },
    lighting: "day", legibility: "clear", evidence: "Synthetic reading for the harness.",
  },
};
const TRACK: Track = { version: "track-v1", window: { startS: 0, endS: 6 }, entries: [0, 1, 2, 3, 4, 5].map((t) => ({ t, box: [400, 100 + 100 * t, 600, 300 + 100 * t] as const, source: "cloud" as const })) };

function Harness() {
  const [revocation, setRevocation] = useState(0);
  const [loads, setLoads] = useState(0);
  return (
    <main style={{ width: 1100, padding: 16 }}>
      <p className="drill">Synthetic test clip, not drill data.</p>
      <StoredClipsPanel
        revocation={revocation}
        timeMachine={params.get("off") !== "1"}
        load={async () => (params.get("empty") === "1" ? [] : [CLIP])}
        openClip={async () => {
          setLoads((n) => n + 1);
          const bytes = await (await fetch("/e2e/assets/moving-box.mp4")).arrayBuffer();
          return { clip: new Blob([bytes], { type: "video/mp4" }), durationS: 6, track: params.get("track") === "stored" ? TRACK : null };
        }}
      />
      <button type="button" onClick={() => setRevocation((n) => n + 1)}>
        Media deleted
      </button>
      <pre data-testid="loads">{loads}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
