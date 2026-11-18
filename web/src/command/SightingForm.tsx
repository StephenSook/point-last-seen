// "Add sighting": a caller's or passer-by's sighting, entered at command.
// The place comes from a map click. A callback name or number may be typed
// for the operator, but it stays in this form only and is cleared on save:
// no field of the stored event holds it, and phone numbers are removed from
// the note before it is stored or read.

import type { ClothingColor, Direction } from "@pls/engine";
import { useState, type FormEvent } from "react";
import type { SightingCues, SightingRead } from "../ai/sightingText";
import type { SightingInput } from "../data/sightings";
import type { LatLon } from "../map/geo";

const DIRECTIONS: [Direction, string][] = [
  ["unknown", "Not known"], ["n", "North"], ["ne", "Northeast"], ["e", "East"], ["se", "Southeast"],
  ["s", "South"], ["sw", "Southwest"], ["w", "West"], ["nw", "Northwest"], ["upstream", "Upstream"], ["downstream", "Downstream"],
];
const COLORS: ClothingColor[] = ["unknown", "black", "white", "gray", "brown", "tan", "red", "orange", "yellow", "green", "blue", "purple", "pink"];
const WHO: [SightingInput["reportedBy"], string][] = [["stranger", "Stranger"], ["neighbour", "Neighbour"], ["staff", "Staff at a business"], ["family", "Family"]];

type CloudRead = { reading: SightingCues } | { refused: string };

type Props = {
  place: LatLon | null;
  placeSegmentId: string | null;
  onSave: (input: SightingInput) => Promise<void>;
  readNote: (text: string) => Promise<SightingRead>;
  readNoteInCloud: (text: string) => Promise<CloudRead>;
  onClose: () => void;
};

function localInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

export function SightingForm({ place, placeSegmentId, onSave, readNote, readNoteInCloud, onClose }: Props) {
  const [when, setWhen] = useState(() => localInput(Date.now()));
  const [direction, setDirection] = useState<Direction>("unknown");
  const [topColor, setTop] = useState<ClothingColor>("unknown");
  const [bottomColor, setBottom] = useState<ClothingColor>("unknown");
  const [footwear, setFootwear] = useState("");
  const [carried, setCarried] = useState("");
  const [reportedBy, setWho] = useState<SightingInput["reportedBy"]>("stranger");
  const [note, setNote] = useState("");
  const [callbackName, setCallbackName] = useState("");
  const [callbackNumber, setCallbackNumber] = useState("");
  const [busy, setBusy] = useState<"read" | "cloud" | "save" | null>(null);
  const [readState, setReadState] = useState<"none" | "no-model" | "filled" | "not-read" | "evidence" | "consent">("none");
  const [error, setError] = useState<string | null>(null);

  function fill(c: { direction: Direction; topColor: ClothingColor; bottomColor: ClothingColor; footwear: string; carried: string }) {
    setDirection(c.direction);
    setTop(c.topColor);
    setBottom(c.bottomColor);
    setFootwear(c.footwear);
    setCarried(c.carried);
    setReadState("filled");
  }

  async function readOnLaptop() {
    setBusy("read");
    setError(null);
    try {
      const r = await readNote(note);
      if ("reading" in r) fill(r.reading);
      else setReadState(r.refused === "no-on-device-model" ? "no-model" : r.refused === "possible-evidence" ? "evidence" : "not-read");
    } catch {
      setReadState("not-read");
    } finally {
      setBusy(null);
    }
  }

  async function readInCloud() {
    setBusy("cloud");
    setError(null);
    try {
      const r = await readNoteInCloud(note);
      if ("reading" in r) fill(r.reading);
      else setReadState(r.refused === "possible-evidence" ? "evidence" : "not-read");
    } catch {
      setReadState("not-read");
    } finally {
      setBusy(null);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const observedAtMs = new Date(when).getTime();
    if (!Number.isFinite(observedAtMs)) {
      setError("Enter the time it was seen.");
      return;
    }
    setBusy("save");
    try {
      await onSave({ observedAtMs, position: place, direction, topColor, bottomColor, footwear, carried, reportedBy, freeText: note });
      setCallbackName("");
      setCallbackNumber("");
      onClose();
    } catch {
      setError("The sighting was not saved. Check the fields and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form className="sighting-form" onSubmit={save} aria-labelledby="sighting-h">
      <h2 id="sighting-h" className="label">Add sighting</h2>
      <label>
        Seen at
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
      </label>
      <p className="muted" data-testid="sighting-place">
        {place ? (placeSegmentId ? `Place: segment ${placeSegmentId}.` : "Place: outside the search area.") : "Click the map to place it."}
      </p>
      <label>
        Going
        <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
          {DIRECTIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </label>
      <div className="two">
        <label>
          Top
          <select value={topColor} onChange={(e) => setTop(e.target.value as ClothingColor)}>
            {COLORS.map((c) => (
              <option key={c} value={c}>{c === "unknown" ? "Not known" : c}</option>
            ))}
          </select>
        </label>
        <label>
          Bottom
          <select value={bottomColor} onChange={(e) => setBottom(e.target.value as ClothingColor)}>
            {COLORS.map((c) => (
              <option key={c} value={c}>{c === "unknown" ? "Not known" : c}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Footwear
        <input value={footwear} maxLength={40} onChange={(e) => setFootwear(e.target.value)} />
      </label>
      <label>
        Carrying
        <input value={carried} maxLength={40} onChange={(e) => setCarried(e.target.value)} />
      </label>
      <label>
        Reported by
        <select value={reportedBy} onChange={(e) => setWho(e.target.value as SightingInput["reportedBy"])}>
          {WHO.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </label>
      <label>
        Note
        <textarea value={note} maxLength={2000} rows={3} onChange={(e) => setNote(e.target.value)} aria-describedby="note-hint" />
      </label>
      <p id="note-hint" className="muted">Do not type the caller's name.</p>
      <div className="row">
        <button type="button" className="btn ghost" onClick={readOnLaptop} disabled={busy !== null || note.trim() === ""}>
          {busy === "read" ? "Reading" : "Read the note"}
        </button>
      </div>
      {readState === "no-model" && (
        <div role="status" className="note-state">
          <p>This laptop has no local model. Nothing was sent.</p>
          <button type="button" className="btn ghost" onClick={() => setReadState("consent")} disabled={busy !== null}>
            Read in the cloud
          </button>
        </div>
      )}
      {readState === "consent" && (
        <div role="status" className="note-state">
          <p>The note goes to Gemini in the cloud. Phone numbers are removed first.</p>
          <button type="button" className="btn ghost" onClick={readInCloud} disabled={busy !== null}>
            {busy === "cloud" ? "Reading" : "I consent for this note"}
          </button>
        </div>
      )}
      {readState === "filled" && <p role="status" className="muted">Suggested from the note. Check every field.</p>}
      {readState === "evidence" && <p role="status">This note may describe evidence. It was not sent to any model. Fill the fields by hand.</p>}
      {readState === "not-read" && <p role="status">The note could not be read. Fill the fields by hand.</p>}
      <fieldset className="callback">
        <legend>Callback (stays on this screen, cleared on save)</legend>
        <label>
          Name
          <input value={callbackName} onChange={(e) => setCallbackName(e.target.value)} autoComplete="off" />
        </label>
        <label>
          Number
          <input value={callbackNumber} onChange={(e) => setCallbackNumber(e.target.value)} autoComplete="off" inputMode="tel" />
        </label>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn" disabled={busy !== null}>
          {busy === "save" ? "Saving" : "Save sighting"}
        </button>
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy === "save"}>
          Cancel
        </button>
      </div>
    </form>
  );
}
