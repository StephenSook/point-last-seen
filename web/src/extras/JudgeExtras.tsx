import { Suspense, useEffect, useMemo, useState, type JSX } from "react";
import { cubeGate, cubeScene } from "./cube/scene";
import { ExtrasBoundary } from "./ExtrasBoundary";
import type { PublishedRun } from "./hostApp";
import { LazyReplayPanel, LazyScamPanel, LazySpaceTimeCube, prefetchJudgePanels } from "./lazyPanels";
import { loadPasses, passLines } from "./passes/passes";
import { fromPublishedRun, type ReplayData } from "./replay/replayData";
import type { PublishedRunV1 } from "./replay/runContract";
import { replayWindow } from "./replay/stateAt";
import { runLabelLine } from "./runLabel";
import { loadScam } from "./scam/scamModel";
import "./extras.css";

/**
 * The judge page's extras. With no published run it draws nothing: the judge page already says "No published run
 * yet." A run the replay cannot read is refused in plain words; it is never replayed with a guess. The space-time
 * cube is drawn only when the run passes its gate (G-CUBE): a near-empty cube is decoration. The camera read check
 * stands on its own file and draws nothing until that file exists.
 */
export function JudgeExtras({ run, scamLoad = loadScam, passesLoad = loadPasses }: {
  run: PublishedRun | null;
  scamLoad?: () => ReturnType<typeof loadScam>;
  passesLoad?: typeof loadPasses;
}): JSX.Element | null {
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  useEffect(() => prefetchJudgePanels(), []);
  const replay = useMemo(() => (run ? fromPublishedRun(run) : null), [run]);
  // The run's own label (a real drill's export says which drill and when), less the drill line the replay prints.
  const label = replay?.ok === true ? runLabelLine(run?.label, replay.data.drillLabel) : null;
  return (
    <>
      {replay && (
        <section aria-labelledby="extras-replay-h" className="extras-judge-replay">
          <h2 id="extras-replay-h" className="label">Watch the drill replay</h2>
          {label && <p className="extras-run-label" data-testid="run-label">{label}</p>}
          {replay.ok ? (
            <>
              <ExtrasBoundary>
                <Suspense fallback={<p>Loading.</p>}>
                  {/* The judge page shows the drill line above its heading, so the card does not repeat it. */}
                  <LazyReplayPanel data={replay.data} drillLine={false} />
                </Suspense>
              </ExtrasBoundary>
              {/* Only for a run the reader accepted, so its teams and events are of the contract's shape. */}
              <ExtrasBoundary>
                <ClosestPasses run={run as unknown as PublishedRunV1} load={passesLoad} timeZone={timeZone} />
              </ExtrasBoundary>
            </>
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

/**
 * Each team's closest pass to the role-player, from the passes file beside the run (tools/extras/import_track.py).
 * Nothing shows without the file; a file the reader refuses says why. The track itself is never fetched.
 */
function ClosestPasses({ run, load, timeZone }: { run: PublishedRunV1; load: typeof loadPasses; timeZone: string }): JSX.Element | null {
  const [state, setState] = useState<Awaited<ReturnType<typeof loadPasses>> | null>(null);
  useEffect(() => {
    let live = true;
    void load(run).then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [run, load]);
  if (state?.state === "invalid") return <p data-testid="closest-passes-refused">The closest-pass file cannot be used. {state.reason}</p>;
  if (state?.state !== "passes") return null;
  return (
    <section aria-labelledby="extras-passes-h" data-testid="closest-passes" className="extras-passes">
      <h3 id="extras-passes-h" className="label">Closest passes</h3>
      <p className="muted">
        Each team's report nearest the role-player at that moment, from the role-player's GPS track. Teams carried no
        GPS logger, so only report moments count. The track itself is not published.
      </p>
      <ul>
        {passLines(state.file, run, timeZone).map((l) => (
          <li key={l.teamId} data-event-id={l.eventId ?? undefined}>{l.text}</li>
        ))}
      </ul>
    </section>
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
