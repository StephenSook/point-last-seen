// "Add camera clip" (spec section 12.1): one staged clip at the command post. The form asks
// for the four consents separately (the person in the clip, the owner of the footage, cloud
// reading, and public use, which is optional), the clip's start time with the camera's clock
// confirmed, the camera's facing on an 8-way picker and where the camera is. Reading is
// possible only with the three required consents; readClip checks them again.

import { sizeProblem } from "@pls/engine";
import { useState, type FormEvent } from "react";
import type { ClipReadOutcome } from "../ai/clipRead";
import type { LatLon } from "../map/geo";

export type ClipConsents = { personInClip: boolean; footageOwner: boolean; cloudProcessing: boolean; publicUse: boolean };

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
  onRead: (input: ClipIntakeInput) => Promise<ClipReadOutcome>;
  onClose: () => void;
};

export function ClipIntake({ camera, cameraSegmentId, choices, onPlaceCamera, onRead, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [durationS, setDurationS] = useState<number | null>(null);
  const [start, setStart] = useState("");
  const [clockConfirmed, setClock] = useState(false);
  const [facing, setFacing] = useState<number | null>(null);
  const [consents, setConsents] = useState<ClipConsents>({ personInClip: false, footageOwner: false, cloudProcessing: false, publicUse: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; alert: boolean } | null>(null);

  const tooBig = file ? sizeProblem(file.size) : null;
  const ready = !!file && !tooBig && durationS !== null && start !== "" && consents.personInClip && consents.footageOwner && consents.cloudProcessing;

  async function pick(f: File | null) {
    setFile(f);
    setDurationS(null);
    setMessage(null);
    if (f && !sizeProblem(f.size)) setDurationS(await readDurationS(f));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || !file || durationS === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await onRead({
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type || "video/mp4",
        durationS,
        clipStartMs: new Date(start).getTime(),
        clockConfirmed,
        cameraFacingDeg: facing,
        camera,
        consents,
      });
      const text = clipOutcomeMessage(outcome);
      if (text) setMessage({ text, alert: outcome.kind !== "could-not-read" });
    } catch {
      setMessage({ text: "The clip was not read. Try again.", alert: true });
    } finally {
      setBusy(false);
    }
  }

  const consent = (key: keyof ClipConsents, label: string) => (
    <label className="check">
      <input type="checkbox" checked={consents[key]} onChange={(e) => setConsents((c) => ({ ...c, [key]: e.target.checked }))} disabled={busy} />
      {label}
    </label>
  );

  return (
    <form className="sighting-form" onSubmit={submit} aria-label="Add camera clip">
      <label>
        Clip
        <input type="file" accept="video/*" onChange={(e) => void pick(e.target.files?.[0] ?? null)} disabled={busy} />
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
        <input type="datetime-local" step={1} value={start} onChange={(e) => setStart(e.target.value)} disabled={busy} />
      </label>
      <label className="check">
        <input type="checkbox" checked={clockConfirmed} onChange={(e) => setClock(e.target.checked)} disabled={busy} />
        The camera's clock is right
      </label>
      <fieldset className="facing">
        <legend>Camera faces</legend>
        {FACINGS.map(([deg, name]) => (
          <label key={name} className="check">
            <input type="radio" name="facing" checked={facing === deg} onChange={() => setFacing(deg)} disabled={busy} />
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
          disabled={busy}
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
      <div className="row">
        <button type="submit" className="btn" disabled={!ready || busy}>
          {busy ? "Reading" : "Read clip"}
        </button>
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
