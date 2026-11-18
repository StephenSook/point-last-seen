// The command post, v0: join an incident as command, then a map-first
// window with teams, the POA list and the merge lanes, all from Firestore.

import { DEFAULT_PARAMS, placeToCheck, type Assignment, type EventDoc, type FamilyProfile, type Place, type RouteRecord } from "@pls/engine";
import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { aiClient, deviceModelInitializer, photoCloudGenerator, photoGenerator, sightingCloudGenerator, sightingTextGenerator, wordingGenerator } from "../ai/client";
import { deviceState as readDeviceState, downloadDeviceModel, type DeviceState } from "../ai/deviceModel";
import { readPhotoInCloud, readPhotoOnDevice } from "../ai/photoCues";
import { bytesToBase64, loadPhotos, loadPhotosOrError, photoReadingDoc, savePhotoReading, uploadPhoto } from "../data/photos";
import { toStandardJpeg } from "../photos/jpeg";
import { PhotoTray, type TrayPhoto } from "../photos/PhotoTray";
import { REPLY_TIMEOUT_MS, wordPlan, type PlanDraft, type WordedPlan } from "../ai/replanWording";
import { parseRc, startRemoteConfig, type WebRc } from "../config/rc";
import { onDeviceAvailable } from "../ai/gate";
import { readSightingText, readSightingTextInCloud } from "../ai/sightingText";
import { appendEventWith, firestoreWriteDeps, retryEventWith, type WriteState } from "../data/events";
import { makeSeq } from "../data/seq";
import { buildConfirmation, buildSightingEvent, type CommandWriter, type SightingInput } from "../data/sightings";
import { beatDistances, type LatLon, segmentChoices, segmentContaining } from "../map/geo";
import { commandWarnings, profileFromDocs, subscribeProfile, writeProfile } from "../data/profile";
import { ApproachCard } from "./ApproachCard";
import { ProfileForm } from "./ProfileForm";
import { SightingForm } from "./SightingForm";
import { SightingsPanel } from "./SightingsPanel";
import { sightingCards } from "./sightingCards";
import { approveNow, localDraft, nextPlanVersion, planChange, planDocFor, planSendState, subscribeDraft, subscribePlans, writePlan } from "../data/plans";
import { ensureSignedIn, getPls, type Pls } from "../firebase";
import { subscribeEvents, type StreamedEvent } from "../data/events";
import { initialPostState, postReducer } from "./postAccess";
import { subscribeIncident } from "../data/incident";
import { joinErrorMessage, joinIncident, joinRequest } from "../data/join";
import { MapView } from "../map/MapView";
import { MergeLanes } from "./MergeLanes";
import { mergeModel, type MergeDoc } from "./mergeModel";
import { PoaRank } from "./PoaRank";
import { TeamsRail } from "./TeamsRail";
import { lastReportChange, viewState } from "./viewState";
import { ChangeBeat } from "./ChangeBeat";
import { ExtrasDock } from "../extras/ExtrasDock";
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
      setErr(joinErrorMessage(x));
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
  const { view, events, plans, profile, denied, offline } = state;
  const [now, setNow] = useState(() => Date.now());
  const [rc, setRc] = useState<WebRc>(() => parseRc({}));
  const [serverDraft, setServerDraft] = useState<PlanDraft | null>(null);
  const [newTeamIds, setNewTeamIds] = useState<ReadonlySet<string>>(new Set());
  const latestSeen = useRef<number | null | undefined>(undefined);
  const nextSeq = useRef(makeSeq()).current;
  const [adding, setAdding] = useState(false);
  const [pin, setPin] = useState<LatLon | null>(null);
  const [writes, setWrites] = useState<Record<string, { state: WriteState; doc: EventDoc }>>({});
  const [photos, setPhotos] = useState<TrayPhoto[]>([]);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [eventsSynced, setEventsSynced] = useState(false);
  // The map handed over by MapView's onReady, for the extras lane's print and export views.
  const [extrasMap, setExtrasMap] = useState<unknown>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  // One map pick at a time: a profile place, or the sighting pin while the sighting form is open.
  const [picker, setPicker] = useState<((p: LatLon) => void) | null>(null);

  const [photoError, setPhotoError] = useState<string | null>(null);
  const reloadPhotos = async () => {
    const r = await loadPhotosOrError(() => loadPhotos(pls.storage, incidentId));
    setPhotos(r.photos);
    setPhotoError(r.error);
  };
  useEffect(() => {
    if (!denied) void reloadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pls, incidentId, denied]);

  useEffect(() => startRemoteConfig(pls.app, setRc), [pls]);

  // On a denial the reducer clears the data and `denied` stops both listeners for good.
  useEffect(() => {
    if (denied) return;
    const failed = (error: unknown) => dispatch({ type: "failed", error });
    const stopIncident = subscribeIncident(pls.db, incidentId, (v) => dispatch({ type: "view", view: v }), failed);
    const stopEvents = subscribeEvents(
      pls.db,
      incidentId,
      (e, fromCache) => {
        dispatch({ type: "events", events: e });
        if (!fromCache) setEventsSynced(true);
      },
      failed,
    );
    const stopPlans = subscribePlans(pls.db, incidentId, (p, pending) => dispatch({ type: "plans", plans: p, pending }), failed);
    const stopProfile = subscribeProfile(pls.db, incidentId, (docs) => dispatch({ type: "profile", profile: docs }), failed);
    return () => {
      stopIncident();
      stopEvents();
      stopPlans();
      stopProfile();
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
  const engineIn = useMemo(() => {
    if (!incident || typeof incident.priorVersion !== "number" || segments.length === 0 || view?.rowPrior === null || view?.rowPrior === undefined) return null;
    const prior = [...segments.map((s) => ({ segmentId: s.segmentId, priorPoa: s.priorPoa })), { segmentId: "ROW", priorPoa: view.rowPrior }];
    // Engine parameters travel with the incident (spec rule R6); the shared constants match a fresh incident.
    return { prior, params: incident.engineParams ?? DEFAULT_PARAMS, priorIds: incident.priorInputEventIds ?? [], priorVersion: incident.priorVersion };
  }, [incident, segments, view?.rowPrior]);
  const vs = useMemo(
    () => (engineIn ? viewState(engineIn.prior, events as unknown as EventDoc[], engineIn.priorIds, engineIn.params, engineIn.priorVersion) : null),
    [engineIn, events],
  );
  const last = useMemo(() => (engineIn ? lastReportChange(engineIn.prior, events as unknown as EventDoc[], engineIn.priorIds, engineIn.params) : null), [engineIn, events]);
  const [holding, setHolding] = useState(false);
  const beat = useMemo(() => {
    // Until the server has answered, the events may be a partial cached set: no beat yet.
    if (!last || !eventsSynced) return null;
    const cause = (events as unknown as EventDoc[]).find((e) => e.eventId === last.causeEventId);
    const origin = cause?.position ? { lat: cause.position.lat, lon: cause.position.lon } : null;
    const distanceM = beatDistances(origin, last.change.changed.map((c) => c.segmentId), segments);
    return { key: last.causeEventId, before: last.before, change: last.change, distanceM };
  }, [last, events, segments, eventsSynced]);
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
  // Events this browser writes: create-only, never awaited; the listener shows them at once.
  const writer = (): CommandWriter => {
    const uid = pls.auth.currentUser?.uid;
    if (!uid || !incident) throw new Error("not ready");
    return { incidentId, uid, seq: nextSeq(), clientTimeMs: Date.now(), priorVersion: incident.priorVersion, segments };
  };
  const write = (doc: EventDoc) => {
    const deps = firestoreWriteDeps(pls.db, (id, st) => setWrites((w) => ({ ...w, [id]: { state: st, doc } })));
    appendEventWith(doc, deps);
  };
  const retry = (doc: EventDoc) => retryEventWith(doc, firestoreWriteDeps(pls.db, (id, st) => setWrites((w) => ({ ...w, [id]: { state: st, doc } }))));
  const rejected = Object.values(writes).filter((w) => w.state === "rejected");
  const saveSighting = async (input: SightingInput) => {
    write(buildSightingEvent(input, writer()));
    setPin(null);
  };
  const cards = useMemo(() => sightingCards(events as unknown as EventDoc[]), [events]);
  const ai = () => aiClient(pls.app, rc.useLimitedUseTokens);
  const readNote = (text: string) => readSightingText(text, { available: (o) => onDeviceAvailable(o), generate: (t) => sightingTextGenerator(ai())(t) });
  const readNoteInCloud = (text: string) => {
    const uid = pls.auth.currentUser?.uid ?? "";
    return readSightingTextInCloud(text, uid ? { byUid: uid, atMs: Date.now() } : null, { generateCloud: (t) => sightingCloudGenerator(ai(), rc.cloudModelWeb)(t), killCloud: rc.killCloud });
  };

  const photoRoute = (path: "on_device" | "cloud", latencyMs: number): RouteRecord => ({
    platform: "web",
    path,
    stage: "sdk",
    model: path === "on_device" ? "chrome-built-in" : rc.cloudModelWeb,
    reason: path === "on_device" ? "sdk_only_on_device" : "consented_cloud_read",
    latencyMs,
    sdkReported: true,
    blocked: null,
    decidedAtMs: Date.now(),
  });
  const readPhotoHere = async (p: TrayPhoto) => {
    const t0 = Date.now();
    const r = await readPhotoOnDevice(bytesToBase64(p.bytes), { available: (o) => onDeviceAvailable(o), generate: (b) => photoGenerator(ai())(b), timeoutMs: 30_000 });
    return "cues" in r ? { cues: r.cues, route: photoRoute("on_device", Date.now() - t0) } : r;
  };
  const readPhotoCloud = async (p: TrayPhoto) => {
    const t0 = Date.now();
    const uid = pls.auth.currentUser?.uid ?? "";
    const r = await readPhotoInCloud(bytesToBase64(p.bytes), uid ? { byUid: uid, atMs: Date.now() } : null, {
      generateCloud: (b) => photoCloudGenerator(ai(), rc.cloudModelWeb)(b),
      killCloud: rc.killCloud,
    });
    return "cues" in r ? { cues: r.cues, route: photoRoute("cloud", Date.now() - t0) } : r;
  };
  const checkDevice = async () => {
    let st = await readDeviceState();
    if (st === "downloadable") {
      setDownloadPct(0);
      try {
        await downloadDeviceModel(setDownloadPct, deviceModelInitializer(ai()));
      } catch {
        // the state line below says what the browser can do
      }
      setDownloadPct(null);
      st = await readDeviceState();
    }
    setDevice(st);
  };
  const addPhotoFiles = async (files: File[]) => {
    let skipped = 0;
    for (const f of files) {
      try {
        const jpeg = await toStandardJpeg(f);
        if (jpeg.length <= 2 * 1024 * 1024) await uploadPhoto(pls.storage, incidentId, jpeg);
        else skipped++;
      } catch {
        skipped++;
      }
    }
    await reloadPhotos();
    if (skipped > 0) setPhotoError(skipped === 1 ? "One photo was not added." : `${skipped} photos were not added.`);
  };

  const formProfile: FamilyProfile = useMemo(() => profileFromDocs(profile?.shared, profile?.command), [profile]);
  const saveProfile = (p: FamilyProfile) => writeProfile(pls.db, incidentId, p);
  const shareDestination = async (place: Place) => {
    const w = writer();
    write(placeToCheck(place, { incidentId: w.incidentId, uid: w.uid, seq: w.seq, clientTimeMs: w.clientTimeMs, priorVersion: w.priorVersion }));
  };
  const pickPlace = (_list: string, _i: number, done: (p: LatLon) => void) =>
    setPicker(() => (p: LatLon) => {
      done(p);
      setPicker(null);
    });

  // Approve never waits for the server: the plan shows at once from the local snapshot
  // (sending), then sent when the server has it; a refusal comes back through `ack`.
  const approve = (worded: WordedPlan): { version: number; ack: Promise<void> } => {
    const uid = pls.auth.currentUser?.uid;
    if (!draft || !uid) throw new Error("not ready");
    return approveNow({ plans: state.plans, draft, wording: worded.wording, route: worded.route, uid, nowMs: Date.now(), write: (plan) => writePlan(pls.db, incidentId, plan) });
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
        <ExtrasDock incidentId={incidentId} state={state} vs={vs} map={extrasMap} />
      </header>
      {offline && (
        <p className="error" role="status">
          No connection. Showing the last data received.
        </p>
      )}
      <div className="post-body">
        <TeamsRail teams={teams} activeTeamId={null} assignments={assignments} newTeamIds={newTeamIds} />
        <MapView onReady={setExtrasMap} basemapUrl={incident?.gridId ? `/tiles/${incident.gridId}.pmtiles` : null} segments={segments} poa={holding && last ? last.before : poa} moved={holding || !last ? undefined : last.change.changed} beat={beat} attribution={incident?.gridAttribution} onMapClick={picker ?? (adding ? setPin : undefined)} pin={adding ? pin : null} />
        <aside className="rail right">
          {rc.killCloud && (
            <p className="error" role="status">
              Cloud paused by command. Plans use fixed wording.
            </p>
          )}
          {rejected.length > 0 && (
            <div className="error" role="alert">
              <p>{rejected.length === 1 ? "One report was not delivered." : `${rejected.length} reports were not delivered.`}</p>
              <button type="button" className="btn ghost" onClick={() => rejected.forEach((w) => retry(w.doc))}>
                Retry
              </button>
            </div>
          )}
          {profile?.shared && <ApproachCard shared={profile.shared} photoOld={commandWarnings(formProfile, now).includes("photo_old")} />}
          {editingProfile ? (
            <ProfileForm initial={formProfile} onSave={saveProfile} onPickPlace={pickPlace} onPlaceToCheck={shareDestination} onClose={() => setEditingProfile(false)} />
          ) : (
            <button type="button" className="btn ghost" onClick={() => setEditingProfile(true)} disabled={!incident}>
              {profile?.shared ? "Edit profile" : "Add profile"}
            </button>
          )}
          {picker && <p role="status">Click the map to place it.</p>}
          {adding ? (
            <SightingForm
              place={pin}
              placeSegmentId={pin ? segmentContaining(pin, segments) : null}
              choices={segmentChoices(segments)}
              onPlace={setPin}
              onSave={saveSighting}
              readNote={readNote}
              readNoteInCloud={readNoteInCloud}
              onClose={() => {
                setAdding(false);
                setPin(null);
              }}
            />
          ) : (
            <button type="button" className="btn" onClick={() => setAdding(true)} disabled={!incident}>
              Add sighting
            </button>
          )}
          <SightingsPanel
            cards={cards}
            segmentOf={(c) => (c.sighting.position ? segmentContaining(c.sighting.position, segments) : null)}
            onDecide={async (c, d) => write(buildConfirmation(c.sighting, d, writer()))}
          />
          <ChangeBeat change={last?.change ?? null} holding={holding} onHold={setHolding} />
          <WhatChanged draft={draft} draftSource={draft && serverDraft === draft ? "server" : "local"} onSuggest={suggest} onApprove={approve} planStatus={(v) => planSendState(v, state.plans, state.pendingPlans ?? [])} />
          <PoaRank rows={rows} row={vs ? (vs.result.poa["ROW"] ?? 0) : null} />
          <PhotoTray
            photos={photos}
            loadError={photoError}
            deviceState={device}
            onCheckDevice={checkDevice}
            downloadPct={downloadPct}
            onAddFiles={addPhotoFiles}
            readOnLaptop={readPhotoHere}
            readInCloud={readPhotoCloud}
            onDecide={(p, cues, route, d) => savePhotoReading(pls.db, incidentId, photoReadingDoc(incidentId, p.sha256, cues, route, d, Date.now()))}
          />
          <MergeLanes lanes={lanes} />
        </aside>
      </div>
    </div>
  );
}
