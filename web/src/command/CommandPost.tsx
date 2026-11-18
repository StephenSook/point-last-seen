// The command post, v0: join an incident as command, then a map-first
// window with teams, the POA list and the merge lanes, all from Firestore.

import { DEFAULT_PARAMS, type Assignment, type EventDoc } from "@pls/engine";
import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { aiClient, wordingGenerator } from "../ai/client";
import { REPLY_TIMEOUT_MS, wordPlan, type PlanDraft, type WordedPlan } from "../ai/replanWording";
import { parseRc, startRemoteConfig, type WebRc } from "../config/rc";
import { approvePlan, existingPlanVersions, localDraft, nextPlanVersion, planChange, planDocFor, subscribeDraft, subscribePlans } from "../data/plans";
import { ensureSignedIn, getPls, type Pls } from "../firebase";
import { subscribeEvents, type StreamedEvent } from "../data/events";
import { initialPostState, postReducer } from "./postAccess";
import { subscribeIncident } from "../data/incident";
import { joinIncident, joinRequest } from "../data/join";
import { MapView } from "../map/MapView";
import { MergeLanes } from "./MergeLanes";
import { mergeModel, type MergeDoc } from "./mergeModel";
import { PoaRank } from "./PoaRank";
import { TeamsRail } from "./TeamsRail";
import { viewState } from "./viewState";
import { WhatChanged } from "./WhatChanged";

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
  const [state, dispatch] = useReducer(postReducer, initialPostState);
  const { view, events, plans, denied, offline } = state;
  const [now, setNow] = useState(() => Date.now());
  const [rc, setRc] = useState<WebRc>(() => parseRc({}));
  const [serverDraft, setServerDraft] = useState<PlanDraft | null>(null);
  const [newTeamIds, setNewTeamIds] = useState<ReadonlySet<string>>(new Set());
  const latestSeen = useRef<number | null | undefined>(undefined);

  useEffect(() => startRemoteConfig(pls.app, setRc), [pls]);

  // On a denial the reducer clears the data and `denied` stops both listeners for good.
  useEffect(() => {
    if (denied) return;
    const failed = (error: unknown) => dispatch({ type: "failed", error });
    const stopIncident = subscribeIncident(pls.db, incidentId, (v) => dispatch({ type: "view", view: v }), failed);
    const stopEvents = subscribeEvents(pls.db, incidentId, (e) => dispatch({ type: "events", events: e }), failed);
    const stopPlans = subscribePlans(pls.db, incidentId, (p) => dispatch({ type: "plans", plans: p }), failed);
    return () => {
      stopIncident();
      stopEvents();
      stopPlans();
    };
  }, [pls, incidentId, denied]);

  // Teams in a plan approved while this page is open carry "New" for 10 seconds.
  useEffect(() => {
    const { latest, newTeamIds: fresh } = planChange(latestSeen.current, plans);
    latestSeen.current = latest;
    if (fresh.length === 0) return;
    setNewTeamIds(new Set(fresh));
    const t = setTimeout(() => setNewTeamIds(new Set()), 10_000);
    return () => clearTimeout(t);
  }, [plans]);
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

  const hash = vs?.hash ?? null;
  useEffect(() => {
    setServerDraft(null);
    if (denied || !hash) return;
    return subscribeDraft(pls.db, incidentId, hash, setServerDraft, (error) => dispatch({ type: "failed", error }));
  }, [pls, incidentId, hash, denied]);

  const latestPlan = plans.length > 0 ? plans[plans.length - 1]! : null;
  const assignments = useMemo(() => Object.fromEntries((latestPlan?.assignments ?? []).map((a: Assignment) => [a.teamId, a])), [latestPlan]);
  // The server's draft for this event set, or the same draft computed here when the link is down.
  const draft: PlanDraft | null = useMemo(() => {
    if (serverDraft && serverDraft.eventSetHash === hash) return serverDraft;
    if (!vs || !incident || teams.length === 0) return null;
    return localDraft(vs.hash, incident.priorVersion, vs.rank, teams.map((t) => t.teamId), latestPlan?.assignments ?? []);
  }, [serverDraft, hash, vs, incident, teams, latestPlan]);

  const suggest = (): Promise<WordedPlan> => {
    if (!draft) return Promise.reject(new Error("no draft"));
    const generate = wordingGenerator(aiClient(pls.app, rc.useLimitedUseTokens), rc.cloudModelWeb);
    return wordPlan(draft, { generate, now: () => Date.now(), timeoutMs: REPLY_TIMEOUT_MS, model: rc.cloudModelWeb, killCloud: rc.killCloud });
  };
  const approve = async (worded: WordedPlan): Promise<number> => {
    const uid = pls.auth.currentUser?.uid;
    if (!draft || !uid) throw new Error("not ready");
    const version = nextPlanVersion(await existingPlanVersions(pls.db, incidentId));
    await approvePlan(pls.db, incidentId, planDocFor(draft, worded.wording, worded.route, version, uid, Date.now()));
    return version;
  };

  if (denied) {
    return (
      <main className="panel">
        <p className="drill">{DRILL_LINE}</p>
        <h1>This browser no longer has access to the incident</h1>
        <p>Its data was cleared from the screen. Join again with a current code.</p>
        <button type="button" onClick={() => location.assign(location.pathname)}>
          Join again
        </button>
      </main>
    );
  }

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
      {offline && (
        <p className="error" role="status">
          No connection. Showing the last data received.
        </p>
      )}
      <div className="post-body">
        <TeamsRail teams={teams} activeTeamId={null} assignments={assignments} newTeamIds={newTeamIds} />
        <MapView segments={segments} poa={poa} />
        <aside className="rail right">
          {rc.killCloud && (
            <p className="error" role="status">
              Cloud paused by command. Plans use fixed wording.
            </p>
          )}
          <WhatChanged draft={draft} draftSource={draft && serverDraft === draft ? "server" : "local"} onSuggest={suggest} onApprove={approve} />
          <PoaRank rows={rows} row={vs ? (vs.result.poa["ROW"] ?? 0) : null} />
          <MergeLanes lanes={lanes} />
        </aside>
      </div>
    </div>
  );
}
