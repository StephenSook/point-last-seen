// Dev-server-only harness (web/harness/plan.html): the plan card with a synthetic draft and
// template wording. Team document ids T1 and T2 are named "Team 1" and "Team 2".

import { createRoot } from "react-dom/client";
import type { PlanDraft } from "../ai/replanWording";
import { WhatChanged } from "../command/WhatChanged";
import "../theme/fonts.css";
import "../theme/base.css";

const DRAFT: PlanDraft = { eventSetHash: "a".repeat(64), priorVersion: 1, rank: [], assignments: [{ teamId: "T1", segmentIds: ["AA"] }, { teamId: "T2", segmentIds: ["AB"] }] };

createRoot(document.getElementById("root")!).render(
  <main className="rail right" style={{ width: 340 }}>
    <p className="drill">Synthetic plan, not drill data.</p>
    <WhatChanged
      draft={DRAFT}
      draftSource="local"
      teams={[{ teamId: "T1", name: "Team 1" }, { teamId: "T2", name: "Team 2" }]}
      onSuggest={async () => ({
        wording: { assignments: [{ teamId: "T1", taskText: "Search AA.", reason: "Highest." }, { teamId: "T2", taskText: "Search AB.", reason: "Next." }], summary: "s" },
        route: { platform: "web", path: "rules", stage: "sdk", model: "template", reason: "template_fallback", latencyMs: 0, sdkReported: false, blocked: null, decidedAtMs: 0 },
        notice: null,
      })}
      onApprove={() => ({ version: 1, ack: new Promise<void>(() => {}) })}
      planStatus={() => "sending"}
    />
  </main>,
);
