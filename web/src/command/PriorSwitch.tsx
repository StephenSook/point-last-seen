// Walkers or Rings (spec 10.6): the ring prior stays the baseline and the comparison; the
// walker prior is a seeded simulation on the site's route graph. Both options are ours and
// say so. A change rebuilds the prior for every team, so it asks first.

import { useState } from "react";

export const WALKER_SENTENCE = "The walker model is a prior for planning. It does not predict where a person is.";

export type PriorChoice = { model: "rings" | "walkers"; attract: boolean; lowMobility: boolean };
type Run = { n: number; elapsedMs: number };

type Props = {
  model: "rings" | "walkers";
  graph: "ok" | "absent" | "invalid" | "unavailable" | "loading";
  /** Confirmed places to check exist (the attractor option uses them). */
  hasPlaces: boolean;
  /** Runs the walkers (in the Worker) or the rings, starts the write, and returns once the run is done. */
  onApply: (choice: PriorChoice) => Promise<{ version: number; ack: Promise<void>; run: Run | null }>;
};

const GRAPH_LINE: Record<Exclude<Props["graph"], "ok">, string> = {
  absent: "Walkers need this site's route graph.",
  invalid: "This site's route graph could not be read.",
  unavailable: "This site's route graph could not be loaded. Reload to try again.",
  loading: "Loading this site's route graph.",
};

export function PriorSwitch({ model, graph, hasPlaces, onApply }: Props) {
  const [want, setWant] = useState<"rings" | "walkers" | null>(null);
  const [attract, setAttract] = useState(false);
  const [lowMobility, setLowMobility] = useState(false);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  // The version the server acknowledged; a queued local write moves the local version at once.
  const [acked, setAcked] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    if (!want) return;
    setBusy(true);
    setError(null);
    try {
      const r = await onApply({ model: want, attract, lowMobility });
      setRun(r.run);
      setSent(r.version);
      setWant(null);
      r.ack.then(
        () => setAcked(r.version),
        () => {
          setSent(null);
          setError("The prior was not saved. Try again.");
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The prior was not rebuilt.");
    } finally {
      setBusy(false);
    }
  }

  const pick = (m: "rings" | "walkers") => setWant(m === model ? null : m);
  return (
    <section aria-labelledby="model-h" className="layers">
      <h2 id="model-h" className="label">Prior model</h2>
      <div className="row" role="group" aria-label="Prior model">
        <button type="button" className="btn ghost" aria-pressed={(want ?? model) === "rings"} onClick={() => pick("rings")} disabled={busy}>
          Rings
        </button>
        <button type="button" className="btn ghost" aria-pressed={(want ?? model) === "walkers"} onClick={() => pick("walkers")} disabled={busy || graph !== "ok"}>
          Walkers
        </button>
      </div>
      {graph !== "ok" && <p className="muted small">{GRAPH_LINE[graph]}</p>}
      <label className="check">
        <input type="checkbox" role="switch" checked={attract} disabled={!hasPlaces || busy} onChange={(e) => setAttract(e.target.checked)} />
        Pull toward confirmed places (ours)
      </label>
      <label className="check">
        <input type="checkbox" role="switch" checked={lowMobility} disabled={busy} onChange={(e) => setLowMobility(e.target.checked)} />
        Low mobility: shorter distances (ours)
      </label>
      <p className="small">{WALKER_SENTENCE}</p>
      {want && (
        <div className="suggested">
          <p>{want === "walkers" ? "Run the walkers and make them the prior?" : "Go back to the ring prior?"} Every team's map and match code change.</p>
          <div className="row">
            <button type="button" className="btn" onClick={() => void apply()} disabled={busy}>
              {busy ? "Running" : want === "walkers" ? "Run walkers" : "Use rings"}
            </button>
            <button type="button" className="btn ghost" onClick={() => setWant(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {run && <p className="num small">{`${run.n.toLocaleString("en-US")} walkers in ${(run.elapsedMs / 1000).toFixed(2)} s on this laptop.`}</p>}
      {sent !== null && <p role="status">{acked === sent ? `Prior rebuilt as v${sent}.` : `Prior rebuilt on this laptop as v${sent}. Sending.`}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
