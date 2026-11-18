// Dev-server-only measurement page (web/harness/triage.html): runs the real on-device triage on a
// clip served by the dev server (?clip=/path.mp4) in this browser, and reports the gate's answer,
// the frames sampled, each frame check's time and answer, the result, and every request this page
// made to a Google or Firebase host. A bare Firebase app (no App Check, no sign-in) supplies
// AI Logic, so an on-device-only run should make no such request.

import { initializeApp } from "firebase/app";
import { getAI, GoogleAIBackend } from "firebase/ai";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { frameCheckGenerator } from "../ai/client";
import { FRAME_OPTS } from "../ai/frameCheck";
import { availabilityOf } from "../ai/gate";
import { jpegAt, sampleFrames } from "../camera/frames";
import { triageClip, type TriageResult } from "../camera/triage";
import { readEnv } from "../firebaseConfig";
import "../theme/fonts.css";
import "../theme/base.css";

type Check = { atS: number; ms: number; text: string };
type Report = { availability: string; samples: number; sampleMs: number; checks: Check[]; result: TriageResult; totalMs: number; googleRequests: string[] };

// Hosts outside this page's own origin that belong to Google or Firebase.
const GOOGLE_HOST = /(^|\.)(googleapis\.com|google\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|web\.app)$/;

async function measure(clipUrl: string): Promise<Report> {
  const app = initializeApp(readEnv(import.meta.env).firebase, "triage-measure");
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const check = frameCheckGenerator(ai);
  const clip = await (await fetch(clipUrl)).blob();
  const availability = await availabilityOf(FRAME_OPTS);
  const checks: Check[] = [];
  let samples = 0;
  let atS = -1;
  let sampleMs = 0;
  const t0 = performance.now();
  const result = await triageClip({
    available: async () => availability === "available",
    sample: async () => {
      const s0 = performance.now();
      const r = await sampleFrames(clip);
      sampleMs = performance.now() - s0;
      samples = r.frames.length;
      return r;
    },
    frameJpeg: (t) => {
      atS = t;
      return jpegAt(clip, t);
    },
    checkFrame: async (jpeg) => {
      const c0 = performance.now();
      const r = await check(jpeg);
      checks.push({ atS, ms: Math.round(performance.now() - c0), text: r.text });
      return r;
    },
    now: () => performance.now(),
  });
  const googleRequests = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((n) => {
      const host = new URL(n).host;
      return host !== location.host && GOOGLE_HOST.test(host);
    });
  return { availability, samples, sampleMs: Math.round(sampleMs), checks, result, totalMs: Math.round(performance.now() - t0), googleRequests };
}

function Page() {
  const clip = new URLSearchParams(location.search).get("clip") ?? "/e2e/assets/moving-box.mp4";
  const [report, setReport] = useState<Report | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main style={{ padding: 16, maxWidth: 720 }}>
      <p className="drill">Measurement page. Synthetic or staged clips only.</p>
      <p>Clip: {clip}</p>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setReport(await measure(clip));
          } catch (e) {
            setReport({ error: e instanceof Error ? e.message : String(e) });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Measuring" : "Run triage"}
      </button>
      <pre data-testid="report" style={{ whiteSpace: "pre-wrap" }}>{report ? JSON.stringify(report, null, 2) : ""}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
