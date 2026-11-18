// /judge: no login, no key. What a judge can check from this page alone.

import { useEffect, useState } from "react";
import { aiClient, deviceModelInitializer } from "../ai/client";
import { deviceState as readDeviceState, getLaptopReady, type DeviceState } from "../ai/deviceModel";
import { RC_DEFAULTS } from "../config/rc";
import { getPls } from "../firebase";
import { d2Copy, loadPublishedRun } from "./judge";

const DRILL_LINE = "Training drill. Nobody is missing.";
// The replay (D1) needs startJudgeSession; until it is built the page never points at it.
const REPLAY_LIVE = false;

export function JudgePage() {
  const [run, setRun] = useState<Awaited<ReturnType<typeof loadPublishedRun>> | null>(null);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => {
    void loadPublishedRun().then(setRun);
  }, []);

  async function check() {
    setChecking(true);
    try {
      const r = await getLaptopReady({
        readState: () => readDeviceState(),
        // Firebase starts only when Chrome can download a model, not on page load.
        initialize: (onProgress) => deviceModelInitializer(aiClient(getPls().app, RC_DEFAULTS.use_limited_use_tokens))(onProgress),
        onPct: setPct,
      });
      setDevice(r.state);
      setDownloadFailed(r.downloadFailed);
    } finally {
      setChecking(false);
    }
  }

  const copy = device ? d2Copy(device, { replay: REPLAY_LIVE && run?.state === "run", downloadFailed }) : null;
  return (
    <main className="judge">
      <p className="drill">{DRILL_LINE}</p>
      <h1>Judge's door</h1>
      <p className="muted">No login and no key. About three minutes.</p>

      <section aria-labelledby="d1-h">
        <h2 id="d1-h" className="label">Replay the training drill</h2>
        {run?.state === "run" ? (
          <p>The replay of the published drill opens here once the sandbox is live.</p>
        ) : (
          <p>No published run yet.</p>
        )}
      </section>

      <section aria-labelledby="d2-h">
        <h2 id="d2-h" className="label">This laptop</h2>
        <button type="button" className="btn" onClick={check} disabled={checking}>
          Get this laptop ready
        </button>
        {pct !== null && <p role="status" className="muted num">Downloading the model: {pct}%</p>}
        {copy && (
          <div role="status" data-testid="d2-state" data-state={device ?? ""}>
            {copy.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        )}
        <p className="muted small">Measured on Chrome 157 stable, a fresh profile: before the download the model is downloadable; after a 77 s download, text and image input are available.</p>
      </section>

      <section aria-labelledby="d5-h">
        <h2 id="d5-h" className="label">Numbers</h2>
        {run === null && <p className="muted">Loading.</p>}
        {run?.state === "none" && <p>No published run yet.</p>}
        {run?.state === "unavailable" && <p>The published run could not be loaded. Reload to try again.</p>}
        {run?.state === "invalid" && <p>The published run file is incomplete, so no numbers are shown.</p>}
        {run?.state === "run" && <p>Published run {String(run.run.runId)}. The numbers panel is added with the recompute script.</p>}
      </section>
    </main>
  );
}
