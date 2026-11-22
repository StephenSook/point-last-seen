// Command gives searchers or family a new join code: every old code of that role stops working, people already in the
// search stay in. The new code is shown once, here, with Copy; only its hash is stored. Offered on an open drill only
// (a practice search has no join codes, and an ended one takes no new members).

import { useState } from "react";
import { rotateErrorMessage, type CodeRole, type Rotation } from "../data/joinCodes";

const NAMES: Record<CodeRole, { plural: string; one: string }> = {
  searcher: { plural: "searchers", one: "searcher" },
  family: { plural: "family", one: "family" },
};

export function JoinCodes({ onRotate }: { onRotate: (role: CodeRole) => Promise<Rotation> }) {
  const [asking, setAsking] = useState<CodeRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<Rotation | null>(null);
  // The code the clipboard took, so a Copy that finishes after the panel moved on never marks another code copied.
  const [copied, setCopied] = useState<string | null>(null);

  async function rotate(role: CodeRole) {
    setBusy(true);
    setErr(null);
    try {
      setMade(await onRotate(role));
      setAsking(null);
      setCopied(null);
    } catch (e) {
      setErr(rotateErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="codes-h">
      <h2 id="codes-h" className="label">Join codes</h2>
      {made ? (
        <div className="confirm">
          <p className="small">
            New {NAMES[made.role].one} code. It is shown once and replaced {made.replaced} old {made.replaced === 1 ? "code" : "codes"}.
          </p>
          <p className="code-once" data-testid="new-code">{made.code}</p>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const code = made.code;
                void navigator.clipboard?.writeText(code).then(() => setCopied(code), () => setCopied(null));
              }}
            >
              Copy
            </button>
            <button type="button" className="btn ghost" onClick={() => setMade(null)}>
              Done
            </button>
          </div>
          {copied === made.code && <p role="status" className="small">Copied.</p>}
        </div>
      ) : asking ? (
        <div className="confirm">
          <p className="small">
            Give {NAMES[asking].plural} a new code? Every {NAMES[asking].one} code given out stops working. People already in the search stay in.
          </p>
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={() => void rotate(asking)}>
              Replace the code
            </button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => { setAsking(null); setErr(null); }}>
              Cancel
            </button>
          </div>
          {busy && <p role="status">Making a new code...</p>}
          {err && (
            <p className="error" role="alert">
              {err}
            </p>
          )}
        </div>
      ) : (
        <div className="row">
          {(["searcher", "family"] as const).map((role) => (
            <button key={role} type="button" className="btn ghost" onClick={() => { setAsking(role); setErr(null); }}>
              Give {NAMES[role].plural} a new code
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
