// Problem reports: what searchers and family flagged with "Report a problem", newest first, one line each naming what
// was flagged, with the reporter's note and the time. Shown when there is at least one, or when a read was refused.
// The newest three show first, so a run of flags never pushes the working rail out of view.

import { useState } from "react";
import { flagLine, type Flag } from "../data/contentReports";

const SHOWN = 3;

export function FlagsPanel({ flags, labelFor, targetFor, timeOf, stale = false }: {
  flags: readonly Flag[];
  labelFor: (uid: string, role: Flag["role"]) => string;
  /** What was flagged, named well enough to find it ("a report from 04:21 in segment AE"). */
  targetFor: (f: Flag) => string;
  timeOf: (ms: number) => string;
  /** A read of the flags was refused, so the list may be out of date. */
  stale?: boolean;
}) {
  const [all, setAll] = useState(false);
  if (flags.length === 0 && !stale) return null;
  const shown = all ? flags : flags.slice(0, SHOWN);
  return (
    <section aria-labelledby="flags-h">
      <h2 id="flags-h" className="label">Problem reports</h2>
      {stale && <p className="small">These reports may be out of date. Reload the page.</p>}
      {shown.length > 0 && (
        <ul className="flags" role="list">
          {shown.map((f) => (
            <li key={f.reportId}>
              <p>
                {flagLine(f, labelFor(f.authorUid, f.role), targetFor(f))}
                {f.createdAtMs !== null && <span className="muted small"> {timeOf(f.createdAtMs)}</span>}
              </p>
              {f.note && <p className="muted small">"{f.note}"</p>}
            </li>
          ))}
        </ul>
      )}
      {!all && flags.length > SHOWN && (
        <button type="button" className="btn ghost" onClick={() => setAll(true)}>
          Show all {flags.length} problem reports
        </button>
      )}
    </section>
  );
}
