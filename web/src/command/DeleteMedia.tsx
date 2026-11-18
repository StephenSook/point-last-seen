// "Delete this search's clips and photos" (command only, from the More menu, never on the working
// screen). It counts what is stored, asks with the counts, and on "Delete now" calls the server,
// which checks the caller and removes the clips, the photos and their readings at once.

import { useEffect, useRef, useState } from "react";
import { deletedLine, deleteMediaMessage, deleteQuestion, type MediaCounts } from "../data/media";

type Props = {
  count: () => Promise<MediaCounts>;
  /** Calls the server; resolves with how many files and records it removed. */
  run: () => Promise<number>;
  onClose: () => void;
};

type State =
  | { kind: "counting" }
  | { kind: "ask"; question: string | null }
  | { kind: "deleting" }
  | { kind: "done"; line: string }
  | { kind: "error"; message: string; question: string | null };

export function DeleteMedia({ count, run, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: "counting" });
  // Counted once, when the control opens: a parent re-render must not reset an answer on screen.
  const countOnce = useRef(count);

  useEffect(() => {
    let live = true;
    countOnce.current().then(
      (c) => live && setState({ kind: "ask", question: deleteQuestion(c) }),
      () => live && setState({ kind: "error", message: "The clips and photos could not be counted. Try again.", question: null }),
    );
    return () => {
      live = false;
    };
  }, []);

  async function remove(question: string | null) {
    setState({ kind: "deleting" });
    try {
      setState({ kind: "done", line: deletedLine(await run()) });
    } catch (e) {
      setState({ kind: "error", message: deleteMediaMessage(e), question });
    }
  }

  const question = state.kind === "ask" || state.kind === "error" ? state.question : null;
  return (
    <div className="delete-media">
      {state.kind === "counting" && <p className="muted">Counting this search's clips and photos.</p>}
      {(state.kind === "ask" || state.kind === "error") && <p>{question ?? "There are no clips or photos for this search."}</p>}
      {state.kind === "deleting" && <p className="muted">Deleting.</p>}
      {state.kind === "done" && <p role="status">{state.line}</p>}
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
          {state.kind === "done" ? "Close" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
