import { useEffect, useState, type JSX } from "react";
import { loadScam, missLine, SCAM_LIMITS, type ScamClip } from "./scamModel";

type Loaded = Awaited<ReturnType<typeof loadScam>>;

const LIGHTING: Record<ScamClip["lighting"], string> = { day: "Day", night_ir: "Night (infrared)", low_light: "Low light", unknown: "Unknown" };
const SOURCE_LINE = {
  staged: "Clips were staged with consenting adults. No clip is shown here.",
  stock: "Clips are licensed stock footage of actors, not a real case. No clip is shown here.",
} as const;

const secs = (s: number | null) => (s === null ? "Not read" : `${Math.abs(s)} s`);
const degs = (d: number | null) => (d === null ? "Not read" : `${Math.abs(d)} degrees`);

/** The judge page's camera read check: misses first, every verdict recomputed. No file, no section. */
export function ScamPanel({ load = loadScam }: { load?: () => Promise<Loaded> }): JSX.Element | null {
  const [state, setState] = useState<Loaded | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [load]);
  if (state === null || state.state === "none") return null;
  return (
    <section aria-labelledby="extras-scam-h" className="extras-judge-replay extras-scam">
      <h2 id="extras-scam-h" className="label">Camera read check</h2>
      {state.state === "unavailable" && <p>The camera check could not be loaded. Reload to try again.</p>}
      {state.state === "invalid" && <p data-testid="scam-refused">The camera check file was not used. {state.reason}</p>}
      {state.state === "result" && <Result r={state.result} />}
    </section>
  );
}

function Result({ r }: { r: Extract<Loaded, { state: "result" }>["result"] }) {
  const misses = r.clips.filter((c) => !c.pass);
  return (
    <>
      <p className="extras-scam-headline">{`${r.passed} of ${r.n} ${r.clipSource === "staged" ? "staged" : "stock"} clips passed.`}</p>
      <p>{`This is a go or no-go gate, not an accuracy claim (n = ${r.n}).`}</p>
      {!r.gatePassed && <p data-testid="scam-gate-failed">The camera read did not pass its gate. It is not in this build.</p>}
      {misses.length > 0 && (
        <ul className="extras-scam-misses" aria-label="Misses">
          {misses.map((c) => <li key={c.id}>{missLine(c)}</li>)}
        </ul>
      )}
      <table className="extras-cube-table">
        <caption>{`Every clip. Limits: last-seen time within ${SCAM_LIMITS.timeS} s, direction within ${SCAM_LIMITS.bearingDeg} degrees.`}</caption>
        <thead><tr><th scope="col">Clip</th><th scope="col">Lighting</th><th scope="col">Time error</th><th scope="col">Direction error</th><th scope="col">Result</th></tr></thead>
        <tbody>
          {r.clips.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.id}</th>
              <td>{LIGHTING[c.lighting]}</td>
              <td className="num">{secs(c.timeErrorS)}</td>
              <td className="num">{degs(c.bearingErrorDeg)}</td>
              <td>{c.pass ? "Pass" : "Miss"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{SOURCE_LINE[r.clipSource]}</p>
    </>
  );
}
