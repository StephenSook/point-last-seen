// The command post, v0: join an incident as command, then a map-first
// window with teams, the POA list and the merge lanes, all from Firestore.

import { DEFAULT_PARAMS, type EventDoc } from "@pls/engine";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ensureSignedIn, getPls, type Pls } from "../firebase";
import { subscribeEvents, type StreamedEvent } from "../data/events";
import { subscribeIncident, type IncidentView } from "../data/incident";
import { joinIncident, joinRequest } from "../data/join";
import { MapView } from "../map/MapView";
import { MergeLanes } from "./MergeLanes";
import { mergeModel, type MergeDoc } from "./mergeModel";
import { PoaRank } from "./PoaRank";
import { TeamsRail } from "./TeamsRail";
import { viewState } from "./viewState";

const DRILL_LINE = "Training drill. Nobody is missing.";

type Phase =
  | { kind: "config-error"; message: string }
  | { kind: "connecting" }
  | { kind: "join"; error: string | null }
  | { kind: "post"; incidentId: string };

function incidentFromUrl(): string | null {
  return new URLSearchParams(location.search).get("incident");
}

function asMergeDoc(e: StreamedEvent): MergeDoc {
  return {
    eventId: e.eventId,
    teamId: typeof e["teamId"] === "string" ? (e["teamId"] as string) : null,
    deviceId: String(e["deviceId"] ?? ""),
    clientTimeMs: Number(e["clientTimeMs"] ?? 0),
    serverTimeMs: e.serverTimeMs,
  };
}

function plainError(e: unknown): string {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code.endsWith("permission-denied")) return "That code did not match this incident.";
  if (code.endsWith("unavailable")) return "No connection. Try again when the link is back.";
  return "Could not join. Check the incident id and the code.";
}

export function CommandPost() {
  const [pls, setPls] = useState<Pls | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "connecting" });

  useEffect(() => {
    let p: Pls;
    try {
      p = getPls();
    } catch (e) {
      setPhase({ kind: "config-error", message: e instanceof Error ? e.message : "Missing build config." });
      return;
    }
    setPls(p);
    ensureSignedIn(p.auth)
      .then(async (user) => {
        const want = incidentFromUrl();
        const claims = (await user.getIdTokenResult()).claims;
        if (want && claims["inc"] === want && claims["role"] === "command") setPhase({ kind: "post", incidentId: want });
        else setPhase({ kind: "join", error: null });
      })
      .catch(() => setPhase({ kind: "join", error: "Could not sign in. Check the connection and reload." }));
  }, []);

  if (phase.kind === "config-error") {
    return (
      <main className="panel">
        <h1>This build has no Firebase config</h1>
        <p className="error">{phase.message}</p>
      </main>
    );
  }
  if (phase.kind === "connecting" || !pls) {
    return (
      <main className="panel">
        <p className="drill">{DRILL_LINE}</p>
        <p>Connecting.</p>
      </main>
    );
  }
  if (phase.kind === "join") {
    return <JoinPanel pls={pls} error={phase.error} onJoined={(incidentId) => setPhase({ kind: "post", incidentId })} />;
  }
  return <Post pls={pls} incidentId={phase.incidentId} />;
}

function JoinPanel({ pls, error, onJoined }: { pls: Pls; error: string | null; onJoined: (incidentId: string) => void }) {
  const [incidentId, setIncidentId] = useState(incidentFromUrl() ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(error);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    let req;
    try {
      req = joinRequest(incidentId, code, "command");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Check the incident id and the code.");
      return;
    }
    setBusy(true);
    try {
      await joinIncident(pls.functions, pls.auth, req);
      history.replaceState(null, "", `?incident=${encodeURIComponent(req.incidentId)}`);
      onJoined(req.incidentId);
    } catch (x) {
      setErr(plainError(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="panel">
      <p className="drill">{DRILL_LINE}</p>
      <h1>Open the command post</h1>
      <form onSubmit={submit}>
        <label>
          Incident id
          <input value={incidentId} onChange={(e) => setIncidentId(e.target.value)} autoComplete="off" />
        </label>
        <label>
          Join code
          <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        {err && (
          <p className="error" role="alert">
            {err}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Joining" : "Join as command"}
        </button>
      </form>
    </main>
  );
}

function Post({ pls, incidentId }: { pls: Pls; incidentId: string }) {
  const [view, setView] = useState<IncidentView | null>(null);
  const [events, setEvents] = useState<StreamedEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => subscribeIncident(pls.db, incidentId, setView, () => setReadError("Lost access to this incident's data.")), [pls, incidentId]);
  useEffect(() => subscribeEvents(pls.db, incidentId, setEvents), [pls, incidentId]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const teams = view?.teams ?? [];
  const segments = view?.segments ?? [];
  const lanes = useMemo(() => mergeModel(events.map(asMergeDoc), teams, now, view?.clockOffsets ?? {}), [events, teams, now, view]);
  const incident = view?.incident ?? null;
  const vs = useMemo(() => {
    if (!incident || typeof incident.priorVersion !== "number" || segments.length === 0 || view?.rowPrior === null || view?.rowPrior === undefined) return null;
    const prior = [...segments.map((s) => ({ segmentId: s.segmentId, priorPoa: s.priorPoa })), { segmentId: "ROW", priorPoa: view.rowPrior }];
    // Engine parameters travel with the incident (spec rule R6); the shared constants match a fresh incident.
    const params = incident.engineParams ?? DEFAULT_PARAMS;
    return viewState(prior, events as unknown as EventDoc[], incident.priorInputEventIds ?? [], params, incident.priorVersion);
  }, [incident, segments, view?.rowPrior, events]);
  const poa = vs?.result.poa ?? {};
  const rows = vs ? vs.rank.map((r) => ({ segmentId: r.segmentId, poa: r.poa })) : [];

  return (
    <div className="post">
      <header className="post-head">
        <span className="drill">{DRILL_LINE}</span>
        <span className="incident">{view?.incident?.name ?? incidentId}</span>
        <span className="code">
          <span className="label">Code</span>
          <span className="num" data-testid="convergence-code">{vs?.code ?? "----"}</span>
        </span>
      </header>
      {readError && (
        <p className="error" role="alert">
          {readError}
        </p>
      )}
      <div className="post-body">
        <TeamsRail teams={teams} activeTeamId={null} />
        <MapView segments={segments} poa={poa} />
        <aside className="rail right">
          <PoaRank rows={rows} row={vs ? (vs.result.poa["ROW"] ?? 0) : null} />
          <MergeLanes lanes={lanes} />
        </aside>
      </div>
    </div>
  );
}
