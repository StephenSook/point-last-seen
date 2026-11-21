// Problem reports: what searchers and family flagged with "Report a problem", newest first, one line each, with the
// reporter's note and the time. Shown only when there is at least one.

import { flagLine, type Flag } from "../data/contentReports";

export function FlagsPanel({ flags, labelFor, timeOf }: {
  flags: readonly Flag[];
  labelFor: (uid: string, role: Flag["role"]) => string;
  timeOf: (ms: number) => string;
}) {
  if (flags.length === 0) return null;
  return (
    <section aria-labelledby="flags-h">
      <h2 id="flags-h" className="label">Problem reports</h2>
      <ul className="flags">
        {flags.map((f) => (
          <li key={f.reportId}>
            <p>
              {flagLine(f, labelFor(f.authorUid, f.role))}
              {f.createdAtMs !== null && <span className="muted small"> {timeOf(f.createdAtMs)}</span>}
            </p>
            {f.note && <p className="muted small">"{f.note}"</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
