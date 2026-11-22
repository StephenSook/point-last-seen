// Command reads a team's paper debrief sheet on this laptop: a photo of it, or the laptop camera, opened only on a
// click. The read fills the debrief's boxes, and Save stays off until command has checked every box against the
// paper; changing a box clears its check. The photo is never kept: it lives only in this read's local variables, never
// in state or storage, and the camera stops when the photo is taken or the read closes.

import { useEffect, useRef, useState } from "react";
import type { RouteRecord } from "@pls/engine";
import type { SheetField, SheetRead, SheetRefusal } from "../ai/debriefSheetRead";
import { receiptLines } from "../ai/receipt";
import { parseDebriefForm, type DebriefInput } from "../data/debriefs";
import { bytesToBase64 } from "../data/photos";
import { toStandardJpeg } from "../photos/jpeg";

export type PaperReadResult = { read: SheetRead; route: RouteRecord } | { refused: SheetRefusal };
/** Reads one JPEG of a sheet for this debrief's segment; the caller knows the search's segments and teams. */
export type PaperRead = (jpegBase64: string, segmentId: string) => Promise<PaperReadResult>;

/** The sheet's boxes, in its order and with its words, so command can compare them line by line. */
const FIELDS: readonly { key: SheetField; label: string; long?: true }[] = [
  { key: "team", label: "Team" },
  { key: "segment", label: "Segment" },
  { key: "minutes", label: "Minutes searched" },
  { key: "coverage", label: "Coverage ticked" },
  { key: "worked", label: "What worked", long: true },
  { key: "didNotWork", label: "What did not work", long: true },
  { key: "clues", label: "Clues: what and where", long: true },
  { key: "hazards", label: "Hazards: what and where", long: true },
];

const SAY: Record<SheetRefusal | "photo" | "failed" | "camera", string> = {
  "no-on-device-model": "This laptop has no on-device model that reads images, so the sheet was not read. Add the debrief by hand.",
  "not-on-device": "The read did not run on this laptop, so it was not used. Add the debrief by hand.",
  invalid: "The sheet could not be read. Try a clearer photo, or add the debrief by hand.",
  timeout: "The read took too long. Try again, or add the debrief by hand.",
  photo: "The photo could not be opened. Try another photo.",
  failed: "The read stopped with an error on this laptop. Try again, or add the debrief by hand.",
  camera: "The camera could not be opened. Add a photo of the sheet instead.",
};

type Values = Record<SheetField, string>;
const NONE_CHECKED = Object.fromEntries(FIELDS.map((f) => [f.key, false])) as Record<SheetField, boolean>;

export function DebriefPaperRead({ segmentId, read, onSave, onClose }: { segmentId: string; read: PaperRead; onSave: (input: DebriefInput) => Promise<void>; onClose: () => void }) {
  const [phase, setPhase] = useState<"pick" | "camera" | "reading" | "confirm">("pick");
  const [opening, setOpening] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteRecord | null>(null);
  const [sheet, setSheet] = useState<SheetRead | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [checked, setChecked] = useState(NONE_CHECKED);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const live = useRef(true);
  // Each camera request and each read is numbered. Starting a read or closing makes every earlier camera request and
  // read stale; closing the rail's Details makes camera requests stale but lets a read finish. A stale camera is
  // stopped and a stale read is dropped, so neither can take over the screen or fill the form.
  const camAttempt = useRef(0);
  const readAttempt = useRef(0);
  const camCurrent = (mine: number) => live.current && mine === camAttempt.current;
  const readCurrent = (mine: number) => live.current && mine === readAttempt.current;

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);

  useEffect(() => {
    if (phase !== "camera" || !video.current || !stream.current) return;
    video.current.srcObject = stream.current;
    void video.current.play().catch(() => undefined);
  }, [phase]);

  function stopCamera() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamReady(false);
  }

  /** Stops the camera, drops a request the browser has not answered yet, and makes asking again possible. */
  function cancelCamera() {
    camAttempt.current++;
    stopCamera();
    setOpening(false);
  }

  function close() {
    readAttempt.current++;
    cancelCamera();
    onClose();
  }

  // The command post's rail can close the Details that holds this read: the camera stops, and a read on screen stays.
  useEffect(() => {
    const details = root.current?.closest("details");
    if (!details) return;
    const onToggle = () => {
      if (details.open) return;
      cancelCamera();
      setPhase((p) => (p === "camera" ? "pick" : p));
    };
    details.addEventListener("toggle", onToggle);
    return () => details.removeEventListener("toggle", onToggle);
  }, []);

  async function openCamera() {
    const mine = ++camAttempt.current;
    setMessage(null);
    setOpening(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      // Closed, or a photo chosen, while the browser asked: stop it at once.
      if (!camCurrent(mine)) return s.getTracks().forEach((t) => t.stop());
      stream.current = s;
      setPhase("camera");
    } catch {
      if (camCurrent(mine)) setMessage(SAY.camera);
    } finally {
      if (camCurrent(mine)) setOpening(false);
    }
  }

  async function takePhoto() {
    const v = video.current;
    if (!v || v.videoWidth === 0) return;
    const mine = readAttempt.current;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    stopCamera();
    const photo = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));
    c.width = 0;
    c.height = 0;
    // Cancelled while the photo was taken: nothing is read.
    if (!readCurrent(mine)) return;
    if (!photo) {
      setPhase("pick");
      setMessage(SAY.photo);
      return;
    }
    await readPhoto(photo);
  }

  async function readPhoto(photo: Blob) {
    const mine = ++readAttempt.current;
    cancelCamera();
    setPhase("reading");
    setMessage(null);
    let jpeg: string;
    try {
      jpeg = bytesToBase64(await toStandardJpeg(photo));
    } catch {
      if (readCurrent(mine)) {
        setPhase("pick");
        setMessage(SAY.photo);
      }
      return;
    }
    // Cancelled while the photo was prepared: the model is never asked.
    if (!readCurrent(mine)) return;
    let r: PaperReadResult;
    try {
      r = await read(jpeg, segmentId);
    } catch {
      if (readCurrent(mine)) {
        setPhase("pick");
        setMessage(SAY.failed);
      }
      return;
    }
    if (!readCurrent(mine)) return;
    if ("refused" in r) {
      setPhase("pick");
      setMessage(SAY[r.refused]);
      return;
    }
    setSheet(r.read);
    setValues(r.read.form);
    setRoute(r.route);
    setChecked(NONE_CHECKED);
    setPhase("confirm");
  }

  function change(key: SheetField, value: string) {
    setValues((v) => (v ? { ...v, [key]: value } : v));
    setChecked((c) => ({ ...c, [key]: false }));
    setSaveError(null);
  }

  const block = !FIELDS.every((f) => checked[f.key])
    ? "Check every box against the paper to save."
    : values?.segment.trim().toUpperCase() !== segmentId
      ? `Save needs the segment box to read ${segmentId}.`
      : null;

  async function save() {
    if (!values || block !== null) return;
    const parsed = parseDebriefForm({ minutes: values.minutes, worked: values.worked, didNotWork: values.didNotWork, coverage: values.coverage, clues: values.clues, hazards: values.hazards });
    if (!parsed.ok) {
      setSaveError(parsed.message);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(parsed.value);
      if (live.current) onClose();
    } catch {
      if (live.current) setSaveError("The debrief was not saved. Try again.");
    } finally {
      if (live.current) setSaving(false);
    }
  }

  if (phase === "confirm" && values && sheet && route) {
    return (
      <div ref={root} className="debrief-form">
        <p className="small">Read on this laptop. Check each box against the paper; change any the read got wrong.</p>
        {receiptLines({ asked: "this device only", route, sentBytes: 0, what: "the photo of the sheet" }).map((l) => (
          <p key={l} className="muted small">
            {l}
          </p>
        ))}
        {FIELDS.map((f) => {
          // A note on what the read found, while the box still holds what was read.
          const problem = values[f.key] === sheet.form[f.key] ? sheet.problems[f.key] : undefined;
          return (
            <div key={f.key} className="debrief-paper-field">
              <label>
                {f.label}
                {/* Each box is named by its label alone: a wrapping label would add the box's contents to the name. */}
                {f.key === "coverage" ? (
                  <select aria-label={f.label} value={values.coverage} onChange={(e) => change("coverage", e.target.value)} disabled={saving}>
                    <option value="">No box ticked</option>
                    {["25", "50", "75", "100"].map((t) => (
                      <option key={t} value={t}>{`${t}%`}</option>
                    ))}
                  </select>
                ) : f.long ? (
                  <textarea aria-label={f.label} maxLength={500} value={values[f.key]} onChange={(e) => change(f.key, e.target.value)} disabled={saving} />
                ) : (
                  <input aria-label={f.label} value={values[f.key]} onChange={(e) => change(f.key, e.target.value)} disabled={saving} />
                )}
              </label>
              {problem && <p className="error small">{problem}</p>}
              <label className="check">
                <input
                  type="checkbox"
                  aria-label={`${f.label}: check this against the paper`}
                  checked={checked[f.key]}
                  onChange={(e) => setChecked((c) => ({ ...c, [f.key]: e.target.checked }))}
                  disabled={saving}
                />
                Check this against the paper
              </label>
            </div>
          );
        })}
        {saveError && (
          <p className="error" role="alert">
            {saveError}
          </p>
        )}
        {block && (
          <p className="muted small" role="status">
            {block}
          </p>
        )}
        <div className="row">
          <button type="button" className="btn" onClick={() => void save()} disabled={block !== null || saving}>
            Save debrief
          </button>
          <button type="button" className="btn ghost" onClick={close} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={root} className="debrief-form">
      <p className="small">Read the team's paper sheet on this laptop. The photo is not kept.</p>
      {phase === "pick" && (
        <>
          <label>
            Photo of the sheet
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const photo = e.target.files?.[0];
                e.target.value = "";
                if (photo) void readPhoto(photo);
              }}
            />
          </label>
          <button type="button" className="btn ghost" onClick={() => void openCamera()} disabled={opening}>
            Use the laptop camera
          </button>
        </>
      )}
      {phase === "camera" && (
        <>
          <video ref={video} className="debrief-camera" muted playsInline aria-label="The laptop camera" onLoadedMetadata={() => setCamReady(true)} />
          <button type="button" className="btn" onClick={() => void takePhoto()} disabled={!camReady}>
            Take the photo
          </button>
        </>
      )}
      {phase === "reading" && <p role="status">Reading the sheet on this laptop. The first read can take up to a minute.</p>}
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <div className="row">
        <button type="button" className="btn ghost" onClick={close}>
          Cancel
        </button>
      </div>
    </div>
  );
}
