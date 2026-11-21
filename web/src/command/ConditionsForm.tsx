// Command types the air temperature and whether the person is likely wet. The phones turn them into the urgency
// chip (the shared rule and its CDC source); the rail shows the same chip, as a planning cue, not a medical judgment.

import type { IncidentConditions } from "@pls/engine";
import { useEffect, useState } from "react";
import { parseConditions, urgencyChip, URGENCY_SOURCE_LINE, URGENCY_SOURCE_URL } from "../data/conditions";

type Props = {
  /** The incident's conditions, or null when none were typed. */
  conditions: IncidentConditions | null;
  /** The incident can still be edited (the rules refuse a closed one). */
  open: boolean;
  onSave: (conditions: IncidentConditions) => Promise<void>;
};

const WET = [
  { label: "Yes", value: true },
  { label: "No", value: false },
  { label: "Not known", value: null },
] as const;

function setLine(c: IncidentConditions): string {
  const at = new Date(c.setAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const temp = c.tempF === null ? "temperature not known" : `${c.tempF} °F`;
  const wet = c.wet === null ? "not known" : c.wet ? "yes" : "no";
  return `Read at ${at}: ${temp}, wet: ${wet}.`;
}

export function ConditionsForm({ conditions, open, onSave }: Props) {
  const [temp, setTemp] = useState(conditions?.tempF != null ? String(conditions.tempF) : "");
  const [wet, setWet] = useState<boolean | null>(conditions?.wet ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const setAt = conditions?.setAtMs ?? null;

  // New conditions on the incident (this seat's save or another's) become the fields' values.
  useEffect(() => {
    if (!conditions) return;
    setTemp(conditions.tempF != null ? String(conditions.tempF) : "");
    setWet(conditions.wet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setAt]);

  async function save() {
    const r = parseConditions(temp, wet, Date.now());
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(r.conditions);
    } catch {
      setError("The conditions were not saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const chip = urgencyChip(conditions);
  return (
    <section aria-labelledby="conditions-h" className="layers conditions-form">
      <h2 id="conditions-h" className="label">Conditions</h2>
      <div className="layer">
        <label>
          Air temperature (°F)
          <input type="text" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} disabled={!open || saving} />
        </label>
        <fieldset className="row" disabled={!open || saving}>
          <legend>Is the person likely wet?</legend>
          {WET.map((w) => (
            <label key={w.label}>
              <input type="radio" name="conditions-wet" checked={wet === w.value} onChange={() => setWet(w.value)} />
              {w.label}
            </label>
          ))}
        </fieldset>
        <button type="button" className="btn" onClick={() => void save()} disabled={!open || saving}>
          {saving ? "Saving" : "Save conditions"}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {conditions ? (
          <p className="small" data-testid="conditions-set">
            {setLine(conditions)}
          </p>
        ) : (
          <p className="small">Not set. The phones show no urgency cue.</p>
        )}
        {conditions &&
          (chip ? (
            <>
              <p className="chip" data-testid="urgency-chip">
                {chip}
              </p>
              <p className="small">A planning cue from a cited source, not a medical judgment.</p>
              <p className="small muted">
                {URGENCY_SOURCE_LINE}{" "}
                <a href={URGENCY_SOURCE_URL} target="_blank" rel="noopener noreferrer">
                  CDC source
                </a>
              </p>
            </>
          ) : (
            <p className="small">The phones show no urgency cue.</p>
          ))}
      </div>
    </section>
  );
}
