// Dev-server-only harness (web/harness/members.html; never in the production build). It renders the People panel
// with synthetic members and a stand-in removal: ?fail=<reason> makes the call fail with that server reason. Below
// it, the join codes with a stand-in replacement (a fixed test code): ?rotatefail=<reason> refuses it, and
// ?mode=judge shows a practice search, which has no join codes.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { JoinCodes } from "../command/JoinCodes";
import { MembersPanel } from "../command/MembersPanel";
import { memberRows } from "../data/members";
import "../theme/fonts.css";
import "../theme/base.css";

const q = new URLSearchParams(location.search);
const TEAMS = [{ teamId: "T1", name: "Team 1" }, { teamId: "T2", name: "Team 2" }];

function Harness() {
  const [removed, setRemoved] = useState<Set<string>>(new Set(q.get("removed") ? ["fam00001"] : []));
  const rows = q.get("empty") === "1" ? [] : memberRows({ srch0001: { role: "searcher", team: "T1" }, fam00001: { role: "family", team: null } },
    [{ authorUid: "srch0002", role: "searcher", teamId: "T2" }, { authorUid: "cmd00001", role: "command", teamId: null }], removed, TEAMS);
  return (
    <div style={{ padding: 16, background: "var(--bg-1)", maxWidth: 340 }}>
      <p className="small">Synthetic members, not drill data.</p>
      <MembersPanel
        rows={rows}
        stale={q.get("stale") === "1"}
        onRemove={async (uid) => {
          const reason = q.get("fail");
          if (reason) throw Object.assign(new Error("refused"), { code: "functions/permission-denied", details: { reason } });
          // ?noecho=1: the call succeeds but no removal record arrives (as before the listener catches up).
          if (q.get("noecho") !== "1") setRemoved((s) => new Set([...s, uid]));
        }}
      />
      {q.get("mode") !== "judge" && (
        <JoinCodes
          onRotate={async (role) => {
            const reason = q.get("rotatefail");
            if (reason) throw Object.assign(new Error("refused"), { code: "functions/failed-precondition", details: { reason } });
            return { code: role === "family" ? "0123ABCD" : "7K3M9QX2", role, replaced: 1 };
          }}
        />
      )}
    </div>
  );
}

// ?slowcopy=1: a Copy finishes only when "Clipboard finishes" is pressed, so a Copy can land after the panel moved on.
const finishCopy: (() => void)[] = [];
if (new URLSearchParams(location.search).get("slowcopy") === "1") {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => new Promise<void>((r) => finishCopy.push(r)) } });
  const b = document.createElement("button");
  b.textContent = "Clipboard finishes";
  b.onclick = () => finishCopy.shift()?.();
  document.body.append(b);
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Harness />);
