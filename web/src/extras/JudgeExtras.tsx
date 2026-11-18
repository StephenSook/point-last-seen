import { useMemo, useState, type JSX } from "react";
import { SpaceTimeCube } from "./cube/SpaceTimeCube";
import { cubeGate, cubeScene } from "./cube/scene";
import type { PublishedRun } from "./laneC";
import { ReplayPanel } from "./replay/ReplayPanel";
import { fromPublishedRun } from "./replay/replayData";
import { replayWindow } from "./replay/stateAt";
import { ScamPanel } from "./scam/ScamPanel";
import { loadScam } from "./scam/scamModel";
import "./extras.css";

/**
 * The judge page's extras. With no published run it draws nothing: lane C's page already says "No published run
 * yet." A run the replay cannot read is refused in plain words; it is never replayed with a guess. The space-time
 * cube is drawn only when the run passes its gate (G-CUBE): a near-empty cube is decoration. The camera read check
 * stands on its own file and draws nothing until that file exists.
 */
export function JudgeExtras({ run, scamLoad = loadScam }: { run: PublishedRun | null; scamLoad?: () => ReturnType<typeof loadScam> }): JSX.Element | null {
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const replay = useMemo(() => (run ? fromPublishedRun(run) : null), [run]);
  const scene = useMemo(() => {
    if (!replay?.ok) return null;
    const w = replayWindow(replay.data);
    const s = w ? cubeScene(replay.data, w) : null;
    return s && cubeGate(s).pass ? s : null;
  }, [replay]);
  return (
    <>
      {replay && (
        <section aria-labelledby="extras-replay-h" className="extras-judge-replay">
          <h2 id="extras-replay-h" className="label">Watch the run over time</h2>
          {replay.ok ? <ReplayPanel data={replay.data} /> : <p data-testid="replay-refused">This run cannot be replayed. {replay.reason}</p>}
        </section>
      )}
      {scene && (
        <section aria-labelledby="extras-cube-h" className="extras-judge-replay">
          <h2 id="extras-cube-h" className="label">Space and time</h2>
          <SpaceTimeCube scene={scene} timeZone={timeZone} />
        </section>
      )}
      <ScamPanel load={scamLoad} />
    </>
  );
}
