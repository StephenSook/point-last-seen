// "Delete this search's clips and photos" (command only, from the More menu, never on the working
// screen). It counts what is stored, asks with the counts, and on "Delete now" calls the server,
// which checks the caller and removes the clips, the photos and their readings at once.

import { useEffect, useRef, useState } from "react";
import { deletedLine, deleteFailure, deleteQuestion, type MediaCounts } from "../data/media";

type Props = {
  count: () => Promise<MediaCounts>;
  /** Calls the server; resolves with how many files and records it removed, or null when it did not say. */
  run: () => Promise<number | null>;
  onClose: () => void;
};

type State =
  | { kind: "counting"; notice: string | null }
  | { kind: "ask"; question: string | null; notice: string | null }
  | { kind: "deleting" }
  | { kind: "error"; message: string; question: string | null };

const COUNT_FAILED = "The clips and photos could not be counted. Try again.";
const RECOUNT_FAILED = "what is stored now could not be counted. Close this and open it again to check.";

export function DeleteMedia({ count, run, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: "counting", notice: null });
  // The count function as it was when the control opened: a parent re-render must not reset an answer on screen.
  const countOnce = useRef(count);
  const live = useRef(true);

  // Counts what is stored and asks again; `notice` says why it is counting again. A failed count is never
  // shown as an empty search: it says the count failed and offers no delete.
  function recount(notice: string | null, failed: string) {
    setState({ kind: "counting", notice });
    countOnce.current().then(
      (c) => live.current && setState({ kind: "ask", question: deleteQuestion(c), notice }),
      () => live.current && setState({ kind: "error", message: failed, question: null }),
    );
  }

  useEffect(() => {
    live.current = true;
    recount(null, COUNT_FAILED);
    return () => {
      live.current = false;
    };
  }, []);

  async function remove(question: string | null) {
    setState({ kind: "deleting" });
    let deleted: number | null;
    try {
      deleted = await run();
    } catch (e) {
      const f = deleteFailure(e);
      // A refusal comes before anything is deleted; any other failure leaves the outcome unknown, so count again.
      if (f.unconfirmed) recount(f.text, `The server did not confirm the delete, and ${RECOUNT_FAILED}`);
      else setState({ kind: "error", message: f.text, question });
      return;
    }
    // Whatever the server reports, what is left is counted before anything else is offered.
    if (deleted === null) recount(deletedLine(null), `The delete finished, but ${RECOUNT_FAILED}`);
    else recount(deletedLine(deleted), `${deletedLine(deleted)} But ${RECOUNT_FAILED}`);
  }

  const question = state.kind === "ask" || state.kind === "error" ? state.question : null;
  const notice = state.kind === "ask" || state.kind === "counting" ? state.notice : null;
  return (
    <div className="delete-media">
      {notice && <p role="status">{notice}</p>}
      {state.kind === "counting" && <p className="muted">Counting this search's clips and photos.</p>}
      {state.kind === "ask" && <p>{question ?? "There are no clips or photos for this search."}</p>}
      {state.kind === "error" && question && <p>{question}</p>}
      {state.kind === "deleting" && <p className="muted">Deleting.</p>}
      {state.kind === "error" && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
      <div className="row">
        {question && (state.kind === "ask" || state.kind === "error") && (
          <button type="button" className="btn" onClick={() => void remove(question)}>
            Delete now
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onClose} disabled={state.kind === "deleting"}>
          {question ? "Cancel" : "Close"}
        </button>
      </div>
    </div>
  );
}
