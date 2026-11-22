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
   * The sighting form asked to open this segment's debrief (a search report typed as a sighting): its form opens as
   * Add or Edit would, unless the form or the paper sheet is already open, and the cursor goes to What worked. Nothing
   * is carried over or saved. A new `seq` asks again.
   */
  openRequest?: { segmentId: string; seq: number } | null;
};

export function DebriefSection({ cleared, debriefs, teams, onSave, paperRead, openRequest = null }: Props) {
  const ids = [...new Set([...cleared.map((c) => c.segmentId), ...Object.keys(debriefs)])].sort();
  return (
    <section aria-labelledby="debrief-h" className="layers">
      <h2 id="debrief-h" className="label">Debriefs</h2>
      {ids.length === 0 && <p className="muted small">Cleared segments get a debrief here.</p>}
      {ids.map((id) => (
        <DebriefRow key={id} segmentId={id} cleared={cleared.find((c) => c.segmentId === id)} debrief={debriefs[id]} teams={teams} onSave={onSave} paperRead={paperRead} openSeq={openRequest?.segmentId === id ? openRequest.seq : undefined} />
      ))}
    </section>
  );
}

const CHANGED_ELSEWHERE = "This debrief was saved from another screen while you edited. Cancel and open it again to see it.";

/** What a stored debrief says, for telling whether it changed since a form opened on it (not when it was stamped). */
function debriefWords(d: Debrief | undefined): string {
  return d ? JSON.stringify([d.tookMinutes, d.worked ?? "", d.didNotWork ?? "", d.coverageStatedPct ?? null, d.clues ?? "", d.hazards ?? "", d.byUid]) : "none";
}

function DebriefRow({ segmentId, cleared, debrief, teams, onSave, paperRead, openSeq }: { segmentId: string; cleared: ClearedSegment | undefined; debrief: Debrief | undefined; teams: Props["teams"]; onSave: Props["onSave"]; paperRead: PaperRead | undefined; openSeq: number | undefined }) {
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

  const rowRef = useRef<HTMLDivElement>(null);
  const workedBox = useRef<HTMLTextAreaElement>(null);
  const focusAsked = useRef(false);
  useEffect(() => {
    if (openSeq === undefined) return;
    if (!editing && !paper) open();
    focusAsked.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSeq]);
  useEffect(() => {
    if (!focusAsked.current) return;
    // The form opens on the render after the request; with the paper sheet open there is no box, only the row to show.
    if (!workedBox.current && !paper) return;
    focusAsked.current = false;
    rowRef.current?.scrollIntoView({ block: "center" });
    workedBox.current?.focus();
  });

  // The stored debrief as the form opened on it: a save refuses if another screen has saved it since, rather than
  // overwrite what that screen wrote with this form's older copy.
  const openedWith = useRef("");

  function open() {
    setMinutes(debrief ? String(debrief.tookMinutes) : "");
    setWorked(debrief?.worked ?? "");
    setDidNotWork(debrief?.didNotWork ?? "");
    setCoverage(debrief?.coverageStatedPct !== undefined ? String(debrief.coverageStatedPct) : "");
    setClues(debrief?.clues ?? "");
    setHazards(debrief?.hazards ?? "");
    setError(null);
    openedWith.current = debriefWords(debrief);
    setEditing(true);
  }

  async function save() {
    if (debriefWords(debrief) !== openedWith.current) {
      setError(CHANGED_ELSEWHERE);
      return;
    }
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
    <div className="layer" data-testid={`debrief-${segmentId}`} ref={rowRef}>
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
