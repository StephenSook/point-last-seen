// Dev-server-only harness (web/harness/plan.html): the plan card with a synthetic draft and
// template wording. Team document ids T1 and T2 are named "Team 1" and "Team 2".

import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PlanDraft } from "../ai/replanWording";
import { WhatChanged } from "../command/WhatChanged";
import "../theme/fonts.css";
import "../theme/base.css";

// ?teams=N: a draft with N teams (default 2), to show the limit on how many a plan can name.
const teamCount = Number(new URLSearchParams(location.search).get("teams") ?? "2");
const DRAFT: PlanDraft = {
  eventSetHash: "a".repeat(64),
  priorVersion: 1,
  rank: [],
  assignments: teamCount === 2 ? [{ teamId: "T1", segmentIds: ["AA"] }, { teamId: "T2", segmentIds: ["AB"] }] : Array.from({ length: teamCount }, (_, i) => ({ teamId: `T${i + 1}`, segmentIds: [`S${i + 1}`] })),
};

// "Assignments change" swaps T1 to BB under the same event-set hash, as when the plan history
// arrives after a suggestion was made. "Probabilities change" keeps the hash, the prior version and
// the assignments and changes only the ranked POA, as when another seat's rebuild reaches the
// segments before the incident.
// ?slow=1: the model answers only when "Model answers" is pressed, so the draft can change first.
const slow = new URLSearchParams(location.search).get("slow") === "1";
// ?route=cloud|on_device: the route the wording reports (default: the fixed template).
const routePath = (new URLSearchParams(location.search).get("route") ?? "rules") as "cloud" | "on_device" | "rules";

function Harness() {
  const [draft, setDraft] = useState<PlanDraft>(DRAFT);
  const answer = useRef<(() => void) | null>(null);
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic plan, not drill data.</p>
      <WhatChanged
        draft={draft}
        draftSource="local"
        teams={[{ teamId: "T1", name: "Team 1" }, { teamId: "T2", name: "Team 2" }]}
        onSuggest={async () => {
          if (slow) await new Promise<void>((resolve) => (answer.current = resolve));
          return {
          wording: { assignments: [{ teamId: "T1", taskText: "Search AA.", reason: "Highest." }, { teamId: "T2", taskText: "Search AB.", reason: "Next." }], summary: "s" },
          route: routePath === "rules"
            ? { platform: "web", path: "rules", stage: "sdk", model: "template", reason: "template_fallback", latencyMs: 0, sdkReported: false, blocked: null, decidedAtMs: 0 }
            : { platform: "web", path: routePath, stage: "sdk", model: routePath === "cloud" ? "gemini-3.5-flash-lite" : "chrome-built-in", reason: routePath === "cloud" ? "on_device_unavailable" : "sdk_prefer_on_device", latencyMs: 900, sdkReported: true, blocked: null, decidedAtMs: 0 },
          notice: null,
          };
        }}
        onApprove={() => ({ version: 1, ack: new Promise<void>(() => {}) })}
        planStatus={() => "sending"}
      />
      <button type="button" onClick={() => answer.current?.()}>
        Model answers
      </button>
      <button type="button" onClick={() => setDraft((d) => ({ ...d, rank: [{ segmentId: "AA", rank: 1, poa: 0.31, priorPoa: 0.2, deltaPoa: 0.11 }] }))}>
        Probabilities change
      </button>
      <button type="button" onClick={() => setDraft({ ...DRAFT, assignments: [{ teamId: "T1", segmentIds: ["BB"] }, { teamId: "T2", segmentIds: ["AB"] }] })}>
        Assignments change
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
