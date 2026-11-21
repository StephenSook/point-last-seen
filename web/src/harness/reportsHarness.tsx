// Dev-server-only harness (web/harness/reports.html): the command post's Reports list with made-up reports. Retract
// adds a command retraction to the page's own events, as the listener would (?fail=1: the write is refused). No Firebase.

import type { EventDoc } from "@pls/engine";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ReportsPanel } from "../command/ReportsPanel";
import { reportCards } from "../command/reportCards";
import "../theme/fonts.css";
import "../theme/base.css";

const fail = new URLSearchParams(location.search).get("fail") === "1";
const at = (h: number, m: number) => new Date(2026, 10, 22, h, m).getTime();
let n = 0;
function ev(over: Partial<EventDoc>): EventDoc {
  n++;
  return {
    eventId: n.toString(16).padStart(32, "0"), schemaVersion: 1, incidentId: "I1", teamId: "T1", deviceId: "s1", seq: n, authorUid: "s1", role: "searcher",
    type: "clue", reporter: "searcher", clientTimeMs: at(14, n), serverTime: null, observedAtMs: null, position: null, positionSource: "none",
    rawText: null, inputMethod: "typed", isTrainingInject: true, reading: null, effect: { kind: "none", why: "informational" },
    route: null, targetEventId: null, decision: null, planVersion: null, priorVersion: 1, ...over,
  };
}
const START = ev({ type: "sighting", teamId: null, role: "command", authorUid: "cmd", reporter: "public_caller", rawText: "Man in a blue coat at the gate.", clientTimeMs: at(13, 50) });
const BY_AUTHOR = ev({ type: "clue", teamId: "T2", authorUid: "s2", rawText: "Hat on the path.", effect: { kind: "clue", influences: { AB: "strong_for" }, authenticity: "medium" }, clientTimeMs: at(14, 2) });
const EVENTS: EventDoc[] = [
  START,
  ev({ type: "cleared", rawText: "AA searched, nothing found.", effect: { kind: "cleared", segmentId: "AA", coveragePercent: 100, pod: 0.8, durationMin: 40, detectionRangeM: 20 } as unknown as EventDoc["effect"], clientTimeMs: at(14, 10) }),
  ev({ type: "clue", rawText: "Glove by the creek.", effect: { kind: "clue", influences: { AC: "strong_for", AD: "for" }, authenticity: "medium" }, clientTimeMs: at(14, 20) }),
  BY_AUTHOR,
  ev({ type: "retraction", teamId: "T2", authorUid: "s2", targetEventId: BY_AUTHOR.eventId, clientTimeMs: at(14, 5) }),
  ev({ type: "found", teamId: "T2", authorUid: "s2", rawText: "Phone found at the bench.", clientTimeMs: at(14, 30) }),
];

function Harness() {
  const [events, setEvents] = useState<EventDoc[]>(EVENTS);
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic reports, not drill data.</p>
      <ReportsPanel
        cards={reportCards(events, [START.eventId])}
        teams={[{ teamId: "T1", name: "Team 1" }, { teamId: "T2", name: "Team 2" }]}
        onRetract={async (c) => {
          await new Promise((r) => setTimeout(r, 150));
          if (fail) throw new Error("refused");
          setEvents((es) => [...es, ev({ type: "retraction", role: "command", authorUid: "cmd", teamId: null, targetEventId: c.report.eventId })]);
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
