import { useEffect, useState } from "react";
import type { PlanDraft, WordedPlan } from "../ai/replanWording";
import { planLimitLine } from "../data/plans";
import { receiptLines } from "../ai/receipt";
import { RouteGlyph } from "./RouteGlyph";

type Props = {
  draft: PlanDraft | null;
  onSuggest: () => Promise<WordedPlan>;
  /** Starts the write and returns at once; `ack` settles when the server has the plan or refuses it. */
  onApprove: (worded: WordedPlan) => { version: number; ack: Promise<void> };
  planStatus: (version: number) => "unknown" | "sending" | "sent";
  /** Team names, so the plan a person approves reads "Team 2", not a document id. */
  teams?: readonly { teamId: string; name: string }[];
};

const WHY: Record<NonNullable<WordedPlan["attempt"]>["failure"], string> = {
  error: "the model call failed",
  timeout: "the model took too long",
  unreadable: "its answer could not be read",
  rejected: "its wording failed the checks",
  number: "it used a number that is not in the plan",
};

/** "What ran" for a suggestion; a model that was asked but not used is described, then why fixed wording won. */
export function whatRan(w: WordedPlan): string[] {
  const base = { asked: "this laptop first", sentBytes: w.promptBytes ?? 0, what: "plan text" };
  if (w.attempt) return [...receiptLines({ ...base, route: w.attempt.route }), `Not used: ${WHY[w.attempt.failure]}. The plan uses fixed wording from code.`];
  return receiptLines({ ...base, route: w.route });
}

/** The suggested plan. Nothing is written before a person presses Approve. */
export function WhatChanged({ draft, onSuggest, onApprove, planStatus, teams = [] }: Props) {
  const nameOf = (id: string) => teams.find((t) => t.teamId === id)?.name ?? id;
  // The reply is kept with the draft it was asked for; it shows (and can be approved) only while
  // that draft is still current, so a reply that lands after the draft changed is never used.
  const [reply, setReply] = useState<{ worded: WordedPlan; key: string | null } | null>(null);
  const [busy, setBusy] = useState<"suggest" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState<number | null>(null);
  // A suggestion belongs to the draft it was worded for: the event set, the prior, the ranked
  // probabilities the model reads and the assignments. If any of them changes (for example the plan
  // history arrives, or another seat's rebuild reaches the segments first), it is withdrawn.
  const draftKey = draft ? JSON.stringify([draft.eventSetHash, draft.priorVersion, draft.rank, draft.assignments]) : null;
  // A draft the plans rule cannot hold is said so here, before a suggestion is asked for.
  const limit = draft ? planLimitLine(draft) : null;
  const suggested = reply && reply.key === draftKey && !limit ? reply.worded : null;

  useEffect(() => {
    setReply(null);
    setError(null);
  }, [draftKey]);

  async function suggest() {
    const askedFor = draftKey;
    setBusy("suggest");
    setError(null);
    setApproved(null);
    try {
      const worded = await onSuggest();
      setReply({ worded, key: askedFor });
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
      setReply(null);
      ack.catch(() => {
        setApproved((v) => (v === version ? null : v));
        setError(`Plan v${version} was not saved: another plan was approved first. Suggest again.`);
      });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The plan was not saved. Suggest again.");
    }
  }

  return (
    <section aria-labelledby="plan-h">
      <h2 id="plan-h" className="label">Plan</h2>
      {!draft ? (
        <p>No draft yet.</p>
      ) : (
        <>
          <p className="muted">Draft from this laptop for the current reports.</p>
          {limit && (
            <p className="error" role="status">
              {limit}
            </p>
          )}
          <button type="button" className="btn" onClick={suggest} disabled={busy !== null || limit !== null}>
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
                <strong>{nameOf(a.teamId)}</strong> {a.taskText} <span className="muted">{a.reason}</span>
              </li>
            ))}
          </ul>
          {suggested.promptBytes !== undefined && (
            <details className="receipt">
              <summary>What ran</summary>
              {whatRan(suggested).map((l) => (
                <p key={l} className="small">{l}</p>
              ))}
            </details>
          )}
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
