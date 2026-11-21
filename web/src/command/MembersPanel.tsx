// The people in this drill command can remove: each searcher and family member, with Remove from this drill and an
// inline confirm. Removal is final for the incident (the account cannot join it again), so it always asks first.

import { useState } from "react";
import { removeErrorMessage, type MemberRow } from "../data/members";

/** stale: a read of the members or removal records was refused, so the list may be out of date; nothing is offered. */
export function MembersPanel({ rows, onRemove, stale = false }: { rows: readonly MemberRow[]; onRemove: (uid: string) => Promise<void>; stale?: boolean }) {
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ uid: string; line: string } | null>(null);
  // Removed from this seat: shown as Removed at once, before the removal record reaches the listener.
  const [doneHere, setDoneHere] = useState<ReadonlySet<string>>(() => new Set());
  // With no one to list the panel stays away, unless a refused read means the list may be missing people.
  if (rows.length === 0 && !stale) return null;

  async function remove(uid: string) {
    setBusy(uid);
    setErr(null);
    try {
      await onRemove(uid);
      setDoneHere((s) => new Set([...s, uid]));
      setAsking(null);
    } catch (e) {
      setErr({ uid, line: removeErrorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="people-h">
      <h2 id="people-h" className="label">People</h2>
      {stale && <p className="small">This list may be out of date. Reload the page before removing anyone.</p>}
      <ul className="people">
        {rows.map((r) => (
          <li key={r.uid} data-member={r.uid}>
            <span>{r.label}</span>
            {r.removed || doneHere.has(r.uid) ? (
              <span className="tag">Removed</span>
            ) : stale ? null : asking === r.uid ? (
              <div className="confirm">
                <p className="small">Remove {r.label}? They lose access at once and cannot join again.</p>
                <div className="row">
                  <button type="button" className="btn" disabled={busy !== null} onClick={() => void remove(r.uid)}>
                    Remove
                  </button>
                  <button type="button" className="btn ghost" disabled={busy !== null} onClick={() => { setAsking(null); setErr(null); }}>
                    Cancel
                  </button>
                </div>
                {busy === r.uid && <p role="status">Removing...</p>}
                {err?.uid === r.uid && (
                  <p className="error" role="alert">
                    {err.line}
                  </p>
                )}
              </div>
            ) : (
              <button type="button" className="btn ghost" disabled={busy !== null} onClick={() => { setAsking(r.uid); setErr(null); }}>
                Remove from this drill
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
