// Command ends the search here: one button, then an inline confirm that asks why. Nothing is written until a reason
// is picked and End search is pressed; a refused write keeps the confirm open to try again.

import { useState } from "react";
import { END_REASONS, type EndReason } from "../data/endSearch";

export function EndSearch({ onEnd }: { onEnd: (reason: EndReason) => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<EndReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!asking) {
    return (
      <button type="button" className="btn ghost" onClick={() => setAsking(true)}>
        End this search
      </button>
    );
  }

  async function end() {
    if (!reason) return;
    setBusy(true);
    setErr(null);
    try {
      await onEnd(reason);
    } catch {
      setErr("Could not end the search. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="end-search">
      <legend>Why is the search ending?</legend>
      {END_REASONS.map((r) => (
        <label key={r.value} className="check">
          <input type="radio" name="end-reason" value={r.value} checked={reason === r.value} disabled={busy} onChange={() => setReason(r.value)} />
          {r.label}
        </label>
      ))}
      <p className="muted small">Every seat shows it ended and takes no new reports. This cannot be undone.</p>
      <div className="row">
        <button type="button" className="btn" disabled={!reason || busy} onClick={() => void end()}>
          End search
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => {
            setAsking(false);
            setReason(null);
            setErr(null);
          }}
        >
          Cancel
        </button>
      </div>
      {busy && <p role="status">Ending the search...</p>}
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
    </fieldset>
  );
}
