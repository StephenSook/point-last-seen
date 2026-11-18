import { useMemo, type JSX } from "react";
import type { PublishedRun } from "./laneC";
import { ReplayPanel } from "./replay/ReplayPanel";
import { fromPublishedRun } from "./replay/replayData";
import "./extras.css";

/**
 * The judge page's extras. With no published run it draws nothing: lane C's page already says "No published run
 * yet." A run the replay cannot read is refused in plain words; it is never replayed with a guess.
 */
export function JudgeExtras({ run }: { run: PublishedRun | null }): JSX.Element | null {
  const replay = useMemo(() => (run ? fromPublishedRun(run) : null), [run]);
  if (!replay) return null;
  return (
    <section aria-labelledby="extras-replay-h" className="extras-judge-replay">
      <h2 id="extras-replay-h" className="label">Watch the run over time</h2>
      {replay.ok ? <ReplayPanel data={replay.data} /> : <p data-testid="replay-refused">This run cannot be replayed. {replay.reason}</p>}
    </section>
  );
}
