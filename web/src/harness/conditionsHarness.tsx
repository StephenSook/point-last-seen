// Dev-server-only harness (web/harness/conditions.html): the command post's conditions form. A save is recorded on
// the page and becomes the incident's conditions; ?fail=1 refuses it; ?set=1 starts with conditions typed earlier;
// ?closed=1 is a closed incident. No Firebase.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ConditionsForm } from "../command/ConditionsForm";
import type { IncidentConditions } from "@pls/engine";
import "../theme/fonts.css";
import "../theme/base.css";

const q = new URLSearchParams(location.search);
const fail = q.get("fail") === "1";
const start: IncidentConditions | null = q.get("set") === "1" ? { tempF: 36, wet: null, setAtMs: Date.UTC(2026, 10, 22, 14, 5) } : null;

function Harness() {
  const [conditions, setConditions] = useState<IncidentConditions | null>(start);
  const [saved, setSaved] = useState("");
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic incident, not drill data.</p>
      <ConditionsForm
        conditions={conditions}
        open={q.get("closed") !== "1"}
        onSave={async (c) => {
          if (fail) throw new Error("refused");
          setSaved(JSON.stringify(c));
          setConditions(c);
        }}
      />
      <pre data-testid="saved">{saved}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
