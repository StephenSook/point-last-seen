// "Add camera clip" (spec section 12.1): one staged clip at the command post. The form asks
// for the four consents separately (the person in the clip, the owner of the footage, cloud
// reading, and public use, which is optional), the clip's start time with the camera's clock
// confirmed, the camera's facing on an 8-way picker and where the camera is. Reading is
// possible only with the three required consents; readClip checks them again.
// With this laptop's model, the clip is triaged here first: a clip with no motion or no person
// is not sent (a consented "Read in the cloud anyway" stays open), and a flagged clip is read
// only for its flagged seconds; if they give no usable reading, "Read the whole clip in the cloud" stays open.

import { sizeProblem, type RouteReason } from "@pls/engine";
import { useState, type FormEvent } from "react";
import type { ClipReadOutcome, ClipWindow } from "../ai/clipRead";
import type { LatLon } from "../map/geo";
import type { TriageResult } from "./triage";

export type ClipConsents = { personInClip: boolean; footageOwner: boolean; cloudProcessing: boolean; publicUse: boolean };

/** How the cloud read runs after triage: the flagged seconds, and why the clip is sent. */
/** `retry`: the whole-clip read after a flagged window showed no one; it uses the first read's consent record. */
export type ReadHow = { window?: ClipWindow; reason?: RouteReason; retry?: boolean };

export type ClipIntakeInput = {
  bytes: Uint8Array;
  mimeType: string;
  durationS: number;
  clipStartMs: number;
  clockConfirmed: boolean;
  cameraFacingDeg: number | null;
  camera: LatLon | null;
  consents: ClipConsents;
};

const FACINGS: [number | null, string][] = [
  [0, "North"], [45, "Northeast"], [90, "East"], [135, "Southeast"],
  [180, "South"], [225, "Southwest"], [270, "West"], [315, "Northwest"], [null, "Not known"],
];

export function clipFacts(bytes: number, durationS: number | null): string {
  const size = bytes < 1_000_000 ? `${Math.round(bytes / 1000)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
  return durationS === null ? size : `${durationS} s, ${size}`;
}

/** The sentence for a read that produced no sighting; null for a reading. */
export function clipOutcomeMessage(o: ClipReadOutcome): string | null {
  if (o.kind === "refused") return o.message;
  if (o.kind === "could-not-read") return "Couldn't read this clip. Nothing changed.";
  if (o.kind === "failed") return "The clip was not read. Try again.";
  return null;
}

/** Whole seconds, rounded up so a last-seen time in the final second still fits; null when the browser cannot read it. */
function readDurationS(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0 ? Math.ceil(v.duration) : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

type Props = {
  camera: LatLon | null;
  cameraSegmentId: string | null;
  /** Every segment with its centre: the keyboard way to place the camera. */
  choices: readonly { segmentId: string; centre: LatLon }[];
  onPlaceCamera: (p: LatLon) => void;
  onRead: (input: ClipIntakeInput, how: ReadHow) => Promise<ClipReadOutcome>;
  /** On-device triage; without it the clip goes straight to the consented cloud read. */
  onTriage?: (clip: Blob) => Promise<TriageResult>;
  onClose: () => void;
};

const NO_CONSENT: ClipConsents = { personInClip: false, footageOwner: false, cloudProcessing: false, publicUse: false };

const HELD = {
  "no-motion": "Nothing moves in this clip. Nothing was sent.",
  "no-person": "No person found on this laptop. Nothing was sent.",
  // A flagged window read in the cloud gave no usable sighting (no one, or a reply that could not be used);
  // triaging again would flag the same seconds.
  "window-miss": "No usable reading from the flagged seconds. Nothing changed.",
} as const;

export function ClipIntake({ camera, cameraSegmentId, choices, onPlaceCamera, onRead, onTriage, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [durationS, setDurationS] = useState<number | null>(null);
  const [start, setStart] = useState("");
  const [clockConfirmed, setClock] = useState(false);
  const [facing, setFacing] = useState<number | null>(null);
  const [consents, setConsents] = useState<ClipConsents>(NO_CONSENT);
  const [busy, setBusy] = useState<false | "checking" | "reading">(false);
  const [message, setMessage] = useState<{ text: string; alert: boolean } | null>(null);
  const [held, setHeld] = useState<{ input: ClipIntakeInput; kind: keyof typeof HELD } | null>(null);

  const tooBig = file ? sizeProblem(file.size) : null;
  const ready = !!file && !tooBig && durationS !== null && start !== "" && consents.personInClip && consents.footageOwner && consents.cloudProcessing;

  async function pick(f: File | null) {
    setFile(f);
    setDurationS(null);
    setMessage(null);
    setHeld(null);
    // Consent is given for one clip: a new selection starts with none.
    setConsents(NO_CONSENT);
    if (f && !sizeProblem(f.size)) setDurationS(await readDurationS(f));
  }

  async function read(input: ClipIntakeInput, how: ReadHow) {
    setBusy("reading");
    setHeld(null);
    try {
      const outcome = await onRead(input, how);
      if (outcome.kind === "could-not-read" && how.window) {
        // Offer the rest of the clip, with the consents given for this read.
        setHeld({ input, kind: "window-miss" });
        return;
      }
      const text = clipOutcomeMessage(outcome);
      if (text) setMessage({ text, alert: outcome.kind !== "could-not-read" });
    } catch {
      setMessage({ text: "The clip was not read. Try again.", alert: true });
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || !file || durationS === null || busy !== false) return;
    // Locked before the first await: consent and the file cannot change while this read prepares.
    setBusy(onTriage ? "checking" : "reading");
    setMessage(null);
    setHeld(null);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      // The file can become unreadable after it was chosen (moved, deleted, permission lost).
      setMessage({ text: "This clip could not be read from this computer. Choose it again.", alert: true });
      setBusy(false);
      return;
    }
    const input: ClipIntakeInput = {
      bytes,
      mimeType: file.type || "video/mp4",
      durationS,
      clipStartMs: new Date(start).getTime(),
      clockConfirmed,
      cameraFacingDeg: facing,
      camera,
      consents,
    };
    if (!onTriage) return read(input, {});
    let t: TriageResult;
    try {
      t = await onTriage(file);
    } catch {
      t = { kind: "unavailable" };
    }
    setBusy(false);
    if (t.kind === "flagged") return read(input, { window: t.window, reason: "on_device_triage_flagged" });
    if (t.kind === "no-motion" || t.kind === "no-person") {
      setHeld({ input, kind: t.kind });
      return;
    }
    return read(input, {});
  }

  const consent = (key: keyof ClipConsents, label: string) => (
    <label className="check">
      <input
        type="checkbox"
        checked={consents[key]}
        onChange={(e) => {
          setConsents((c) => ({ ...c, [key]: e.target.checked }));
          // A held clip was read with the consents as they were; any change withdraws the override.
          setHeld(null);
        }}
        disabled={busy !== false}
      />
      {label}
    </label>
  );

  return (
    <form className="sighting-form" onSubmit={submit} aria-label="Add camera clip">
      <label>
        Clip
        <input type="file" accept="video/*" onChange={(e) => void pick(e.target.files?.[0] ?? null)} disabled={busy !== false} />
      </label>
      {file && !tooBig && <p className="muted small" data-testid="clip-facts">{clipFacts(file.size, durationS)}</p>}
      {tooBig && (
        <p className="error" role="alert">
          {tooBig}
        </p>
      )}
      {file && !tooBig && durationS === null && <p className="muted small">Reading the clip's length.</p>}
      <label>
        Clip starts at
        <input type="datetime-local" step={1} value={start} onChange={(e) => setStart(e.target.value)} disabled={busy !== false} />
      </label>
      <label className="check">
        <input type="checkbox" checked={clockConfirmed} onChange={(e) => setClock(e.target.checked)} disabled={busy !== false} />
        The camera's clock is right
      </label>
      <fieldset className="facing">
        <legend>Camera faces</legend>
        {FACINGS.map(([deg, name]) => (
          <label key={name} className="check">
            <input type="radio" name="facing" checked={facing === deg} onChange={() => setFacing(deg)} disabled={busy !== false} />
            {name}
          </label>
        ))}
      </fieldset>
      <label>
        Camera at
        <select
          value={cameraSegmentId ?? ""}
          onChange={(e) => {
            const c = choices.find((x) => x.segmentId === e.target.value);
            if (c) onPlaceCamera(c.centre);
          }}
          disabled={busy !== false}
        >
          <option value="">{camera && !cameraSegmentId ? "Outside the search area" : "On the map"}</option>
          {choices.map((c) => (
            <option key={c.segmentId} value={c.segmentId}>
              Segment {c.segmentId}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="consents">
        <legend>Consent for this clip</legend>
        {consent("personInClip", "The person in the clip")}
        {consent("footageOwner", "The owner of the footage")}
        {consent("cloudProcessing", "Cloud reading (the clip goes to Gemini)")}
        {consent("publicUse", "Public use, film or judge page (optional)")}
      </fieldset>
      {message && (
        <p className={message.alert ? "error" : undefined} role={message.alert ? "alert" : "status"}>
          {message.text}
        </p>
      )}
      {held && (
        <div className="note-state">
          <p role="status">{HELD[held.kind]}</p>
          <button type="button" className="btn ghost" onClick={() => void read(held.input, held.kind === "window-miss" ? { reason: "user_override_after_triage", retry: true } : { reason: "user_override_after_triage" })} disabled={busy !== false}>
            {held.kind === "window-miss" ? "Read the whole clip in the cloud" : "Read in the cloud anyway"}
          </button>
        </div>
      )}
      <div className="row">
        <button type="submit" className="btn" disabled={!ready || busy !== false}>
          {busy === "checking" ? "Checking on this laptop" : busy === "reading" ? "Reading" : "Read clip"}
        </button>
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy !== false}>
          Cancel
        </button>
      </div>
    </form>
  );
}
