// Dev-server-only harness (web/harness/members.html; never in the production build). It renders the People panel
// with synthetic members and a stand-in removal: ?fail=<reason> makes the call fail with that server reason.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MembersPanel } from "../command/MembersPanel";
import { memberRows } from "../data/members";
import "../theme/fonts.css";
import "../theme/base.css";

const q = new URLSearchParams(location.search);
const TEAMS = [{ teamId: "T1", name: "Team 1" }, { teamId: "T2", name: "Team 2" }];

function Harness() {
  const [removed, setRemoved] = useState<Set<string>>(new Set(q.get("removed") ? ["fam00001"] : []));
  const rows = memberRows({ srch0001: { role: "searcher", team: "T1" }, fam00001: { role: "family", team: null } },
    [{ authorUid: "srch0002", role: "searcher", teamId: "T2" }, { authorUid: "cmd00001", role: "command", teamId: null }], removed, TEAMS);
  return (
    <div style={{ padding: 16, background: "var(--bg-1)", maxWidth: 340 }}>
      <p className="small">Synthetic members, not drill data.</p>
      <MembersPanel
        rows={rows}
        onRemove={async (uid) => {
          const reason = q.get("fail");
          if (reason) throw Object.assign(new Error("refused"), { code: "functions/permission-denied", details: { reason } });
          // ?noecho=1: the call succeeds but no removal record arrives (as before the listener catches up).
          if (q.get("noecho") !== "1") setRemoved((s) => new Set([...s, uid]));
        }}
      />
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Harness />);
