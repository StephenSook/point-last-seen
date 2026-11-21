// Dev-server-only measurement page (web/harness/sheet.html): reads one photo of a paper debrief sheet with the real
// on-device read in this browser, and reports the gate's answer, the model's reply and its time, the cleaned read, and
// every request this page made to a Google or Firebase host. A bare Firebase app (no App Check, no sign-in) supplies
// AI Logic, so an on-device-only read should make no such request. The read is checked against segment ?segment=
// (AA by default) of a made-up search with segments AA and AB and teams Alfa and Team 2, like the SAMPLE sheet.

import { initializeApp } from "firebase/app";
import { getAI, GoogleAIBackend } from "firebase/ai";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { debriefSheetGenerator } from "../ai/client";
import { DEBRIEF_SHEET_OPTS, readDebriefSheetOnDevice } from "../ai/debriefSheetRead";
import { availabilityOf, onDeviceAvailable, onDeviceCreateOptions } from "../ai/gate";
import { bytesToBase64 } from "../data/photos";
import { toStandardJpeg } from "../photos/jpeg";
import { readEnv } from "../firebaseConfig";
import "../theme/fonts.css";
import "../theme/base.css";

type Report = {
  file: string;
  jpegBytes: number;
  availability: string;
  textOnlyAvailability: string;
  replyMs: number | null;
  replyText: string | null;
  inferenceSource: string | null;
  result: unknown;
  totalMs: number;
  googleRequests: string[];
};

// Hosts outside this page's own origin that belong to Google or Firebase.
const GOOGLE_HOST = /(^|\.)(googleapis\.com|google\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|web\.app)$/;

async function measure(photo: File, segmentId: string): Promise<Report> {
  const app = initializeApp(readEnv(import.meta.env).firebase, "sheet-measure");
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const generate = debriefSheetGenerator(ai);
  const availability = await availabilityOf(DEBRIEF_SHEET_OPTS);
  // The same model asked for text input only: tells "no model" apart from "no image input yet". It downloads nothing.
  const textOnlyAvailability = await availabilityOf(onDeviceCreateOptions("text"));
  const bytes = await toStandardJpeg(photo);
  let replyMs: number | null = null;
  let replyText: string | null = null;
  let inferenceSource: string | null = null;
  const t0 = performance.now();
  const result = await readDebriefSheetOnDevice(
    bytesToBase64(bytes),
    { segmentId, segmentIds: ["AA", "AB"], teams: [{ teamId: "alfa", name: "Alfa" }, { teamId: "T2", name: "Team 2" }] },
    {
      available: (o) => onDeviceAvailable(o),
      generate: async (jpeg) => {
        const g0 = performance.now();
        const r = await generate(jpeg);
        replyMs = Math.round(performance.now() - g0);
        replyText = r.text;
        inferenceSource = r.inferenceSource ?? null;
        return r;
      },
      timeoutMs: 120_000,
    },
  );
  const googleRequests = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((n) => {
      const host = new URL(n).host;
      return host !== location.host && GOOGLE_HOST.test(host);
    });
  return { file: photo.name, jpegBytes: bytes.length, availability, textOnlyAvailability, replyMs, replyText, inferenceSource, result, totalMs: Math.round(performance.now() - t0), googleRequests };
}

function Page() {
  const segmentId = new URLSearchParams(location.search).get("segment") ?? "AA";
  const [report, setReport] = useState<Report | { error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main style={{ padding: 16, maxWidth: 720 }}>
      <p className="drill">Measurement page. SAMPLE or practice sheets only; nobody's name or number.</p>
      <p>Checked against segment {segmentId}.</p>
      <label>
        Photo of the sheet
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={async (e) => {
            const photo = e.target.files?.[0];
            e.target.value = "";
            if (!photo) return;
            setBusy(true);
            try {
              setReport(await measure(photo, segmentId));
            } catch (err) {
              setReport({ error: err instanceof Error ? err.message : String(err) });
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {busy && <p role="status">Reading on this laptop...</p>}
      <pre data-testid="report" style={{ whiteSpace: "pre-wrap" }}>{report ? JSON.stringify(report, null, 2) : ""}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
