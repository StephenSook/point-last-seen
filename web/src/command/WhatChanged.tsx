import { useEffect, useState } from "react";
import type { PlanDraft, WordedPlan } from "../ai/replanWording";
import { RouteGlyph } from "./RouteGlyph";

type Props = {
  draft: PlanDraft | null;
  draftSource: "server" | "local";
  onSuggest: () => Promise<WordedPlan>;
  onApprove: (worded: WordedPlan) => Promise<number>;
};

/** The suggested plan. Nothing is written before a person presses Approve. */
export function WhatChanged({ draft, draftSource, onSuggest, onApprove }: Props) {
  const [suggested, setSuggested] = useState<WordedPlan | null>(null);
  const [busy, setBusy] = useState<"suggest" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState<number | null>(null);
  const hash = draft?.eventSetHash ?? null;

  useEffect(() => {
    setSuggested(null);
    setError(null);
  }, [hash]);

  async function suggest() {
    setBusy("suggest");
    setError(null);
    setApproved(null);
    try {
      setSuggested(await onSuggest());
    } catch {
      setError("Could not build a suggestion. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!suggested) return;
    setBusy("approve");
    setError(null);
    try {
      setApproved(await onApprove(suggested));
      setSuggested(null);
    } catch {
      setError("The plan was not saved. Another plan may have been approved first. Suggest again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="plan-h">
      <h2 id="plan-h" className="label">Plan</h2>
      {!draft ? (
        <p>No draft yet.</p>
      ) : (
        <>
          <p className="muted">Draft from {draftSource === "server" ? "the server" : "this laptop"} for the current reports.</p>
          <button type="button" className="btn" onClick={suggest} disabled={busy !== null}>
            {busy === "suggest" ? "Suggesting" : "Suggest plan"}
          </button>
        </>
      )}
      {suggested && (
        <div className="suggested" data-testid="suggested-plan">
          <div className="suggested-head">
            <span className="tag">Suggested</span>
            <RouteGlyph route={suggested.route} />
          </div>
          {suggested.notice && <p className="muted" role="status">{suggested.notice}</p>}
          <ul>
            {suggested.wording.assignments.map((a) => (
              <li key={a.teamId}>
                <strong>{a.teamId}</strong> {a.taskText} <span className="muted">{a.reason}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn" onClick={approve} disabled={busy !== null}>
            {busy === "approve" ? "Approving" : "Approve"}
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {approved !== null && <p role="status">Approved as plan v{approved}.</p>}
    </section>
  );
}
