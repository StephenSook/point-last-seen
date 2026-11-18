import { useEffect, useState } from "react";
import type { PlanDraft, WordedPlan } from "../ai/replanWording";
import { RouteGlyph } from "./RouteGlyph";

type Props = {
  draft: PlanDraft | null;
  draftSource: "server" | "local";
  onSuggest: () => Promise<WordedPlan>;
  /** Starts the write and returns at once; `ack` settles when the server has the plan or refuses it. */
  onApprove: (worded: WordedPlan) => { version: number; ack: Promise<void> };
  planStatus: (version: number) => "unknown" | "sending" | "sent";
};

/** The suggested plan. Nothing is written before a person presses Approve. */
export function WhatChanged({ draft, draftSource, onSuggest, onApprove, planStatus }: Props) {
  const [suggested, setSuggested] = useState<WordedPlan | null>(null);
  const [busy, setBusy] = useState<"suggest" | null>(null);
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

  function approve() {
    if (!suggested) return;
    setError(null);
    try {
      const { version, ack } = onApprove(suggested);
      setApproved(version);
      setSuggested(null);
      ack.catch(() => {
        setApproved((v) => (v === version ? null : v));
        setError(`Plan v${version} was not saved: another plan was approved first. Suggest again.`);
      });
    } catch {
      setError("The plan was not saved. Suggest again.");
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
            Approve
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {approved !== null && (
        <p role="status" data-testid="plan-status">
          {planStatus(approved) === "sent" ? `Approved as plan v${approved}. Sent.` : `Approved on this laptop as plan v${approved}. Sending.`}
        </p>
      )}
    </section>
  );
}
