// Every report in the drill, newest first, each one command can take back (reportCards.ts). Retract asks first; a
// retracted report stays in the list, struck through, with who retracted it. The map stops counting it on every
// device, by the same rule a searcher's own undo uses.

import type { EventDoc } from "@pls/engine";
import { useState } from "react";
import type { Team } from "../data/incident";
import type { ReportCard } from "./reportCards";

const KIND: Record<string, string> = { clue: "clue", sighting: "sighting", camera_sighting: "camera sighting", cleared: "cleared", found: "found" };
const SHOWN = 10;

function who(r: EventDoc, teams: readonly Team[]): string {
  const team = r.teamId ? teams.find((t) => t.teamId === r.teamId) : undefined;
  if (team) return team.name;
  if (r.reporter === "family") return "Family";
  if (r.reporter === "camera") return "Camera";
  if (r.reporter === "public_caller") return "Caller";
  return r.role === "command" ? "Command" : "A searcher";
}

/** The segments a report names: the cleared segment, or the segments a clue points at. */
function where(r: EventDoc): string {
  const e = r.effect as { kind?: string; segmentId?: string; influences?: Record<string, string> };
  if (e.kind === "cleared" && e.segmentId) return ` ${e.segmentId}`;
  const ids = e.kind === "clue" && e.influences ? Object.keys(e.influences) : [];
  return ids.length > 0 ? ` in ${ids.join(", ")}` : "";
}

// To the second, so a row matches a Problem report that names it (two reports can share a minute).
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export function ReportsPanel({ cards, teams, onRetract }: { cards: readonly ReportCard[]; teams: readonly Team[]; onRetract: (c: ReportCard) => Promise<void> }) {
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; line: string } | null>(null);
  const [all, setAll] = useState(false);
  const shown = all ? cards : cards.slice(0, SHOWN);

  async function retract(c: ReportCard) {
    setBusy(c.report.eventId);
    setError(null);
    try {
      await onRetract(c);
      setAsking(null);
    } catch {
      setError({ id: c.report.eventId, line: "The retraction was not saved. Try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="reports-h" className="reports">
      <h2 id="reports-h" className="label">Reports</h2>
      {cards.length === 0 ? (
        <p className="muted">No reports yet.</p>
      ) : (
        <ul className="report-list">
          {shown.map((c) => {
            const r = c.report;
            const id = r.eventId;
            const head = `${who(r, teams)}, ${KIND[r.type] ?? r.type}${where(r)}, ${clock(r.clientTimeMs)}`;
            const note = r.rawText ?? "No note.";
            return (
              <li key={id} className={c.retractedBy ? "report retracted" : "report"}>
                <p className="report-head">{c.retractedBy ? <s>{head}</s> : head}</p>
                <p>{c.retractedBy ? <s>{note}</s> : note}</p>
                {c.retractedBy === "command" && <p className="muted small">Retracted by command.</p>}
                {c.retractedBy === "author" && <p className="muted small">Retracted by its author.</p>}
                {!c.retractedBy && c.startPoint && <p className="muted small">It set the current start point, so retracting it would not move the start.</p>}
                {!c.retractedBy && !c.startPoint && asking !== id && (
                  <button type="button" className="btn ghost" onClick={() => setAsking(id)}>
                    Retract
                  </button>
                )}
                {!c.retractedBy && !c.startPoint && asking === id && (
                  <div className="note-state">
                    <p>Retract this report? It stays in this list, struck through, and stops changing the map.</p>
                    <div className="row">
                      <button type="button" className="btn" onClick={() => void retract(c)} disabled={busy === id}>
                        Retract report
                      </button>
                      <button type="button" className="btn ghost" onClick={() => setAsking(null)} disabled={busy === id}>
                        Keep it
                      </button>
                    </div>
                  </div>
                )}
                {error?.id === id && (
                  <p role="alert" className="error">
                    {error.line}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!all && cards.length > SHOWN && (
        <button type="button" className="btn ghost" onClick={() => setAll(true)}>
          Show all {cards.length}
        </button>
      )}
    </section>
  );
}
