// Who searchers are looking for and how to approach them. Code and fixed
// copy only: no model reads or writes any of it.

import { trackingAidLines, type SharedProfile } from "@pls/engine";
import { answersToLine, APPROACH_FOOTER, approachLines } from "../data/profile";

function height(ft: number | null, inch: number | null): string {
  if (ft === null) return "";
  return `${ft} ft${inch !== null ? ` ${inch} in` : ""}`;
}

export function ApproachCard({ shared, photoOld }: { shared: SharedProfile; photoOld: boolean }) {
  const { first, more } = approachLines(shared);
  const facts = [
    shared.ageYears !== null ? `${shared.ageYears} years` : "",
    height(shared.heightFt, shared.heightIn),
    shared.appearance,
    shared.clothingLastWorn ? `Last seen in ${shared.clothingLastWorn}` : "",
    shared.mobilityAids.length > 0 ? `Uses a ${shared.mobilityAids.join(", ")}` : "",
  ].filter((f) => f !== "");
  return (
    <section aria-labelledby="approach-h" className="approach" data-testid="approach-card">
      <h2 id="approach-h" className="label">Who and how to approach</h2>
      {answersToLine(shared) && <p className="answers">{answersToLine(shared)}</p>}
      {facts.length > 0 && <p className="muted">{facts.join(". ")}.</p>}
      {/* The engine's words for each tracking aid the family named (none when the field is absent). */}
      {trackingAidLines(shared).length > 0 && (
        <ul className="notes" data-testid="tracking-aids">
          {trackingAidLines(shared).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {photoOld && <p role="status">The photo is more than two months old. Ask the family for a newer one.</p>}
      <ul className="notes">
        {first.map((l) => (
          <li key={l.id}>{l.text}</li>
        ))}
      </ul>
      {more.length > 0 && (
        <details>
          <summary>More</summary>
          <ul className="notes">
            {more.map((l) => (
              <li key={l.id}>{l.text}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="muted small">{APPROACH_FOOTER}</p>
    </section>
  );
}
