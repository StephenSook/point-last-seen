// Dev-server-only harness (web/harness/first-report.html): the practice search's one-click first report card, with a
// stand-in for the save and the confirmation. Each step waits for its button ("Server has it", "Confirm done", "Server
// refuses"), so a check sees every step however long it takes to look. No Firebase.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FirstReportCard, type FirstReportState } from "../command/FirstReportCard";
import { FIRST_REPORT_LINE } from "../command/firstReport";
import "../theme/fonts.css";
import "../theme/base.css";

function Harness() {
  const [state, setState] = useState<FirstReportState>({ phase: "idle" });
  const [done, setDone] = useState(false);
  const add = () => setState({ phase: "saving" });
  return (
    <aside className="rail right" style={{ width: 340, height: "100vh" }}>
      <p className="drill">Synthetic practice, not drill data.</p>
      {done ? <p data-testid="confirmed">Confirmed.</p> : <FirstReportCard line={FIRST_REPORT_LINE} state={state} onAdd={add} />}
      <button type="button" onClick={() => setState({ phase: "confirming" })}>Server has it</button>
      <button type="button" onClick={() => setDone(true)}>Confirm done</button>
      <button type="button" onClick={() => setState({ phase: "idle", error: "The report was not saved. Check the connection and try again." })}>Server refuses</button>
    </aside>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
