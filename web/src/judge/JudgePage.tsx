// /judge: no login, no key. What a judge can check from this page alone.

import { useEffect, useRef, useState } from "react";
import { aiClient, deviceModelInitializer } from "../ai/client";
import { deviceState as readDeviceState, getLaptopReady, type DeviceState } from "../ai/deviceModel";
import { RC_DEFAULTS, startRemoteConfig, type WebRc } from "../config/rc";
import { practiceErrorMessage, practiceSearch, startWithRetry } from "../data/practice";
import { ensureSignedIn, getPls } from "../firebase";
import { JudgeExtras } from "../extras/JudgeExtras";
import { PURPOSE_LINE } from "../purpose";
import { ADVICE_LINE, d2Copy, fetchedTime, loadPublishedRun, modelLines } from "./judge";

const DRILL_LINE = "Training drill. Nobody is missing.";
// Said while the server is still setting the practice search up and the page is starting it again by itself.
const WAITING_LINE = "Your practice search is still being set up. This page opens it when it is ready.";

export function JudgePage() {
  const [run, setRun] = useState<Awaited<ReturnType<typeof loadPublishedRun>> | null>(null);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [rc, setRc] = useState<WebRc | null>(null);
  const [practice, setPractice] = useState<{ busy: boolean; error: string | null; waiting: string | null }>({ busy: false, error: null, waiting: null });
  // Set before the first await, so a second click in the same moment cannot start a second search.
  const starting = useRef(false);
  // Remote Config picks the cloud model; the real-time listener shows a swap as it happens (C2).
  useEffect(() => {
    try {
      return startRemoteConfig(getPls().app, setRc);
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    document.title = "Judge's door: Point Last Seen";
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

  // A practice search: sign in, ask the server for this browser's own capped training incident
  // (a command seat on it), then open the command post on it. No code is needed.
  // While the server is still setting it up, the page says so and starts again by itself.
  async function startPractice() {
    if (starting.current) return;
    starting.current = true;
    setPractice({ busy: true, error: null, waiting: null });
    try {
      const p = getPls();
      await ensureSignedIn(p.auth);
      const id = await startWithRetry(() => practiceSearch(p.functions, p.auth), {
        onWaiting: () => setPractice({ busy: true, error: null, waiting: WAITING_LINE }),
      });
      location.assign(`/?incident=${encodeURIComponent(id)}`);
    } catch (e) {
      starting.current = false;
      setPractice({ busy: false, error: practiceErrorMessage(e), waiting: null });
    }
  }

  // The laptop line names the replay only when the replay reader accepted the published run.
  const copy = device ? d2Copy(device, { replay: run?.state === "run", downloadFailed }) : null;
  // A run file that exists (read or refused) gets the replay section from JudgeExtras; this page's own section says
  // why there is nothing to replay, so the page has one replay section either way.
  const runFile = run?.state === "run" || run?.state === "refused" ? run.run : null;
  // Before Remote Config starts (or if it cannot), the pinned default is still named.
  const [modelLine, sourceLine, ...more] = rc
    ? modelLines({ cloudModelWeb: rc.cloudModelWeb, cloudModelSource: rc.cloudModelSource ?? "default", fetchedAt: rc.fetchedAtMs ? fetchedTime(rc.fetchedAtMs) : null, killCloud: rc.killCloud })
    : modelLines({ cloudModelWeb: RC_DEFAULTS.cloud_model_web, cloudModelSource: "default", fetchedAt: null, killCloud: false });
  return (
    <main className="judge">
      <p className="wordmark">Point Last Seen</p>
      <p data-testid="judge-purpose">{PURPOSE_LINE}</p>
      <p data-testid="judge-advice" className="judge-advice">{ADVICE_LINE}</p>
      {/* The repository and the video join these links once they are public. */}
      <nav aria-label="Links" className="judge-links">
        <a href="/">Command post</a>
      </nav>
      {/* The three-minute route, in order; each step jumps to its section on this page. */}
      <ol aria-label="Three minutes, in order" className="judge-route">
        <li><a href="#practice-h">Try a practice search</a></li>
        <li><a href={runFile ? "#extras-replay-h" : "#d1-h"}>Watch the drill replay</a></li>
        <li><a href="#d2-h">Get this laptop ready</a></li>
        <li><a href="#model-h">See the cloud model</a></li>
      </ol>
      <p className="drill">{DRILL_LINE}</p>
      <h1>Judge's door</h1>
      <p className="muted">No login and no key. About three minutes.</p>

      <section aria-labelledby="practice-h">
        <h2 id="practice-h" className="label">Try a practice search</h2>
        <p>A training incident on a real park map with the real engine. Add a sighting, then confirm it under Sightings, and watch the map and the plan change.</p>
        <button type="button" className="btn" onClick={() => void startPractice()} disabled={practice.busy}>
          {practice.busy ? "Starting" : "Try a practice search"}
        </button>
        {practice.waiting && <p role="status">{practice.waiting}</p>}
        {practice.error && (
          <p className="error" role="alert">
            {practice.error}
          </p>
        )}
      </section>

      {!runFile && (
        <section aria-labelledby="d1-h">
          <h2 id="d1-h" className="label">Replay the training drill</h2>
          {run === null && <p className="muted">Loading.</p>}
          {run?.state === "none" && <p>No published run yet.</p>}
          {run?.state === "unavailable" && <p>The published run could not be loaded. Reload to try again.</p>}
          {run?.state === "invalid" && <p>The published run file can't be read, so nothing is replayed and no numbers are shown.</p>}
        </section>
      )}

      {/* A run the reader refuses still reaches the replay section, which says why in plain words. */}
      <JudgeExtras run={runFile} />

      <section aria-labelledby="model-h">
        <h2 id="model-h" className="label">Cloud model</h2>
        <p>{modelLine}</p>
        {more.map((l) => (
          <p key={l}>{l}</p>
        ))}
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
      </section>

      <details className="judge-details">
        <summary>Details</summary>
        <p className="small">{sourceLine}</p>
        <p className="muted small">Measured on Chrome 157 stable, a fresh profile: before the download the model is downloadable; after a 77 s download, text and image input are available.</p>
      </details>

      {/* Only for a run the reader accepted: the replay section already speaks for every other state. */}
      {run?.state === "run" && (
        <section aria-labelledby="d5-h">
          <h2 id="d5-h" className="label">Numbers</h2>
          <p>Published run {String(run.run.runId)}.</p>
        </section>
      )}
    </main>
  );
}
