// The command post's channel to the family: tell them the search is searching or paused (a notice with no
// details), and ask them questions whose answers show here. News of a find or their condition never goes
// through it; the search lead gives that in person.

import { useState } from "react";
import { parseQuestion, QUESTION_TEMPLATES, type FamilyQuestion, type SearchState } from "../data/familyQuestions";

type Props = {
  questions: readonly FamilyQuestion[];
  /** The incident is open: the rules take a new question only then. */
  open: boolean;
  /** What the family was last told, or null when nothing was sent. */
  searchState: SearchState | null;
  onAsk: (text: string) => Promise<void>;
  onTell: (state: SearchState) => Promise<void>;
};

export function FamilyChannel({ questions, open, searchState, onAsk, onTell }: Props) {
  const [text, setText] = useState("");
  const [askError, setAskError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [want, setWant] = useState<SearchState | null>(null);
  const [tellError, setTellError] = useState<string | null>(null);
  const [telling, setTelling] = useState(false);

  async function ask() {
    const q = parseQuestion(text);
    if (!q.ok) {
      setAskError(q.message);
      return;
    }
    setAsking(true);
    setAskError(null);
    try {
      await onAsk(q.text);
      setText("");
    } catch {
      setAskError("The question was not sent. Try again.");
    } finally {
      setAsking(false);
    }
  }

  async function tell(state: SearchState) {
    setTelling(true);
    setTellError(null);
    try {
      await onTell(state);
      setWant(null);
    } catch {
      setTellError("The family was not told. Try again.");
    } finally {
      setTelling(false);
    }
  }

  return (
    <section aria-labelledby="family-h" className="layers">
      <h2 id="family-h" className="label">Family</h2>
      <div className="layer">
        <div className="row" role="group" aria-label="Search state for the family">
          {(["searching", "paused"] as const).map((s) => (
            <button key={s} type="button" className="btn ghost" aria-pressed={searchState === s} onClick={() => setWant(s === searchState ? null : s)} disabled={telling}>
              {s === "searching" ? "Searching" : "Paused"}
            </button>
          ))}
        </div>
        {searchState && <p className="small">{`The family was told: ${searchState}.`}</p>}
        {want && (
          <div className="suggested">
            <p>{`Tell the family the search is ${want}? They get a notice with no details.`}</p>
            <div className="row">
              <button type="button" className="btn" onClick={() => void tell(want)} disabled={telling}>
                Tell the family
              </button>
              <button type="button" className="btn ghost" onClick={() => setWant(null)} disabled={telling}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {tellError && (
          <p className="error" role="alert">
            {tellError}
          </p>
        )}
        <p className="muted small">News of a find or their condition goes from the search lead in person, not here.</p>
      </div>
      <div className="layer">
        <label>
          Question for the family
          <textarea maxLength={280} value={text} onChange={(e) => setText(e.target.value)} disabled={asking || !open} />
        </label>
        <div className="row">
          {QUESTION_TEMPLATES.map((t) => (
            <button key={t} type="button" className="btn ghost small" onClick={() => setText(t)} disabled={asking || !open}>
              {t}
            </button>
          ))}
        </div>
        {askError && (
          <p className="error" role="alert">
            {askError}
          </p>
        )}
        {!open && <p className="muted small" role="status">Questions close when the search is no longer open.</p>}
        <button type="button" className="btn" onClick={() => void ask()} disabled={asking || !open}>
          Ask the family
        </button>
      </div>
      {questions.map((q) => (
        <div key={q.id} className="layer" data-testid={`question-${q.id}`}>
          <p>{q.text}</p>
          {q.answer ? <p className="small">{`Answer: ${q.answer.text}`}</p> : <p className="muted small">No answer yet.</p>}
        </div>
      ))}
    </section>
  );
}
