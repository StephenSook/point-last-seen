import { Suspense, useEffect, useMemo, useState, type JSX } from "react";
import { cubeGate, cubeScene } from "./cube/scene";
import { ExtrasBoundary } from "./ExtrasBoundary";
import type { PublishedRun } from "./laneC";
import { LazyReplayPanel, LazyScamPanel, LazySpaceTimeCube, prefetchJudgePanels } from "./lazyPanels";
import { fromPublishedRun, type ReplayData } from "./replay/replayData";
import { replayWindow } from "./replay/stateAt";
import { loadScam } from "./scam/scamModel";
import "./extras.css";

/**
 * The judge page's extras. With no published run it draws nothing: the judge page already says "No published run
 * yet." A run the replay cannot read is refused in plain words; it is never replayed with a guess. The space-time
 * cube is drawn only when the run passes its gate (G-CUBE): a near-empty cube is decoration. The camera read check
 * stands on its own file and draws nothing until that file exists.
 */
export function JudgeExtras({ run, scamLoad = loadScam }: { run: PublishedRun | null; scamLoad?: () => ReturnType<typeof loadScam> }): JSX.Element | null {
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  useEffect(() => prefetchJudgePanels(), []);
  const replay = useMemo(() => (run ? fromPublishedRun(run) : null), [run]);
  return (
    <>
      {replay && (
        <section aria-labelledby="extras-replay-h" className="extras-judge-replay">
          <h2 id="extras-replay-h" className="label">Watch the run over time</h2>
          {replay.ok ? (
            <ExtrasBoundary>
              <Suspense fallback={<p>Loading.</p>}>
                <LazyReplayPanel data={replay.data} />
              </Suspense>
            </ExtrasBoundary>
          ) : (
            <p data-testid="replay-refused">This run cannot be replayed. {replay.reason}</p>
          )}
        </section>
      )}
      {replay?.ok && (
        // The scene is computed inside the boundary too: a run that breaks it loses the cube, not the page.
        <ExtrasBoundary>
          <CubeSection data={replay.data} timeZone={timeZone} />
        </ExtrasBoundary>
      )}
      <ExtrasBoundary>
        <Suspense fallback={null}>
          <LazyScamPanel load={scamLoad} />
        </Suspense>
      </ExtrasBoundary>
    </>
  );
}

/** "Space and time", drawn only when the run passes the cube's gate (G-CUBE). */
function CubeSection({ data, timeZone }: { data: ReplayData; timeZone: string }): JSX.Element | null {
  const scene = useMemo(() => {
    const w = replayWindow(data);
    const s = w ? cubeScene(data, w) : null;
    return s && cubeGate(s).pass ? s : null;
  }, [data]);
  if (!scene) return null;
  return (
    <section aria-labelledby="extras-cube-h" className="extras-judge-replay">
      <h2 id="extras-cube-h" className="label">Space and time</h2>
      <ExtrasBoundary>
        <Suspense fallback={<p>Loading.</p>}>
          <LazySpaceTimeCube scene={scene} timeZone={timeZone} />
        </Suspense>
      </ExtrasBoundary>
    </section>
  );
}
