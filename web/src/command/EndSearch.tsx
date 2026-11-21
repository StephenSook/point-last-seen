// Command ends the search here: one button, then an inline confirm that asks why. Nothing is written until a reason
// is picked and End search is pressed; a refused write keeps the confirm open to try again. Once the server has the
// close, the confirm stays held ("Ending the search...") until the post shows the search ended and removes it.

import { useEffect, useRef, useState } from "react";
import { END_REASONS, type EndReason } from "../data/endSearch";

/**
 * queued: this browser has written a close the server has not confirmed yet (also after a reload while offline). It
 * shows only "Ending the search..." and offers no second close, but stays mounted, so if the server refuses the close
 * the confirm comes back with the error.
 */
export function EndSearch({ onEnd, queued = false }: { onEnd: (reason: EndReason) => Promise<void>; queued?: boolean }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<EndReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstReason = useRef<HTMLInputElement>(null);
  // Focus follows the confirm: to the first reason when it opens, back to the button when it closes.
  const opened = useRef(false);
  useEffect(() => {
    if (asking) firstReason.current?.focus();
    else if (opened.current) trigger.current?.focus();
    opened.current = asking;
  }, [asking]);

  if (queued) return <p role="status">Ending the search...</p>;

  if (!asking) {
    return (
      <button ref={trigger} type="button" className="btn ghost" onClick={() => setAsking(true)}>
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
      // Stays busy: the post removes this control once it shows the search ended.
    } catch {
      setErr("Could not end the search. Check the connection and try again.");
      setBusy(false);
    }
  }

  return (
    <fieldset className="end-search">
      <legend>Why is the search ending?</legend>
      {END_REASONS.map((r, i) => (
        <label key={r.value} className="check">
          <input
            ref={i === 0 ? firstReason : undefined}
            type="radio"
            name="end-reason"
            value={r.value}
            checked={reason === r.value}
            disabled={busy}
            onChange={() => setReason(r.value)}
          />
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
