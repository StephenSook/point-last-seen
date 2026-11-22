import { useEffect, useState } from "react";
import type { PlanDraft, WordedPlan } from "../ai/replanWording";
import { planLimitLine } from "../data/plans";
import { receiptLines } from "../ai/receipt";
import { RouteGlyph } from "./RouteGlyph";
import { planCompare } from "./planCompare";
import { formatPct } from "../map/poaStyle";

type Props = {
  draft: PlanDraft | null;
  /** The plan history has come from the server (the post's plansLoaded); until then Approve refuses. Default true. */
  historyLoaded?: boolean;
  /** Command has paused cloud reading (Remote Config kill_cloud): Suggest plan uses fixed wording and calls no model. */
  cloudPaused?: boolean;
  onSuggest: () => Promise<WordedPlan>;
  /** Starts the write and returns at once; `ack` settles when the server has the plan or refuses it. */
  onApprove: (worded: WordedPlan) => { version: number; ack: Promise<void> };
  planStatus: (version: number) => "unknown" | "sending" | "sent";
  /** Team names, so the plan a person approves reads "Team 2", not a document id. */
  teams?: readonly { teamId: string; name: string }[];
  /** The approved plan's assignments, so a suggestion shows beside it; null before any plan is approved. */
  current?: readonly { teamId: string; segmentIds: readonly string[] }[] | null;
};

const WHY: Record<NonNullable<WordedPlan["attempt"]>["failure"], string> = {
  error: "the model call failed",
  timeout: "the model took too long",
  unreadable: "its answer could not be read",
  rejected: "its answer named other teams or a fact that team does not have",
};

/**
 * What a suggestion was worded for: the event set, the prior, the ranked probabilities, the assignments and the facts
 * the reasons may cite. A suggestion is shown only while this is unchanged.
 */
export function draftKeyOf(draft: PlanDraft | null): string | null {
  return draft ? JSON.stringify([draft.eventSetHash, draft.priorVersion, draft.rank, draft.assignments, draft.facts ?? null]) : null;
}

/** "What ran" for a suggestion; a model that was asked but not used is described, then why fixed wording won. */
export function whatRan(w: WordedPlan): string[] {
  const base = { asked: "this laptop first", sentBytes: w.promptBytes ?? 0, what: "plan text" };
  if (w.attempt) return [...receiptLines({ ...base, route: w.attempt.route }), `Not used: ${WHY[w.attempt.failure]}. The plan uses fixed wording from code.`];
  return receiptLines({ ...base, route: w.route });
}

/** The suggested plan. Nothing is written before a person presses Approve. */
export function WhatChanged({ draft, onSuggest, onApprove, planStatus, teams = [], current = null, historyLoaded = true, cloudPaused = false }: Props) {
  const nameOf = (id: string) => teams.find((t) => t.teamId === id)?.name ?? id;
  // The reply is kept with the draft it was asked for; it shows (and can be approved) only while
  // that draft is still current, so a reply that lands after the draft changed is never used.
  const [reply, setReply] = useState<{ worded: WordedPlan; key: string | null } | null>(null);
  const [busy, setBusy] = useState<"suggest" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState<number | null>(null);
  // A suggestion belongs to the draft it was worded for (draftKeyOf). If any of it changes (for example the plan
  // history arrives, another seat's rebuild reaches the segments first, or a search marks a segment searched), it is
  // withdrawn.
  const draftKey = draftKeyOf(draft);
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
    // data-plans-loaded: whether the plan history has come from the server (Approve waits for it), for checks that take
    // the link down and must not do so before then.
    <section aria-labelledby="plan-h" data-plans-loaded={historyLoaded ? "true" : "false"}>
      <h2 id="plan-h" className="label">Plan</h2>
      {!draft ? (
        <p>No draft yet.</p>
      ) : (
        <>
          <p className="muted">Draft for the current reports.</p>
          {/* Where the wording is made and what leaves this laptop, said before the tap (the prompt is planPrompt). */}
          <p className="small muted">
            {cloudPaused
              ? "Cloud reading is paused, so Suggest plan uses fixed wording and sends nothing."
              : "Suggest plan asks this laptop's built-in model (Gemini in the cloud when it has none) to choose each team's main reason from that team's own facts. Code adds a second fact and writes every word. It sends only team ids, segment codes and fact codes, never a note or a name."}
          </p>
          {limit && (
            <p className="error" role="status">
              {limit}
            </p>
          )}
          <button type="button" className="btn" onClick={suggest} disabled={busy !== null || limit !== null}>
            {busy === "suggest" ? "Suggesting" : "Suggest plan"}
          </button>
          {busy === "suggest" && (
            <p role="status" className="muted">
              Wording the plan. The first time on this laptop can take up to a minute.
            </p>
          )}
        </>
      )}
      {suggested && (
        <div className="suggested" data-testid="suggested-plan">
          <div className="suggested-head">
            <span className="tag">Suggested</span>
            <RouteGlyph route={suggested.route} />
          </div>
          {/* Beside the approved plan: each team's segments now and suggested, and the probability each plan's segments
              hold on the current map. */}
          {draft && current && current.length > 0 && (() => {
            const c = planCompare(current, draft.assignments, draft.rank);
            const cell = (ids: readonly string[], poa: number) => (ids.length === 0 ? "None" : `${ids.join(", ")}, ${formatPct(poa)}`);
            return (
              <table className="compare" aria-label="The approved plan and this suggestion">
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    <th scope="col">Now</th>
                    <th scope="col">Suggested</th>
                  </tr>
                </thead>
                <tbody>
                  {c.rows.map((r) => (
                    <tr key={r.teamId} className={r.changed ? "changed" : undefined}>
                      <th scope="row">{nameOf(r.teamId)}</th>
                      <td>{cell(r.now, r.nowPoa)}</td>
                      <td>{r.changed ? cell(r.next, r.nextPoa) : "Same"}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <th scope="row">In these segments</th>
                    <td>{formatPct(c.nowTotal)}</td>
                    <td>{formatPct(c.nextTotal)}</td>
                  </tr>
                </tbody>
              </table>
            );
          })()}
          {/* A fallback shows only as the route mark (Fixed wording); why the model was not used is in What ran. */}
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
