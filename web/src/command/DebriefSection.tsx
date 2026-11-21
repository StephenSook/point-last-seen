// After a segment is cleared: how long it took, what worked or did not, and, as the team stated it, how much it
// covered and what clues and hazards it saw, for the team's own review. Command adds or edits one per segment. A
// debrief never moves the map, the probabilities or the plans: a stated coverage is the team's words, not a claim.

import { useEffect, useRef, useState } from "react";
import { debriefAuthor, parseDebriefForm, type ClearedSegment, type Debrief, type DebriefInput } from "../data/debriefs";
import { DebriefPaperRead, type PaperRead } from "./DebriefPaperRead";

type Props = {
  cleared: readonly ClearedSegment[];
  debriefs: Readonly<Record<string, Debrief>>;
  teams: readonly { teamId: string; name: string }[];
  /** Creates the debrief, or edits it when `existing`; rejects when the server refuses. */
  onSave: (segmentId: string, input: DebriefInput, existing: boolean, clearedEventId: string | null) => Promise<void>;
  /** Reads a team's paper sheet on this laptop; without it, no paper read is offered. */
  paperRead?: PaperRead;
  /**
   * A search report the sighting form sent here: that segment's row opens its form with the note added under What
   * worked (the team's account of the search), unsaved until command saves it. A new `seq` opens it again.
   */
  prefill?: { segmentId: string; note: string; seq: number } | null;
};

export function DebriefSection({ cleared, debriefs, teams, onSave, paperRead, prefill = null }: Props) {
  const ids = [...new Set([...cleared.map((c) => c.segmentId), ...Object.keys(debriefs)])].sort();
  return (
    <section aria-labelledby="debrief-h" className="layers">
      <h2 id="debrief-h" className="label">Debriefs</h2>
      {ids.length === 0 && <p className="muted small">Cleared segments get a debrief here.</p>}
      {ids.map((id) => (
        <DebriefRow key={id} segmentId={id} cleared={cleared.find((c) => c.segmentId === id)} debrief={debriefs[id]} teams={teams} onSave={onSave} paperRead={paperRead} prefill={prefill?.segmentId === id ? prefill : null} />
      ))}
    </section>
  );
}

function DebriefRow({ segmentId, cleared, debrief, teams, onSave, paperRead, prefill }: { segmentId: string; cleared: ClearedSegment | undefined; debrief: Debrief | undefined; teams: Props["teams"]; onSave: Props["onSave"]; paperRead: PaperRead | undefined; prefill: Props["prefill"] }) {
  const [editing, setEditing] = useState(false);
  const [paper, setPaper] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [worked, setWorked] = useState("");
  const [didNotWork, setDidNotWork] = useState("");
  const [coverage, setCoverage] = useState("");
  const [clues, setClues] = useState("");
  const [hazards, setHazards] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const workedBox = useRef<HTMLTextAreaElement>(null);
  const focusWorked = useRef(false);

  // A search report from the sighting form: open the form as Add or Edit would, add the note after what What worked
  // already says, and put the cursor there so command sees it and fills in the rest.
  useEffect(() => {
    if (!prefill) return;
    open();
    setPaper(false);
    setWorked((w) => (w ? `${w} ${prefill.note}` : prefill.note));
    focusWorked.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.seq]);
  useEffect(() => {
    if (!focusWorked.current || !workedBox.current) return;
    focusWorked.current = false;
    workedBox.current.focus();
    workedBox.current.scrollIntoView({ block: "center" });
  });

  function open() {
    setMinutes(debrief ? String(debrief.tookMinutes) : "");
    setWorked(debrief?.worked ?? "");
    setDidNotWork(debrief?.didNotWork ?? "");
    setCoverage(debrief?.coverageStatedPct !== undefined ? String(debrief.coverageStatedPct) : "");
    setClues(debrief?.clues ?? "");
    setHazards(debrief?.hazards ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    const parsed = parseDebriefForm({ minutes, worked, didNotWork, coverage, clues, hazards });
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
      {!editing && !paper && (
        <>
          {debrief ? (
            <>
              <p>{`${debrief.tookMinutes} min. By ${debriefAuthor(debrief, cleared, teams)}.`}</p>
              {debrief.worked && <p className="small">{`Worked: ${debrief.worked}`}</p>}
              {debrief.didNotWork && <p className="small">{`Didn't work: ${debrief.didNotWork}`}</p>}
              {debrief.coverageStatedPct !== undefined && <p className="small">{`Coverage stated by the team: ${debrief.coverageStatedPct}%`}</p>}
              {debrief.clues && <p className="small">{`Clues: ${debrief.clues}`}</p>}
              {debrief.hazards && <p className="small">{`Hazards: ${debrief.hazards}`}</p>}
            </>
          ) : (
            <p className="muted small">No debrief yet.</p>
          )}
          <button type="button" className="btn ghost" onClick={open}>
            {debrief ? "Edit debrief" : "Add debrief"}
          </button>
          {paperRead && (
            <button type="button" className="btn ghost" onClick={() => setPaper(true)}>
              Read the paper sheet
            </button>
          )}
        </>
      )}
      {paper && paperRead && (
        <DebriefPaperRead
          segmentId={segmentId}
          read={paperRead}
          onSave={(input) => onSave(segmentId, input, debrief !== undefined, debrief?.clearedEventId ?? cleared?.eventId ?? null)}
          onClose={() => setPaper(false)}
        />
      )}
      {editing && (
        <div className="debrief-form">
          <label>
            Time it took (minutes)
            <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={saving} />
          </label>
          <label>
            What worked (optional)
            <textarea ref={workedBox} maxLength={500} value={worked} onChange={(e) => setWorked(e.target.value)} disabled={saving} />
          </label>
          <label>
            What didn't work (optional)
            <textarea maxLength={500} value={didNotWork} onChange={(e) => setDidNotWork(e.target.value)} disabled={saving} />
          </label>
          <label>
            Coverage the team stated (percent, optional)
            <input inputMode="numeric" value={coverage} onChange={(e) => setCoverage(e.target.value)} disabled={saving} />
          </label>
          <label>
            Clues: what and where (optional)
            <textarea maxLength={500} value={clues} onChange={(e) => setClues(e.target.value)} disabled={saving} />
          </label>
          <label>
            Hazards: what and where (optional)
            <textarea maxLength={500} value={hazards} onChange={(e) => setHazards(e.target.value)} disabled={saving} />
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
