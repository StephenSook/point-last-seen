// The command post, v0: join an incident as command, then a map-first
// window with teams, the POA list and the merge lanes, all from Firestore.

import { DEFAULT_PARAMS, nearestWalkerStation, placeToCheck, projectWalkerPoint, type Assignment, type EventDoc, type FamilyProfile, type Place, type PriorLayers, type RouteRecord, type Terrain } from "@pls/engine";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { aiClient, clipCloudGenerator, deviceModelInitializer, frameCheckGenerator, photoTemplateGenerator, photoGenerator, sightingTemplateGenerator, sightingTextGenerator, wordingGenerator } from "../ai/client";
import { deviceState as readDeviceState, downloadDeviceModel, type DeviceState } from "../ai/deviceModel";
import { readPhotoOnDevice } from "../ai/photoCues";
import { bytesToBase64, confirmPhotoConsent, loadPhotos, loadPhotosOrError, photoReadingDoc, photoStillStored, saveIfStillStored, savePhotoReading, sha256Hex, uploadPhoto } from "../data/photos";
import { clipReadDeps, readClip, type ClipReadOutcome } from "../ai/clipRead";
import { firestoreClipIo } from "../data/clips";
import { countMedia, deleteMediaNow } from "../data/media";
import { travelBearingFromInputs } from "../data/cameraSighting";
import { cameraConfirmWrites, familyCameraConfirmWrites } from "../prior/cameraPrior";
import { CameraClipPanel, type ClipRead } from "../camera/CameraClipPanel";
import type { ClipIntakeInput, ReadHow } from "../camera/ClipIntake";
import { FRAME_OPTS } from "../ai/frameCheck";
import { jpegAt, sampleFrames } from "../camera/frames";
import { triageClip, triageRoute, type TriageResult } from "../camera/triage";
import { toStandardJpeg } from "../photos/jpeg";
import { PhotoTray, type TrayPhoto } from "../photos/PhotoTray";
import { revokedAtMs, usePhotoTray } from "../photos/usePhotoTray";
import { readStoredPhotoInCloud } from "../photos/cloudRead";
import { REPLY_TIMEOUT_MS, wordPlan, type PlanDraft, type WordedPlan } from "../ai/replanWording";
import { parseRc, startRemoteConfig, type WebRc } from "../config/rc";
import { onDeviceAvailable } from "../ai/gate";
import { readSightingText, readSightingTextInCloud } from "../ai/sightingText";
import { appendEventWith, firestoreWriteDeps, retryEventWith, type WriteState } from "../data/events";
import { makeSeq } from "../data/seq";
import { buildConfirmation, buildSightingEvent, type CommandWriter, type SightingInput, placeFamilySighting } from "../data/sightings";
import { beatDistances, type LatLon, segmentChoices, segmentContaining } from "../map/geo";
import { commandWarnings, profileFromDocs, subscribeProfile, writeProfile } from "../data/profile";
import { ApproachCard } from "./ApproachCard";
import { ProfileForm } from "./ProfileForm";
import { SightingForm } from "./SightingForm";
import { SightingsPanel } from "./SightingsPanel";
import { sightingCards } from "./sightingCards";
import { PURPOSE_LINE } from "../purpose";
import { approveNow, localDraft, nextPlanVersion, planChange, planDocFor, planSendState, subscribePlans, unreadablePlanLine, writePlan } from "../data/plans";
import { ensureSignedIn, getPls, type Pls } from "../firebase";
import { subscribeEvents, type StreamedEvent } from "../data/events";
import { initialPostState, postReducer } from "./postAccess";
import { subscribeIncident } from "../data/incident";
import { joinErrorMessage, joinIncident, joinRequest, signInErrorMessage } from "../data/join";
import { MapView } from "../map/MapView";
import { MergeLanes } from "./MergeLanes";
import { mergeModel, type MergeDoc } from "./mergeModel";
import { PoaRank } from "./PoaRank";
import { TeamsRail } from "./TeamsRail";
import { lastReportChange, viewState } from "./viewState";
import { ChangeBeat } from "./ChangeBeat";
import { perfSink } from "../telemetry/perf";
import { recordInference } from "../telemetry/trace";
import { LayerSwitches } from "./LayerSwitches";
import { PriorSwitch, WALKER_SENTENCE, type PriorChoice } from "./PriorSwitch";
import { loadRouteGraph, runAgainstVersion, walkerPriorWrites, type GraphLoad } from "../prior/walkerPrior";
import { runWalkersInWorker } from "../workers/runWalkers";
import { walkerTracksToLngLat } from "../motion/walkerTracks";
import type { Track } from "../motion/walkerCanvas";
import { priorWrites, rebuildPrior } from "../prior/rebuild";
import { writePrior } from "../prior/write";
import { ExtrasDock } from "../extras/ExtrasDock";
import { WhatChanged } from "./WhatChanged";
import { FamilyChannel } from "./FamilyChannel";
import { askFamily, searchStateOf, subscribeQuestions, tellFamily, type FamilyQuestion } from "../data/familyQuestions";

const DRILL_LINE = "Training drill. Nobody is missing.";

type Phase =
  | { kind: "config-error"; message: string }
  | { kind: "connecting" }
  | { kind: "signin-failed"; message: string }
  | { kind: "join" }
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

  // A failed sign-in keeps the join form disabled (a join with no user can only fail, and its
  // error would blame the code) and offers Try again, which runs this again.
  const signIn = useCallback((p: Pls) => {
    setPhase({ kind: "connecting" });
    ensureSignedIn(p.auth)
      .then(async (user) => {
        const want = incidentFromUrl();
        const claims = (await user.getIdTokenResult()).claims;
        if (want && claims["inc"] === want && claims["role"] === "command") setPhase({ kind: "post", incidentId: want });
        else setPhase({ kind: "join" });
      })
      .catch((e: unknown) => setPhase({ kind: "signin-failed", message: signInErrorMessage(e) }));
  }, []);

  useEffect(() => {
    let p: Pls;
    try {
      p = getPls();
    } catch (e) {
      setPhase({ kind: "config-error", message: e instanceof Error ? e.message : "Missing build config." });
      return;
    }
    setPls(p);
    signIn(p);
  }, [signIn]);

  if (phase.kind === "config-error") {
    return (
      <main className="panel">
        <h1>This build has no Firebase config</h1>
        <p className="error">{phase.message}</p>
      </main>
    );
  }
  // While connecting, the join form is already there with its button disabled, so the page
  // does not jump when the connection is ready (it stays the same element, keeping typed text).
  if (phase.kind === "signin-failed" && pls) {
    return <JoinPanel pls={null} signIn={{ error: phase.message, retry: () => signIn(pls) }} onJoined={() => {}} />;
  }
  if (phase.kind === "connecting" || phase.kind === "signin-failed" || !pls) {
    return <JoinPanel pls={null} onJoined={() => {}} />;
  }
  if (phase.kind === "join") {
    return <JoinPanel pls={pls} onJoined={(incidentId) => setPhase({ kind: "post", incidentId })} />;
  }
  return <Post pls={pls} incidentId={phase.incidentId} />;
}

type JoinPanelProps = {
  pls: Pls | null;
  /** Set when the anonymous sign-in failed: its sentence and a retry. */
  signIn?: { error: string; retry: () => void };
  onJoined: (incidentId: string) => void;
};

function JoinPanel({ pls, signIn, onJoined }: JoinPanelProps) {
  const [incidentId, setIncidentId] = useState(incidentFromUrl() ?? "");
  // The incident a shared link named, kept as it was when the page opened.
  const [linked] = useState(() => incidentFromUrl());
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pls) return;
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
      <p className="wordmark">Point Last Seen</p>
      <p data-testid="purpose">{PURPOSE_LINE}</p>
      <p>
        <a href="/judge">Judges: start here</a>
      </p>
      <p className="drill">{DRILL_LINE}</p>
      <h1>Open the command post</h1>
      {linked && (
        <p className="muted" data-testid="link-note">
          This link names incident {linked}. Enter its join code to open it: a link alone never opens an incident, so a forwarded link does not give anyone access.
        </p>
      )}
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
        {signIn && (
          <div className="row">
            <p className="error" role="alert">
              {signIn.error}
            </p>
            <button type="button" className="btn ghost" onClick={signIn.retry}>
              Try again
            </button>
          </div>
        )}
        <button type="submit" disabled={busy || !pls}>
          {!pls && !signIn ? "Connecting" : busy ? "Joining" : "Join as command"}
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
  // The latest activated Remote Config, for checks inside a read that started on an earlier render.
  const rcNow = useRef(rc);
  rcNow.current = rc;
  const [newTeamIds, setNewTeamIds] = useState<ReadonlySet<string>>(new Set());
  const latestSeen = useRef<number | null | undefined>(undefined);
  const nextSeq = useRef(makeSeq()).current;
  const [adding, setAdding] = useState(false);
  const [clipping, setClipping] = useState(false);
  const [pin, setPin] = useState<LatLon | null>(null);
  const [writes, setWrites] = useState<Record<string, { state: WriteState; doc: EventDoc }>>({});
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [eventsSynced, setEventsSynced] = useState(false);
  // The map handed over by MapView's onReady, for the extras lane's print and export views.
  const [extrasMap, setExtrasMap] = useState<unknown>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  // One map pick at a time: a profile place, or the sighting pin while the sighting form is open.
  const [picker, setPicker] = useState<((p: LatLon) => void) | null>(null);
  // Camera places command picked for family camera clips that came without one, until each is confirmed.
  const [placedCameras, setPlacedCameras] = useState<Record<string, LatLon>>({});
  // Questions to the family and their answers. A refused read hides the section and never ends the post's
  // access: the channel has its own rules, and the rest of the post works without it.
  const [questions, setQuestions] = useState<FamilyQuestion[] | null>(null);
  useEffect(() => {
    if (denied) return;
    return subscribeQuestions(pls.db, incidentId, setQuestions, () => setQuestions(null));
  }, [pls, incidentId, denied]);

  // The photo tray: loaded from Storage, emptied and reloaded on every delete, from this seat or (through the
  // incident's mediaRevokedAt, set by the server before it deletes anything) from any other seat.
  const loadTray = useCallback(() => loadPhotosOrError(() => loadPhotos(pls.storage, incidentId)), [pls, incidentId]);
  const tray = usePhotoTray(loadTray, revokedAtMs((view?.incident as { mediaRevokedAt?: unknown } | null)?.mediaRevokedAt), !denied);
  const photos = tray.photos;
  const reloadPhotos = tray.reload;
  const setPhotoError = tray.setError;

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
    const stopPlans = subscribePlans(pls.db, incidentId, (p, pending, fromServer, unreadable) => dispatch({ type: "plans", plans: p, pending, fromServer, unreadable }), failed);
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
  // The latest incident, for checks after an await that began on an earlier render.
  const incidentNow = useRef(incident);
  incidentNow.current = incident;
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
    return { key: last.causeEventId, before: last.before, change: last.change, distanceM, origin };
  }, [last, events, segments, eventsSynced]);
  const poa = vs?.result.poa ?? {};
  const rows = vs ? vs.rank.map((r) => ({ segmentId: r.segmentId, poa: r.poa })) : [];

  const latestPlan = plans.length > 0 ? plans[plans.length - 1]! : null;
  const assignments = useMemo(() => Object.fromEntries((latestPlan?.assignments ?? []).map((a: Assignment) => [a.teamId, a])), [latestPlan]);
  // The draft for this event set: the engine's team assignment, computed on this laptop.
  const draft: PlanDraft | null = useMemo(() => {
    if (!vs || !incident || teams.length === 0) return null;
    return localDraft(vs.hash, incident.priorVersion, vs.rank, teams.map((t) => t.teamId), latestPlan?.assignments ?? []);
  }, [vs, incident, teams, latestPlan]);

  // One hybrid-inference trace per model call (path, reason, platform, stage and latency only).
  const sink = useMemo(() => {
    try {
      return perfSink(pls.app);
    } catch {
      return null;
    }
  }, [pls]);
  const traced = (route: RouteRecord) => {
    if (sink) recordInference(route, sink);
  };
  const suggest = (): Promise<WordedPlan> => {
    if (!draft) return Promise.reject(new Error("no draft"));
    const generate = wordingGenerator(aiClient(pls.app, rc.useLimitedUseTokens), rc.cloudModelWeb);
    return wordPlan(draft, { generate, now: () => Date.now(), timeoutMs: REPLY_TIMEOUT_MS, model: rc.cloudModelWeb, killCloud: rc.killCloud }).then((w) => {
      // A model asked whose answer was not used is traced on its own, so it is never hidden behind the fixed wording.
      if (w.attempt) traced(w.attempt.route);
      traced(w.route);
      return w;
    });
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
  const readNote = async (text: string) => {
    const t0 = Date.now();
    const r = await readSightingText(text, { available: (o) => onDeviceAvailable(o), generate: (t) => sightingTextGenerator(ai())(t) });
    if ("reading" in r) traced(photoRoute("on_device", Date.now() - t0));
    return r;
  };
  const readNoteInCloud = async (text: string) => {
    const t0 = Date.now();
    const uid = pls.auth.currentUser?.uid ?? "";
    const r = await readSightingTextInCloud(text, uid ? { byUid: uid, atMs: Date.now() } : null, { generateCloud: (t) => sightingTemplateGenerator(ai(), rc.sightingTemplateId)(t), killCloud: rc.killCloud });
    if ("reading" in r) traced(photoRoute("cloud", Date.now() - t0));
    return r;
  };

  // The route of a photo or sighting-note read (strict on-device, or a consented cloud read).
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
    if (!("cues" in r)) return r;
    const route = photoRoute("on_device", Date.now() - t0);
    traced(route);
    return { cues: r.cues, route };
  };
  const readPhotoCloud = async (p: TrayPhoto) => {
    // Every check before the bytes leave (the bytes' own hash, the family's consent from the server, the file
    // still stored) lives in readStoredPhotoInCloud; without all three the photo stays on this laptop.
    const t0 = Date.now();
    const r = await readStoredPhotoInCloud(p, {
      confirmConsent: (sha) => confirmPhotoConsent(pls.db, incidentId, sha),
      stillStored: (sha) => photoStillStored(pls.storage, incidentId, sha),
      generateCloud: (b) => photoTemplateGenerator(ai(), rc.photoTemplateId)(b),
      killCloud: rc.killCloud,
    });
    if (!("cues" in r)) return r;
    const route = photoRoute("cloud", Date.now() - t0);
    traced(route);
    return { cues: r.cues, route };
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
  const [profileError, setProfileError] = useState<string | null>(null);
  // The site's route graph for the walker prior, beside its basemap.
  const [graph, setGraph] = useState<GraphLoad | null>(null);
  const [flow, setFlow] = useState<{ key: string; tracks: Track[] } | null>(null);
  useEffect(() => {
    if (!incident?.gridId) return;
    let live = true;
    void loadRouteGraph(`/tiles/${incident.gridId}.graph.json`).then((g) => live && setGraph(g));
    return () => {
      live = false;
    };
  }, [incident?.gridId]);
  const places = (events as unknown as EventDoc[]).filter((e) => e.type === "destination" && e.position);
  // The direction of travel comes from a confirmed camera sighting among the prior's inputs.
  const bearing = useMemo(() => travelBearingFromInputs(events as unknown as EventDoc[], incident?.priorInputEventIds ?? []), [events, incident?.priorInputEventIds]);
  const applyModel = async (choice: PriorChoice) => {
    if (!incident?.ipp || !incident.gridId) throw new Error("This incident has no start point or grid yet.");
    const terrain = incident.terrain ?? "temperate_flat";
    if (choice.model === "rings") {
      const layers = incident.priorLayers ?? { linear: false, wedge: false };
      const rebuilt = rebuildPrior(segments, { gridId: incident.gridId, attribution: incident.gridAttribution ?? "", ipp: incident.ipp, terrain }, layers, bearing, incident.engineParams ?? DEFAULT_PARAMS);
      const w = priorWrites(rebuilt, incident, layers, terrain);
      const out = { ...w, incident: { ...w.incident, priorModel: "rings" as const } };
      return { version: out.incident.priorVersion, ack: writePrior(pls.db, incidentId, out), run: null };
    }
    if (graph?.state !== "ok") throw new Error("Walkers need this site's route graph.");
    const g = graph.graph;
    if (!g.projection) throw new Error("This site's route graph has no projection.");
    const start = nearestWalkerStation(g, projectWalkerPoint(g.projection, incident.ipp));
    if (start === null) throw new Error("No route near the start point.");
    const seed = incident.priorSeed ?? 20261122;
    const used = choice.attract ? places : [];
    // Written only if no other rebuild landed while the walkers ran.
    const { result, elapsedMs } = await runAgainstVersion(incident.priorVersion, () => incidentNow.current?.priorVersion ?? -1, () => runWalkersInWorker({
      graph: g,
      grid: { segments: segments.map((s) => ({ segmentId: s.segmentId, geometry: (s.geometry.type === "Polygon" ? s.geometry : { type: "Polygon", coordinates: s.geometry.coordinates[0]! }) as never })) },
      opts: { seed, startStationId: start, travelUnit: null, terrain, sampleTracks: 300, attractors: used.map((e) => projectWalkerPoint(g.projection!, e.position!)), lowMobility: choice.lowMobility },
    }));
    const w = walkerPriorWrites(result, incident, { seed, attractorEventIds: used.map((e) => e.eventId) });
    setFlow({ key: `walkers-${w.incident.priorVersion}`, tracks: walkerTracksToLngLat(result.sampleTracks, g, 2000) });
    return { version: w.incident.priorVersion, ack: writePrior(pls.db, incidentId, w), run: { n: result.n, elapsedMs } };
  };
  // A layer or terrain change rebuilds the prior for every seat; the write is not awaited.
  const applyPrior = (layers: PriorLayers, terrain: Terrain): { version: number; ack: Promise<void> } => {
    if (!incident?.ipp || !incident.gridId) throw new Error("This incident has no start point or grid yet.");
    const rebuilt = rebuildPrior(segments, { gridId: incident.gridId, attribution: incident.gridAttribution ?? "", ipp: incident.ipp, terrain }, layers, bearing, incident.engineParams ?? DEFAULT_PARAMS);
    const w = priorWrites(rebuilt, incident, layers, terrain);
    return { version: w.incident.priorVersion, ack: writePrior(pls.db, incidentId, w) };
  };
  // A camera clip: the three required consents are bound to the clip's SHA-256 before readClip
  // checks them; a fresh reading is traced like any other model call.
  const readCameraClip = async (input: ClipIntakeInput, how: ReadHow = {}): Promise<ClipReadOutcome> => {
    const uid = pls.auth.currentUser?.uid;
    if (!uid) return { kind: "failed" };
    const at = Date.now();
    const mark = (given: boolean) => (given ? { byUid: uid, atMs: at } : null);
    const sha = await sha256Hex(input.bytes);
    const o = await readClip(
      {
        incidentId, bytes: input.bytes, mimeType: input.mimeType, durationS: input.durationS, clipStartMs: input.clipStartMs,
        clockConfirmed: input.clockConfirmed, cameraFacingDeg: input.cameraFacingDeg,
        consent: { clipSha256: sha, personInClip: mark(input.consents.personInClip), footageOwner: mark(input.consents.footageOwner), cloudProcessing: mark(input.consents.cloudProcessing), publicUse: mark(input.consents.publicUse) },
        killCloud: () => rcNow.current.killCloud, model: rc.cloudModelWeb, uid, window: how.window, reason: how.reason, retry: how.retry, stillCurrent: how.stillCurrent,
      },
      clipReadDeps(firestoreClipIo(pls.db, pls.storage, incidentId), clipCloudGenerator(ai(), rc.cloudModelWeb)),
    );
    if (o.kind === "read" && !o.cached && o.route) traced(o.route);
    return o;
  };
  // On-device triage (P-39): only with this laptop's model (the gate), frames decoded here; a
  // result that sends nothing is traced (never stored). Unmeasured on a real built-in model.
  const triageCameraClip = async (clip: Blob): Promise<TriageResult> => {
    const t = await triageClip({
      available: () => onDeviceAvailable(FRAME_OPTS),
      sample: () => sampleFrames(clip),
      frameJpeg: (at) => jpegAt(clip, at),
      checkFrame: (jpeg) => frameCheckGenerator(ai())(jpeg),
      now: () => Date.now(),
    });
    const route = triageRoute(t, Date.now());
    if (route) traced(route);
    return t;
  };
  // Confirm: the camera sighting and its confirmation (create-only, not awaited), then one batch
  // that rebuilds the ring prior from the camera with the wedge on and the sighting as an input.
  const confirmCameraClip = (o: ClipRead, input: ClipIntakeInput): { version: number; ack: Promise<void> } => {
    if (!incident?.ipp || !incident.gridId) throw new Error("This incident has no start point or grid yet.");
    // Everything is built first; if any part cannot be built, nothing is written.
    const { events: built, prior } = cameraConfirmWrites(
      { sha256: o.sha256, reading: o.reading, route: o.route, clipStartMs: input.clipStartMs, clockConfirmed: input.clockConfirmed, cameraFacingDeg: input.cameraFacingDeg, camera: input.camera },
      [writer(), writer()],
      segments,
      { gridId: incident.gridId, gridAttribution: incident.gridAttribution, ipp: incident.ipp, terrain: incident.terrain, priorLayers: incident.priorLayers, priorVersion: incident.priorVersion, priorInputEventIds: incident.priorInputEventIds, engineParams: incident.engineParams },
      o.bearingDeg,
    );
    setPin(null);
    // One batch: the sighting, its confirmation and the prior land together or not at all.
    return { version: prior.incident.priorVersion, ack: writePrior(pls.db, incidentId, prior, built) };
  };
  const saveProfile = (p: FamilyProfile, opened: FamilyProfile) => {
    setProfileError(null);
    writeProfile(pls.db, incidentId, opened, p).catch(() =>
      setProfileError("The profile was not saved. Edit it and save again."),
    );
  };
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
    return approveNow({ plans: state.plans, unreadable: state.unreadablePlans ?? [], plansLoaded: state.plansLoaded === true, draft, wording: worded.wording, route: worded.route, uid, nowMs: Date.now(), write: (plan) => writePlan(pls.db, incidentId, plan) });
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
        {/* A practice incident carries its own label ("Training drill. Practice search; nobody is missing."). */}
        <span className="drill">{incident?.drillLabel ?? DRILL_LINE}</span>
        <span className="incident">{view?.incident?.name ?? incidentId}</span>
        <span className="code">
          <span className="label">MATCH</span>
          <span className="num" data-testid="convergence-code">{vs?.code ?? "----"}</span>
        </span>
        <ExtrasDock
          incidentId={incidentId}
          state={state}
          vs={vs}
          map={extrasMap}
          deleteMedia={{
            count: () => countMedia(pls.storage, pls.db, incidentId),
            run: async () => {
              try {
                return await deleteMediaNow(pls.functions, incidentId);
              } finally {
                // Whatever the server answered, drop this seat's copies and read what is stored now.
                tray.revoke();
              }
            },
          }}
        />
      </header>
      {offline && (
        <p className="error" role="status">
          No connection. Showing the last data received.
        </p>
      )}
      {unreadablePlanLine(state.unreadablePlans ?? []) && (
        <p className="error" role="status" data-testid="unreadable-plans">
          {unreadablePlanLine(state.unreadablePlans ?? [])}
        </p>
      )}
      <div className="post-body">
        <TeamsRail teams={teams} activeTeamId={null} assignments={assignments} newTeamIds={newTeamIds} />
        <MapView walkers={flow} note={incident?.priorModel === "walkers" ? WALKER_SENTENCE : undefined} ripple={incident?.ipp ? { key: `prior-${incident.priorVersion}`, origin: incident.ipp } : null} onReady={setExtrasMap} basemapUrl={incident?.gridId ? `/tiles/${incident.gridId}.pmtiles` : null} segments={segments} poa={holding && last ? last.before : poa} moved={holding || !last ? undefined : last.change.changed} beat={beat} attribution={incident?.gridAttribution} onMapClick={picker ?? (adding || clipping ? setPin : undefined)} pin={adding || clipping ? pin : null} />
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
          {profileError && (
            <p className="error" role="alert">
              {profileError}
            </p>
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
            <button type="button" className="btn" onClick={() => setAdding(true)} disabled={!incident || clipping}>
              Add sighting
            </button>
          )}
          {clipping ? (
            <CameraClipPanel
              revocation={tray.epoch}
              camera={pin}
              cameraSegmentId={pin ? segmentContaining(pin, segments) : null}
              choices={segmentChoices(segments)}
              onPlaceCamera={setPin}
              onRead={readCameraClip}
              onTriage={triageCameraClip}
              onConfirm={confirmCameraClip}
              onClose={() => {
                setClipping(false);
                setPin(null);
              }}
            />
          ) : (
            <button type="button" className="btn ghost" onClick={() => setClipping(true)} disabled={!incident || adding}>
              Add camera clip
            </button>
          )}
          <SightingsPanel
            cards={cards.map((c) => (c.camera && placedCameras[c.sighting.eventId] ? { ...c, needsPlace: false } : c))}
            segmentOf={(c) => {
              const at = c.sighting.position ?? (c.camera ? placedCameras[c.sighting.eventId] : undefined);
              return at ? segmentContaining(at, segments) : null;
            }}
            onDecide={async (c, d) => {
              if (!(c.camera && d === "confirmed")) return write(buildConfirmation(c.sighting, d, writer()));
              // A family camera clip: command's confirmation and the camera prior, in one batch.
              if (!incident?.ipp || !incident.gridId) throw new Error("This incident has no start point or grid yet.");
              const { events: built, prior } = familyCameraConfirmWrites(
                c.sighting,
                placedCameras[c.sighting.eventId] ?? null,
                writer(),
                segments,
                { gridId: incident.gridId, gridAttribution: incident.gridAttribution, ipp: incident.ipp, terrain: incident.terrain, priorLayers: incident.priorLayers, priorVersion: incident.priorVersion, priorInputEventIds: incident.priorInputEventIds, engineParams: incident.engineParams },
              );
              await writePrior(pls.db, incidentId, prior, built);
            }}
            onPlace={(c) =>
              setPicker(() => (p: LatLon) => {
                setPicker(null);
                // A family clip's camera place is kept here until Confirm; the family's event is never changed.
                if (c.camera) setPlacedCameras((m) => ({ ...m, [c.sighting.eventId]: p }));
                // A family report has no place: command writes its own placement at the picked point.
                else write(placeFamilySighting(c.sighting, p, writer()));
              })
            }
          />
          {questions && (
            <FamilyChannel
              questions={questions}
              searchState={searchStateOf(incident)}
              onAsk={(text) => askFamily(pls.db, incidentId, text, pls.auth.currentUser?.uid ?? "")}
              onTell={(next) => tellFamily(pls.db, incidentId, next)}
            />
          )}
          <ChangeBeat change={last?.change ?? null} holding={holding} onHold={setHolding} />
          <WhatChanged draft={draft} onSuggest={suggest} onApprove={approve} teams={teams} planStatus={(v) => planSendState(v, state.plans, state.pendingPlans ?? [])} />
          {/* After the first server answer a reorder comes from a new report: it lands on the beat's reorder step (1,100 ms). */}
          <PoaRank rows={rows} row={vs ? (vs.result.poa["ROW"] ?? 0) : null} reorderDelayMs={eventsSynced ? 1100 : 0} />
          {incident && segments.length > 0 && (
            <PriorSwitch
              model={incident.priorModel ?? "rings"}
              graph={graph?.state ?? "loading"}
              hasPlaces={places.length > 0}
              onApply={applyModel}
            />
          )}
          {incident && segments.length > 0 && (
            <LayerSwitches
              layers={incident.priorLayers ?? { linear: false, wedge: false }}
              terrain={incident.terrain ?? "temperate_flat"}
              rings={incident.engineParams?.rings[incident.terrain ?? "temperate_flat"]}
              hasBearing={bearing !== null}
              model={incident.priorModel ?? "rings"}
              vehicleInvolved={profile?.command?.vehicle?.involved === true}
              onApply={applyPrior}
            />
          )}
          <PhotoTray
            key={tray.epoch}
            photos={photos}
            loadError={tray.error}
            deviceState={device}
            onCheckDevice={checkDevice}
            downloadPct={downloadPct}
            onAddFiles={addPhotoFiles}
            readOnLaptop={readPhotoHere}
            readInCloud={readPhotoCloud}
            onDecide={(p, cues, route, d) =>
              // Saved only after Storage confirms the photo is still there; an unchecked answer is never queued.
              saveIfStillStored(
                () => photoStillStored(pls.storage, incidentId, p.sha256),
                () => savePhotoReading(pls.db, incidentId, photoReadingDoc(incidentId, p.sha256, cues, route, d, Date.now())),
              )
            }
          />
          <MergeLanes lanes={lanes} />
        </aside>
      </div>
    </div>
  );
}
