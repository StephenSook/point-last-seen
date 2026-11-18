// The replay's own time scale: clock ticks, a mark per arrived report, plan and prior, the time each report spent
// without signal (sent to arrived), and when a camera saw a person. Pure arithmetic, so it is unit-tested.

import type { ReplayData, ReplayEvent } from "./replayData";
import type { ReplayWindow } from "./stateAt";

export type MarkKind = "report" | "sighting" | "camera" | "plan" | "prior";

export type RulerModel = {
  ticks: { tMs: number; x: number; label: string | null }[];
  marks: { id: string; x: number; kind: MarkKind; label: string }[];
  /** Sent to arrived: time without signal. */
  spans: { eventId: string; x0: number; x1: number; minutes: number }[];
  /** Person in view on a camera. */
  bands: { eventId: string; x0: number; x1: number }[];
};

const MIN = 60_000;
/** Labelled ticks sit at least this far apart, so clock labels never overlap. */
const LABEL_GAP_PX = 48;
const MIN_BAND_PX = 2;
/** A wait shorter than this is ordinary latency, not time without signal. */
const SPAN_MIN_MS = MIN;
/** The whole window plays in 30 seconds (ours). */
export const PLAY_WINDOW_IN_MS = 30_000;

export function tickStepMs(windowMs: number): 60_000 | 300_000 | 900_000 | 3_600_000 {
  if (windowMs <= 20 * MIN) return 60_000;
  if (windowMs <= 120 * MIN) return 300_000;
  if (windowMs <= 360 * MIN) return 900_000;
  return 3_600_000;
}

export function clockLabel(tMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(tMs);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Time since the window start, "00:42:10". */
export function elapsedLabel(tMs: number, startMs: number): string {
  const s = Math.max(0, Math.floor((tMs - startMs) / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** What the slider announces: "14:03, 42 minutes in". */
export function valueText(tMs: number, startMs: number, timeZone: string): string {
  const minutes = Math.max(0, Math.floor((tMs - startMs) / MIN));
  return `${clockLabel(tMs, timeZone)}, ${minutes} ${minutes === 1 ? "minute" : "minutes"} in`;
}

const TYPE_WORD: Record<ReplayEvent["type"], string> = {
  cleared: "Cleared",
  clue: "Clue",
  sighting: "Sighting",
  camera_sighting: "Camera sighting",
  destination: "Destination",
  confirmation: "Confirmation",
  retraction: "Retraction",
  found: "Found",
  plan_ack: "Plan read",
};

function markKind(e: ReplayEvent): MarkKind | null {
  if (e.type === "plan_ack") return null; // an acknowledgement never moves the map
  if (e.type === "sighting") return "sighting";
  if (e.type === "camera_sighting") return "camera";
  return "report";
}

export function rulerModel(data: ReplayData, w: ReplayWindow, widthPx: number, timeZone: string): RulerModel {
  const span = Math.max(w.endMs - w.startMs, 1);
  const x = (t: number) => Math.min(widthPx, Math.max(0, ((t - w.startMs) / span) * widthPx));
  const teamName = new Map(data.teams.map((t) => [t.teamId, t.name]));

  const step = tickStepMs(w.endMs - w.startMs);
  const labelEvery = Math.max(1, Math.ceil(LABEL_GAP_PX / ((step / span) * widthPx)));
  const ticks: RulerModel["ticks"] = [];
  for (let t = Math.ceil(w.startMs / step) * step; t <= w.endMs; t += step) {
    ticks.push({ tMs: t, x: x(t), label: Math.round(t / step) % labelEvery === 0 ? clockLabel(t, timeZone) : null });
  }

  const marks: RulerModel["marks"] = [];
  const spans: RulerModel["spans"] = [];
  const bands: RulerModel["bands"] = [];
  for (const e of data.events) {
    if (e.arrivedAtMs === null) continue;
    const kind = markKind(e);
    if (kind !== null) {
      const team = e.teamId !== null ? teamName.get(e.teamId) : undefined;
      marks.push({ id: e.eventId, x: x(e.arrivedAtMs), kind, label: `${TYPE_WORD[e.type]}${team ? ` from ${team}` : ""}, arrived ${clockLabel(e.arrivedAtMs, timeZone)}` });
    }
    if (!e.clockSuspect && e.offlineForMs !== null && e.offlineForMs >= SPAN_MIN_MS) {
      spans.push({ eventId: e.eventId, x0: x(e.sentAtMs), x1: x(e.arrivedAtMs), minutes: Math.round(e.offlineForMs / MIN) });
    }
    if (e.camera) {
      let x0 = x(e.camera.startMs);
      let x1 = x(e.camera.endMs);
      if (x1 - x0 < MIN_BAND_PX) {
        x0 = Math.min(x0, widthPx - MIN_BAND_PX);
        x1 = x0 + MIN_BAND_PX;
      }
      bands.push({ eventId: e.eventId, x0, x1 });
    }
  }
  for (const p of data.plans) {
    marks.push({ id: `plan-${p.version}`, x: x(p.approvedAtMs), kind: "plan", label: `Plan ${p.version} approved ${clockLabel(p.approvedAtMs, timeZone)}` });
  }
  marks.push({ id: "prior", x: x(w.priorInUseFromMs), kind: "prior", label: `Current prior in use from ${clockLabel(w.priorInUseFromMs, timeZone)}` });
  marks.sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { ticks, marks, spans, bands };
}

/** The x of the next mark after x (dir 1) or the previous one before it (dir -1); null past the end. */
export function nextMark(m: RulerModel, x: number, dir: 1 | -1): number | null {
  if (dir === 1) return m.marks.find((k) => k.x > x)?.x ?? null;
  for (let i = m.marks.length - 1; i >= 0; i--) if (m.marks[i]!.x < x) return m.marks[i]!.x;
  return null;
}

/** Playback: advance by dtMs of real time; the whole window takes PLAY_WINDOW_IN_MS. Stops at the end. */
export function playbackStep(tMs: number, dtMs: number, w: ReplayWindow): number {
  const rate = (w.endMs - w.startMs) / PLAY_WINDOW_IN_MS;
  return Math.min(w.endMs, Math.max(w.startMs, tMs + dtMs * rate));
}
