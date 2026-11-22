// Dev-server-only measurement page (web/harness/photo-invention.html): does the command post's on-device photo read
// invent sign text? It draws eight synthetic scenes (four with known sign text, four with none, one of those a blank
// sign board), reads each twice with readPhotoOnDevice and photoGenerator (the same path as CommandPost's
// readPhotoHere), and reports, per read, the model's own reply, the cues cleanCues kept, which sign-text words the
// picture never showed, and how much of the true sign text was read. No real person or place photo is used. A bare
// Firebase app (no App Check, no sign-in) supplies AI Logic; the page lists every request it made to a Google or
// Firebase host. Landmarks are judged by hand against each scene's drawn list, outside this page.

import { initializeApp } from "firebase/app";
import { getAI, GoogleAIBackend } from "firebase/ai";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { photoGenerator } from "../ai/client";
import { availabilityOf, onDeviceAvailable } from "../ai/gate";
import { PHOTO_OPTS, readPhotoOnDevice } from "../ai/photoCues";
import { readEnv } from "../firebaseConfig";
import { inventedWords, signRead } from "./photoTruth";
import "../theme/fonts.css";
import "../theme/base.css";

const GOOGLE_HOST = /(^|\.)(googleapis\.com|google\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|web\.app)$/;
const W = 640;
const H = 480;

type G = CanvasRenderingContext2D;
type Scene = { id: string; text: string[]; drawn: string[]; draw: (g: G) => void };

const rect = (g: G, fill: string, x: number, y: number, w: number, h: number) => {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
};
const sky = (g: G, horizon: number) => {
  rect(g, "#9cc7e8", 0, 0, W, horizon);
  rect(g, "#5b7f3a", 0, horizon, W, H - horizon);
};
const tree = (g: G, x: number, base: number, s: number) => {
  rect(g, "#5a3b22", x - 6 * s, base - 30 * s, 12 * s, 30 * s);
  g.fillStyle = "#2f5d2a";
  g.beginPath();
  g.moveTo(x, base - 130 * s);
  g.lineTo(x - 45 * s, base - 30 * s);
  g.lineTo(x + 45 * s, base - 30 * s);
  g.closePath();
  g.fill();
};
/** Bold sans-serif text centred at (cx, y), shrunk until it fits maxW. */
const words = (g: G, text: string, cx: number, y: number, maxW: number, px: number, fill: string) => {
  let size = px;
  do {
    g.font = `bold ${size}px Helvetica, Arial, sans-serif`;
    size -= 2;
  } while (g.measureText(text).width > maxW && size > 10);
  g.fillStyle = fill;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, cx, y);
};

const SCENES: Scene[] = [
  {
    id: "trail-sign",
    text: ["PINE RIDGE TRAIL", "2.4 MI"],
    drawn: ["blue sky", "green grass", "three trees", "brown wooden sign on two posts, cream text in two lines"],
    draw: (g) => {
      sky(g, 220);
      [70, 560, 610].forEach((x) => tree(g, x, 260, 1));
      rect(g, "#4a2f1a", 200, 300, 16, 150);
      rect(g, "#4a2f1a", 424, 300, 16, 150);
      rect(g, "#7a5230", 120, 170, 400, 150);
      words(g, "PINE RIDGE TRAIL", 320, 220, 370, 44, "#f3e6c8");
      words(g, "2.4 MI", 320, 280, 370, 40, "#f3e6c8");
    },
  },
  {
    id: "street-sign",
    text: ["MAPLE AVE"],
    drawn: ["blue sky", "grey pavement", "grey pole", "green street-name sign, white text"],
    draw: (g) => {
      rect(g, "#a9d0f0", 0, 0, W, 400);
      rect(g, "#9a9a9a", 0, 400, W, 80);
      rect(g, "#808080", 312, 120, 16, 300);
      rect(g, "#1d6b3a", 120, 80, 400, 100);
      g.strokeStyle = "#ffffff";
      g.lineWidth = 4;
      g.strokeRect(128, 88, 384, 84);
      words(g, "MAPLE AVE", 320, 131, 360, 60, "#ffffff");
    },
  },
  {
    id: "park-sign",
    text: ["CEDAR LAKE PARK"],
    drawn: ["blue sky", "green grass", "blue lake", "two trees", "dark green sign on a grey stone base, white text"],
    draw: (g) => {
      sky(g, 200);
      g.fillStyle = "#3b6fa8";
      g.beginPath();
      g.ellipse(320, 235, 280, 40, 0, 0, 2 * Math.PI);
      g.fill();
      tree(g, 60, 250, 0.8);
      tree(g, 590, 250, 0.8);
      rect(g, "#8f8f8f", 170, 390, 300, 70);
      rect(g, "#23452c", 110, 290, 420, 100);
      words(g, "CEDAR LAKE PARK", 320, 340, 390, 46, "#ffffff");
    },
  },
  {
    id: "trailhead-board",
    text: ["BEAR CREEK", "TRAILHEAD", "NO CAMPING"],
    drawn: ["blue sky", "green grass", "four trees", "wooden board on two posts, cream text in two lines", "red plaque below it, white text"],
    draw: (g) => {
      sky(g, 200);
      [50, 130, 520, 600].forEach((x) => tree(g, x, 250, 0.9));
      rect(g, "#4a2f1a", 196, 330, 16, 130);
      rect(g, "#4a2f1a", 428, 330, 16, 130);
      rect(g, "#7a5230", 150, 140, 340, 190);
      words(g, "BEAR CREEK", 320, 195, 310, 48, "#f3e6c8");
      words(g, "TRAILHEAD", 320, 265, 310, 48, "#f3e6c8");
      rect(g, "#b3261e", 220, 360, 200, 50);
      words(g, "NO CAMPING", 320, 386, 180, 28, "#ffffff");
    },
  },
  {
    id: "figure",
    text: [],
    drawn: ["green ground", "a figure: tan round head, blue coat, grey trousers"],
    draw: (g) => {
      rect(g, "#5b7f3a", 0, 0, W, H);
      g.fillStyle = "#d9b38c";
      g.beginPath();
      g.arc(320, 110, 34, 0, 2 * Math.PI);
      g.fill();
      rect(g, "#1f4fa8", 270, 150, 100, 150);
      rect(g, "#6b6b6b", 278, 300, 36, 130);
      rect(g, "#6b6b6b", 326, 300, 36, 130);
    },
  },
  {
    id: "tree-line",
    text: [],
    drawn: ["blue sky", "green grass", "a row of six trees"],
    draw: (g) => {
      sky(g, 260);
      [60, 165, 270, 375, 480, 585].forEach((x) => tree(g, x, 300, 1.1));
    },
  },
  {
    id: "road",
    text: [],
    drawn: ["blue sky", "green grass", "grey road to the horizon", "yellow dashed centre line"],
    draw: (g) => {
      sky(g, 200);
      g.fillStyle = "#6f6f6f";
      g.beginPath();
      g.moveTo(300, 200);
      g.lineTo(340, 200);
      g.lineTo(560, H);
      g.lineTo(80, H);
      g.closePath();
      g.fill();
      g.fillStyle = "#e8c22a";
      for (let y = 210; y < H; y += 50) {
        const half = 2 + ((y - 200) / (H - 200)) * 6;
        g.fillRect(320 - half, y, 2 * half, 22);
      }
    },
  },
  {
    id: "blank-sign",
    text: [],
    drawn: ["blue sky", "green grass", "blue lake", "brown wooden bench", "brown wooden sign board on a post, no text"],
    draw: (g) => {
      sky(g, 190);
      g.fillStyle = "#3b6fa8";
      g.beginPath();
      g.ellipse(320, 230, 300, 45, 0, 0, 2 * Math.PI);
      g.fill();
      rect(g, "#4a2f1a", 455, 300, 14, 160);
      rect(g, "#7a5230", 380, 220, 165, 95);
      rect(g, "#6a4527", 80, 360, 230, 18);
      rect(g, "#6a4527", 80, 320, 230, 14);
      rect(g, "#4a2f1a", 95, 378, 12, 60);
      rect(g, "#4a2f1a", 283, 378, 12, 60);
    },
  },
];

function jpegOf(s: Scene): string {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  s.draw(c.getContext("2d")!);
  return c.toDataURL("image/jpeg", 0.9).split(",")[1]!;
}

async function sha256(b64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function measure(jpegs: string[], onProgress: (n: number) => void): Promise<object> {
  const app = initializeApp(readEnv(import.meta.env).firebase, "photo-invention");
  const generate = photoGenerator(getAI(app, { backend: new GoogleAIBackend() }));
  const availability = await availabilityOf(PHOTO_OPTS);
  const reads: object[] = [];
  for (let pass = 1; pass <= 2; pass++) {
    for (let i = 0; i < SCENES.length; i++) {
      const s = SCENES[i]!;
      let replyMs = 0;
      let inferenceSource: string | null = null;
      let raw: unknown = null;
      const result = await readPhotoOnDevice(jpegs[i]!, {
        available: (o) => onDeviceAvailable(o),
        generate: async (b) => {
          const t0 = performance.now();
          const r = await generate(b);
          replyMs = Math.round(performance.now() - t0);
          inferenceSource = r.inferenceSource ?? null;
          try {
            raw = JSON.parse(r.text);
          } catch {
            raw = r.text;
          }
          return r;
        },
        timeoutMs: 180_000,
      });
      const cues = "cues" in result ? result.cues : null;
      reads.push({
        scene: s.id,
        pass,
        replyMs,
        inferenceSource,
        refused: "refused" in result ? result.refused : null,
        raw,
        kept: cues,
        signTextInvented: cues ? inventedWords(cues.signText, s.text) : null,
        signTextRead: cues ? signRead(cues.signText, s.text) : null,
      });
      onProgress(reads.length);
    }
  }
  const googleRequests = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((n) => new URL(n).host !== location.host && GOOGLE_HOST.test(new URL(n).host));
  return { availability, reads, googleRequests };
}

function Page() {
  const [jpegs] = useState(() => SCENES.map(jpegOf));
  const [done, setDone] = useState(0);
  const [report, setReport] = useState<string>("");
  useEffect(() => {
    (async () => {
      const scenes = await Promise.all(
        SCENES.map(async (s, i) => ({ id: s.id, text: s.text, drawn: s.drawn, jpegBase64Chars: jpegs[i]!.length, jpegSha256: await sha256(jpegs[i]!) })),
      );
      const r = await measure(jpegs, setDone);
      setReport(JSON.stringify({ scenes, ...r }, null, 2));
    })().catch((e: unknown) => setReport(JSON.stringify({ error: String(e) })));
  }, [jpegs]);
  return (
    <main style={{ padding: 16, maxWidth: 1400 }}>
      <p className="drill">Measurement page. Synthetic drawings; no real person or place.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {jpegs.map((j, i) => (
          <figure key={SCENES[i]!.id} style={{ margin: 0 }}>
            <img alt={SCENES[i]!.id} src={`data:image/jpeg;base64,${j}`} style={{ width: "100%" }} />
            <figcaption className="small">{SCENES[i]!.id}</figcaption>
          </figure>
        ))}
      </div>
      {!report && <p role="status">Reading on this device... {done} of {SCENES.length * 2}</p>}
      <pre data-testid="report" style={{ whiteSpace: "pre-wrap" }}>{report}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
