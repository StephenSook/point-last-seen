// After a segment is cleared: how long it took and what worked or did not, for the team's own review. Command
// adds or edits one per segment. A debrief never moves the map, the probabilities or the plans.

import { useState } from "react";
import { debriefAuthor, parseDebriefForm, type ClearedSegment, type Debrief, type DebriefInput } from "../data/debriefs";

type Props = {
  cleared: readonly ClearedSegment[];
  debriefs: Readonly<Record<string, Debrief>>;
  teams: readonly { teamId: string; name: string }[];
  /** Creates the debrief, or edits it when `existing`; rejects when the server refuses. */
  onSave: (segmentId: string, input: DebriefInput, existing: boolean, clearedEventId: string | null) => Promise<void>;
};

export function DebriefSection({ cleared, debriefs, teams, onSave }: Props) {
  const ids = [...new Set([...cleared.map((c) => c.segmentId), ...Object.keys(debriefs)])].sort();
  return (
    <section aria-labelledby="debrief-h" className="layers">
      <h2 id="debrief-h" className="label">Debriefs</h2>
      {ids.length === 0 && <p className="muted small">Cleared segments get a debrief here.</p>}
      {ids.map((id) => (
        <DebriefRow key={id} segmentId={id} cleared={cleared.find((c) => c.segmentId === id)} debrief={debriefs[id]} teams={teams} onSave={onSave} />
      ))}
    </section>
  );
}

function DebriefRow({ segmentId, cleared, debrief, teams, onSave }: { segmentId: string; cleared: ClearedSegment | undefined; debrief: Debrief | undefined; teams: Props["teams"]; onSave: Props["onSave"] }) {
  const [editing, setEditing] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [worked, setWorked] = useState("");
  const [didNotWork, setDidNotWork] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function open() {
    setMinutes(debrief ? String(debrief.tookMinutes) : "");
    setWorked(debrief?.worked ?? "");
    setDidNotWork(debrief?.didNotWork ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    const parsed = parseDebriefForm({ minutes, worked, didNotWork });
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(segmentId, parsed.value, debrief !== undefined, debrief?.clearedEventId ?? cleared?.eventId ?? null);
      setEditing(false);
    } catch {
      setError("The debrief was not saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="layer" data-testid={`debrief-${segmentId}`}>
      <p className="num">{segmentId}</p>
      {!editing && (
        <>
          {debrief ? (
            <>
              <p>{`${debrief.tookMinutes} min. By ${debriefAuthor(debrief, cleared, teams)}.`}</p>
              {debrief.worked && <p className="small">{`Worked: ${debrief.worked}`}</p>}
              {debrief.didNotWork && <p className="small">{`Didn't work: ${debrief.didNotWork}`}</p>}
            </>
          ) : (
            <p className="muted small">No debrief yet.</p>
          )}
          <button type="button" className="btn ghost" onClick={open}>
            {debrief ? "Edit debrief" : "Add debrief"}
          </button>
        </>
      )}
      {editing && (
        <div className="debrief-form">
          <label>
            Time it took (minutes)
            <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={saving} />
          </label>
          <label>
            What worked (optional)
            <textarea maxLength={500} value={worked} onChange={(e) => setWorked(e.target.value)} disabled={saving} />
          </label>
          <label>
            What didn't work (optional)
            <textarea maxLength={500} value={didNotWork} onChange={(e) => setDidNotWork(e.target.value)} disabled={saving} />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button type="button" className="btn" onClick={() => void save()} disabled={saving}>
              Save debrief
            </button>
            <button type="button" className="btn ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
