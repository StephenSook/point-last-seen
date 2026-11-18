import { useState, type JSX } from "react";
import { MATCH_MEANING } from "./radioCard";
import { compareCodes, normalizeHeardCode } from "./radioCode";

export function RadioCodeCheck({ mine, reportCount }: { mine: string | null; reportCount: number; planVersion: number | null }): JSX.Element {
  const [heard, setHeard] = useState("");
  let result = "";
  if (mine === null) {
    result = "No match code at command yet.";
  } else if (heard.trim() !== "") {
    if (!normalizeHeardCode(heard).ok) {
      result = "A match code has 4 characters. Letters I, L, O and U are never used.";
    } else if (compareCodes(heard, mine) === "same") {
      result = "Same map.";
    } else {
      result = `Different map. Ask the team how many reports they have. Command has ${reportCount}.`;
    }
  }

  return (
    <div className="extras-radio-check">
      <label>
        Code heard on the radio
        <input
          data-initial-focus="" autoComplete="off" autoCapitalize="characters" spellCheck={false}
          value={heard} onChange={(event) => setHeard(event.target.value)}
        />
      </label>
      <p role="status">{result}</p>
      <p>{MATCH_MEANING}</p>
    </div>
  );
}
