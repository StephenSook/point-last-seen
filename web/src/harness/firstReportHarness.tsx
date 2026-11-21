// Dev-server-only harness (web/harness/first-report.html): the practice search's one-click first report card, with a
// stand-in for the save and the confirmation (?fail=1: the save is refused). No Firebase.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FirstReportCard, type FirstReportState } from "../command/FirstReportCard";
import { FIRST_REPORT_LINE } from "../command/firstReport";
import "../theme/fonts.css";
import "../theme/base.css";

const fail = new URLSearchParams(location.search).get("fail") === "1";

function Harness() {
  const [state, setState] = useState<FirstReportState>({ phase: "idle" });
  const [done, setDone] = useState(false);
  const add = () => {
    setState({ phase: "saving" });
    setTimeout(() => {
      if (fail) return setState({ phase: "idle", error: "The report was not saved. Check the connection and try again." });
      setState({ phase: "confirming" });
      setTimeout(() => setDone(true), 400);
    }, 400);
  };
  return (
    <aside className="rail right" style={{ width: 340, height: "100vh" }}>
      <p className="drill">Synthetic practice, not drill data.</p>
      {done ? <p data-testid="confirmed">Confirmed.</p> : <FirstReportCard line={FIRST_REPORT_LINE} state={state} onAdd={add} />}
    </aside>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
