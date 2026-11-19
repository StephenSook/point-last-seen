// Dev-server-only harness (web/harness/family.html): the family channel with one answered and one open
// question. Asks and state changes are recorded on the page; ?fail=1 refuses them. No Firebase.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FamilyChannel } from "../command/FamilyChannel";
import type { FamilyQuestion, SearchState } from "../data/familyQuestions";
import "../theme/fonts.css";
import "../theme/base.css";

const fail = new URLSearchParams(location.search).get("fail") === "1";
const questions: FamilyQuestion[] = [
  { id: "q2", text: "Places they used to walk or live?", askedAtMs: 2, answer: null },
  { id: "q1", text: "Did they ever go by another name?", askedAtMs: 1, answer: { text: "Bea, and Mom to the grandkids", atMs: 3 } },
];

function Harness() {
  const [asked, setAsked] = useState("");
  const [told, setTold] = useState<SearchState | null>(null);
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic questions, not drill data.</p>
      <FamilyChannel
        questions={questions}
        searchState={told}
        onAsk={async (text) => {
          if (fail) throw new Error("refused");
          setAsked(text);
        }}
        onTell={async (s) => {
          if (fail) throw new Error("refused");
          setTold(s);
        }}
      />
      <pre data-testid="asked">{asked}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
