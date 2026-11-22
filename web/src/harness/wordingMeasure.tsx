// Dev-server-only measurement page (web/harness/wording-measure.html): times the command post's plan wording (wordPlan
// with the wording's own on-device options, built ONLY_ON_DEVICE so this dev page never builds a cloud model; with the
// built-in model available the command post's PREFER_ON_DEVICE runs the same options) three times on one made-up plan
// in a newly opened page, and records where each wording ran as the SDK reported it, whether code accepted it, why
// not, and its text. A bare Firebase app (no App Check, no sign-in); the page lists every Google or Firebase request.

import { initializeApp } from "firebase/app";
import { getAI, GoogleAIBackend } from "firebase/ai";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { wordingOnDeviceGenerator } from "../ai/client";
import { availabilityOf, onDeviceCreateOptions } from "../ai/gate";
import { checkChoice, REPLY_TIMEOUT_MS, wordPlan, type PlanDraft } from "../ai/replanWording";
import { readEnv } from "../firebaseConfig";
import "../theme/fonts.css";
import "../theme/base.css";

const GOOGLE_HOST = /(^|\.)(googleapis\.com|google\.com|gstatic\.com|firebaseio\.com|firebaseapp\.com|web\.app)$/;
const MODEL = "gemini-3.5-flash-lite";

/** A made-up plan: two teams, the top segments of a made-up ranking. */
const DRAFT: PlanDraft = {
  eventSetHash: "measure",
  priorVersion: 1,
  rank: [
    { segmentId: "CC", rank: 1, poa: 0.0141, priorPoa: 0.0062, deltaPoa: 0.0079 },
    { segmentId: "CD", rank: 2, poa: 0.0139, priorPoa: 0.0061, deltaPoa: 0.0078 },
    { segmentId: "CE", rank: 3, poa: 0.0137, priorPoa: 0.0058, deltaPoa: 0.0079 },
    { segmentId: "BO", rank: 4, poa: 0.0092, priorPoa: 0.0183, deltaPoa: -0.0091 },
  ],
  assignments: [
    { teamId: "T1", segmentIds: ["CC"] },
    { teamId: "T2", segmentIds: ["CD"] },
  ],
};

async function measure(): Promise<object> {
  const app = initializeApp(readEnv(import.meta.env).firebase, "wording-measure");
  const asked = wordingOnDeviceGenerator(getAI(app, { backend: new GoogleAIBackend() }), DRAFT.assignments.map((a) => a.teamId));
  // The raw reply, so a rejected wording says why (the command post keeps only the kind of failure).
  let raw = "";
  let replyMs = 0;
  const generate: typeof asked = async (t) => {
    const t0 = performance.now();
    const r = await asked(t);
    replyMs = Math.round(performance.now() - t0);
    raw = r.text;
    return r;
  };
  const availability = await availabilityOf(onDeviceCreateOptions("text"));
  const runs: object[] = [];
  for (let i = 0; i < 3; i++) {
    const w = await wordPlan(DRAFT, { generate, now: () => Date.now(), timeoutMs: 180_000, model: MODEL });
    let check: unknown = null;
    try {
      check = checkChoice(DRAFT, JSON.parse(raw));
    } catch {
      check = { ok: false, reason: "not JSON" };
    }
    runs.push({ replyMs, raw, check, route: w.route, accepted: w.attempt === undefined && w.route.path !== "rules", notice: w.notice, attempt: w.attempt ?? null, wording: w.wording, promptBytes: w.promptBytes });
  }
  const googleRequests = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => new URL(u).host !== location.host && GOOGLE_HOST.test(new URL(u).host));
  return { availability, commandPostLimitMs: REPLY_TIMEOUT_MS, runs, googleRequests };
}

function Page() {
  const [report, setReport] = useState("");
  useEffect(() => {
    measure().then((r) => setReport(JSON.stringify(r, null, 2)), (e: unknown) => setReport(JSON.stringify({ error: String(e) })));
  }, []);
  return (
    <main style={{ padding: 16, maxWidth: 720 }}>
      <p className="drill">Measurement page. A made-up plan; no real search.</p>
      {!report && <p role="status">Wording on this laptop...</p>}
      <pre data-testid="report" style={{ whiteSpace: "pre-wrap" }}>{report}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
