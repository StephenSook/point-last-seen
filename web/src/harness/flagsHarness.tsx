// Dev-server-only harness (web/harness/flags.html; never in the production build). It renders the Problem reports
// panel with synthetic flags. ?none=1: no flags. ?many=1: five flags, one with a long unbroken note. ?stale=1: a read
// of the flags was refused.
import { createRoot } from "react-dom/client";
import { FlagsPanel } from "../command/FlagsPanel";
import type { Flag } from "../data/contentReports";
import "../theme/fonts.css";
import "../theme/base.css";

const q = new URLSearchParams(location.search);
const at = (h: number, m: number) => Date.UTC(2026, 10, 22, h, m);
const TWO: Flag[] = [
  { reportId: "r2", authorUid: "fam00001", role: "family", target: "family_description", targetId: null, reason: "wrong_or_misleading", note: "Her coat is green, not blue.", createdAtMs: at(15, 40) },
  { reportId: "r1", authorUid: "srch0001", role: "searcher", target: "event", targetId: "a".repeat(32), reason: "personal_information", createdAtMs: at(15, 12) },
];
const MORE: Flag[] = [0, 1, 2].map((i) => ({
  reportId: `m${i}`, authorUid: "srch0001", role: "searcher", target: "task", targetId: "p1", reason: "other",
  ...(i === 0 ? { note: "x".repeat(400) } : {}), createdAtMs: at(14, 50 - i),
}));
const FLAGS: Flag[] = q.get("none") === "1" ? [] : q.get("many") === "1" ? [...TWO, ...MORE] : TWO;
const LABELS: Record<string, string> = { fam00001: "Family member", srch0001: "Team 1 searcher" };

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <div style={{ padding: 16, background: "var(--bg-1)", maxWidth: 340 }}>
      <p className="small">Synthetic flags, not drill data.</p>
      <FlagsPanel
        flags={FLAGS}
        stale={q.get("stale") === "1"}
        labelFor={(uid) => LABELS[uid] ?? "Someone"}
        targetFor={(f) => (f.target === "event" ? "a report from 15:00 in segment AE" : f.target === "task" ? "their task in plan v2" : "the family's description")}
        timeOf={(ms) => new Date(ms).toISOString().slice(11, 16)}
      />
    </div>,
  );
}
