// Dev-server-only measurement page (web/harness/note-measure.html): times the command post's on-device read of a
// sighting note (readSightingText with sightingTextGenerator, the same path as CommandPost's readNote) on five made-up
// drill notes in a row in a newly opened page, so the first read is cold, and compares each reading with the fields
// the note states. A bare Firebase app (no App Check, no sign-in) supplies AI Logic; the page lists every request it
// made to a Google or Firebase host.

import { initializeApp } from "firebase/app";
import { getAI, GoogleAIBackend } from "firebase/ai";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { sightingTextGenerator } from "../ai/client";
import { availabilityOf, onDeviceAvailable } from "../ai/gate";
import { NOTE_READ_TIMEOUT_MS, SIGHTING_TEXT_OPTS, readSightingText } from "../ai/sightingText";
import { readEnv } from "../firebaseConfig";
import "../theme/fonts.css";
import "../theme/base.css";

const GOOGLE_HOST = /(^|\.)(googleapis\.com|google\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|web\.app)$/;

/** Made-up drill notes and the fields each one states (no real person, no number). */
export const NOTES = [
  { text: "Training drill. Caller saw an older man in a blue coat and grey trousers walking north on the path, carrying a brown bag.", want: { direction: "n", topColor: "blue", bottomColor: "gray" } },
  { text: "Training drill. A woman in a red jacket and black pants, white sneakers, heading east toward the road.", want: { direction: "e", topColor: "red", bottomColor: "black" } },
  { text: "Training drill. Man in a green sweater and brown slacks going downstream along the creek, holding a cane.", want: { direction: "downstream", topColor: "green", bottomColor: "brown" } },
  { text: "Training drill. Someone in a yellow raincoat and blue jeans was seen walking south past the gate.", want: { direction: "s", topColor: "yellow", bottomColor: "blue" } },
  { text: "Training drill. An older woman in a purple cardigan and tan skirt, moving west across the field with a small dog.", want: { direction: "w", topColor: "purple", bottomColor: "tan" } },
] as const;

async function measure(): Promise<object> {
  const app = initializeApp(readEnv(import.meta.env).firebase, "note-measure");
  const generate = sightingTextGenerator(getAI(app, { backend: new GoogleAIBackend() }));
  const availability = await availabilityOf(SIGHTING_TEXT_OPTS);
  const reads: object[] = [];
  for (const n of NOTES) {
    let replyMs = 0;
    let inferenceSource: string | null = null;
    const result = await readSightingText(n.text, {
      available: (o) => onDeviceAvailable(o),
      generate: async (t) => {
        const t0 = performance.now();
        const r = await generate(t);
        replyMs = Math.round(performance.now() - t0);
        inferenceSource = r.inferenceSource ?? null;
        return r;
      },
      timeoutMs: 180_000,
    });
    const got = "reading" in result ? result.reading : null;
    const fields = Object.entries(n.want).map(([k, v]) => ({ field: k, want: v, got: got ? (got as Record<string, unknown>)[k] : null }));
    reads.push({ note: n.text, replyMs, inferenceSource, result, fieldsRight: fields.filter((f) => f.got === f.want).length, fields });
  }
  const googleRequests = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => new URL(u).host !== location.host && GOOGLE_HOST.test(new URL(u).host));
  return { availability, commandPostLimitMs: NOTE_READ_TIMEOUT_MS, reads, googleRequests };
}

function Page() {
  const [report, setReport] = useState("");
  useEffect(() => {
    measure().then((r) => setReport(JSON.stringify(r, null, 2)), (e: unknown) => setReport(JSON.stringify({ error: String(e) })));
  }, []);
  return (
    <main style={{ padding: 16, maxWidth: 720 }}>
      <p className="drill">Measurement page. Made-up drill notes; no real person.</p>
      {!report && <p role="status">Reading on this laptop...</p>}
      <pre data-testid="report" style={{ whiteSpace: "pre-wrap" }}>{report}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
