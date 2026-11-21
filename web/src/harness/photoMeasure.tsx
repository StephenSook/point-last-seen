// Dev-server-only measurement page (web/harness/photo-measure.html): times the command post's on-device photo read
// (readPhotoOnDevice with photoGenerator, the same path as CommandPost's readPhotoHere) three times in a row in a fresh
// browser, so the first read is cold. The photo is a synthetic figure drawn here (no real person). A bare Firebase app
// (no App Check, no sign-in) supplies AI Logic; the page lists every request it made to a Google or Firebase host.

import { initializeApp } from "firebase/app";
import { getAI, GoogleAIBackend } from "firebase/ai";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { photoGenerator } from "../ai/client";
import { availabilityOf, onDeviceAvailable } from "../ai/gate";
import { PHOTO_OPTS, readPhotoOnDevice } from "../ai/photoCues";
import { readEnv } from "../firebaseConfig";
import "../theme/fonts.css";
import "../theme/base.css";

const GOOGLE_HOST = /(^|\.)(googleapis\.com|google\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|web\.app)$/;

/** A synthetic figure in a blue coat and grey trousers on grass, as JPEG base64. */
function figureJpeg(): string {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 480;
  const g = c.getContext("2d")!;
  g.fillStyle = "#5b7f3a";
  g.fillRect(0, 0, 640, 480);
  g.fillStyle = "#d9b38c";
  g.beginPath();
  g.arc(320, 110, 34, 0, 2 * Math.PI);
  g.fill();
  g.fillStyle = "#1f4fa8";
  g.fillRect(270, 150, 100, 150);
  g.fillStyle = "#6b6b6b";
  g.fillRect(278, 300, 36, 130);
  g.fillRect(326, 300, 36, 130);
  return c.toDataURL("image/jpeg", 0.9).split(",")[1]!;
}

type Read = { replyMs: number; inferenceSource: string | null; result: unknown };

async function measure(): Promise<object> {
  const app = initializeApp(readEnv(import.meta.env).firebase, "photo-measure");
  const generate = photoGenerator(getAI(app, { backend: new GoogleAIBackend() }));
  const availability = await availabilityOf(PHOTO_OPTS);
  const jpeg = figureJpeg();
  const reads: Read[] = [];
  for (let i = 0; i < 3; i++) {
    let replyMs = 0;
    let inferenceSource: string | null = null;
    const result = await readPhotoOnDevice(jpeg, {
      available: (o) => onDeviceAvailable(o),
      generate: async (b) => {
        const t0 = performance.now();
        const r = await generate(b);
        replyMs = Math.round(performance.now() - t0);
        inferenceSource = r.inferenceSource ?? null;
        return r;
      },
      timeoutMs: 180_000,
    });
    reads.push({ replyMs, inferenceSource, result });
  }
  const googleRequests = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((n) => new URL(n).host !== location.host && GOOGLE_HOST.test(new URL(n).host));
  return { availability, jpegBase64Chars: jpeg.length, reads, googleRequests };
}

function Page() {
  const [report, setReport] = useState<string>("");
  useEffect(() => {
    measure().then((r) => setReport(JSON.stringify(r, null, 2)), (e: unknown) => setReport(JSON.stringify({ error: String(e) })));
  }, []);
  return (
    <main style={{ padding: 16, maxWidth: 720 }}>
      <p className="drill">Measurement page. A synthetic figure; no real person.</p>
      {!report && <p role="status">Reading on this laptop...</p>}
      <pre data-testid="report" style={{ whiteSpace: "pre-wrap" }}>{report}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
