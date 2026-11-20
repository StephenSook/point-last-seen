// "Add sighting": a caller's or passer-by's sighting, entered at command.
// The place comes from a map click or the Place list. A callback name or number may be typed
// for the operator, but it stays in this form only and is cleared on save:
// no field of the stored event holds it, and phone numbers are removed from
// the note before it is stored or read.

import type { ClothingColor, Direction, RouteRecord } from "@pls/engine";
import { useRef, useState, type FormEvent } from "react";
import { receiptLines } from "../ai/receipt";
import type { SightingCues, SightingRead } from "../ai/sightingText";
import type { SightingInput } from "../data/sightings";
import type { LatLon } from "../map/geo";

const DIRECTIONS: [Direction, string][] = [
  ["unknown", "Not known"], ["n", "North"], ["ne", "Northeast"], ["e", "East"], ["se", "Southeast"],
  ["s", "South"], ["sw", "Southwest"], ["w", "West"], ["nw", "Northwest"], ["upstream", "Upstream"], ["downstream", "Downstream"],
];
const COLORS: ClothingColor[] = ["unknown", "black", "white", "gray", "brown", "tan", "red", "orange", "yellow", "green", "blue", "purple", "pink"];
const WHO: [SightingInput["reportedBy"], string][] = [["stranger", "Stranger"], ["neighbour", "Neighbour"], ["staff", "Staff at a business"], ["family", "Family"]];

/** Where a read ran and what it sent, when the post knows it (for the "What ran" receipt). */
type Ran = { route?: RouteRecord; sentBytes?: number };
type CloudRead = ({ reading: SightingCues } & Ran) | { refused: string };

type Props = {
  place: LatLon | null;
  placeSegmentId: string | null;
  /** Every segment with its centre: the keyboard way to place the sighting. */
  choices: readonly { segmentId: string; centre: LatLon }[];
  onPlace: (p: LatLon) => void;
  onSave: (input: SightingInput) => Promise<void>;
  readNote: (text: string) => Promise<SightingRead | ({ reading: SightingCues } & Ran)>;
  readNoteInCloud: (text: string) => Promise<CloudRead>;
  onClose: () => void;
};

function localInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

export function SightingForm({ place, placeSegmentId, choices, onPlace, onSave, readNote, readNoteInCloud, onClose }: Props) {
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
  // A read in progress; saving is tracked apart, so Save stays available while a read runs.
  const [busy, setBusy] = useState<"read" | "cloud" | null>(null);
  const [saving, setSaving] = useState(false);
  // Each read takes a number, and Save takes the next: a reply whose number is no longer the latest is dropped.
  const readSeq = useRef(0);
  const [readState, setReadState] = useState<"none" | "no-model" | "filled" | "not-read" | "evidence" | "consent" | "changed" | "timeout">("none");
  // The last read that filled the fields: what was asked for, where it ran and what it sent.
  const [ran, setRan] = useState<{ asked: string; route: RouteRecord; sentBytes: number } | null>(null);
  // The read that filled the fields, kept for the saved sighting's route even if its receipt is no longer shown.
  const [readFilled, setReadFilled] = useState<{ route: RouteRecord | null } | null>(null);
  // The note as it is now: a reply for an older note is dropped rather than filled in.
  const noteNow = useRef(note);
  noteNow.current = note;
  const [error, setError] = useState<string | null>(null);

  // The words of the note the read took its answer from (checked against the note by the read itself).
  const [quote, setQuote] = useState("");
  function fill(c: { direction: Direction; topColor: ClothingColor; bottomColor: ClothingColor; footwear: string; carried: string; evidenceQuote?: string }) {
    setQuote(c.evidenceQuote?.trim() ?? "");
    setDirection(c.direction);
    setTop(c.topColor);
    setBottom(c.bottomColor);
    setFootwear(c.footwear);
    setCarried(c.carried);
    setReadState("filled");
  }

  // A read's status, its receipt and the words it came from belong to the note it read. Once the note is edited
  // they no longer describe it, so they go; the fields it filled stay, since they may have been checked by hand.
  function changeNote(text: string) {
    setNote(text);
    if (readState === "none") return;
    setReadState("none");
    setRan(null);
    setQuote("");
  }

  async function readOnLaptop() {
    setBusy("read");
    setError(null);
    const asked = note;
    const mine = ++readSeq.current;
    try {
      const r = await readNote(asked);
      if (readSeq.current !== mine) return;
      if (noteNow.current !== asked) return setReadState("changed");
      if ("reading" in r) {
        fill(r.reading);
        const w = r as Ran;
        setRan(w.route ? { asked: "this laptop only", route: w.route, sentBytes: w.sentBytes ?? 0 } : null);
        setReadFilled({ route: w.route ?? null });
      }
      else setReadState(r.refused === "no-on-device-model" ? "no-model" : r.refused === "possible-evidence" ? "evidence" : r.refused === "timeout" ? "timeout" : "not-read");
    } catch {
      if (readSeq.current === mine) setReadState("not-read");
    } finally {
      setBusy(null);
    }
  }

  async function readInCloud() {
    setBusy("cloud");
    setError(null);
    const asked = note;
    const mine = ++readSeq.current;
    try {
      const r = await readNoteInCloud(asked);
      if (readSeq.current !== mine) return;
      if (noteNow.current !== asked) return setReadState("changed");
      if ("reading" in r) {
        fill(r.reading);
        setRan(r.route ? { asked: "the cloud, after the consent tap", route: r.route, sentBytes: r.sentBytes ?? 0 } : null);
        setReadFilled({ route: r.route ?? null });
      }
      else setReadState(r.refused === "possible-evidence" ? "evidence" : "not-read");
    } catch {
      if (readSeq.current === mine) setReadState("not-read");
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
    setSaving(true);
    // A read still running when Save is pressed fills nothing afterwards: what is saved is what was on screen.
    readSeq.current++;
    try {
      await onSave({ observedAtMs, position: place, direction, topColor, bottomColor, footwear, carried, reportedBy, freeText: note, ...(readFilled ? { readFilled } : {}) });
      setCallbackName("");
      setCallbackNumber("");
      onClose();
    } catch {
      setError("The sighting was not saved. Check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="sighting-form" onSubmit={save} aria-labelledby="sighting-h">
      <h2 id="sighting-h" className="label">Add sighting</h2>
      <label>
        Seen at
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
      </label>
      <label>
        Place
        <select
          value={placeSegmentId ?? ""}
          onChange={(e) => {
            const c = choices.find((x) => x.segmentId === e.target.value);
            if (c) onPlace(c.centre);
          }}
        >
          <option value="">{place && !placeSegmentId ? "Outside the search area" : "On the map"}</option>
          {choices.map((c) => (
            <option key={c.segmentId} value={c.segmentId}>
              Segment {c.segmentId}
            </option>
          ))}
        </select>
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
        <textarea value={note} maxLength={2000} rows={3} onChange={(e) => changeNote(e.target.value)} aria-describedby="note-hint" />
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
      {/* Shown only while the note still holds these exact words. */}
      {readState === "filled" && quote && note.includes(quote) && <p className="small">From the note: "{quote}"</p>}
      {readState === "filled" && ran && (
        <details className="receipt">
          <summary>What ran</summary>
          {receiptLines({ asked: ran.asked, route: ran.route, sentBytes: ran.sentBytes, what: "the note, with phone numbers removed" }).map((l) => (
            <p key={l} className="small">{l}</p>
          ))}
        </details>
      )}
      {readState === "evidence" && <p role="status">This note may describe evidence. It was not sent to any model. Fill the fields by hand.</p>}
      {readState === "not-read" && <p role="status">The note could not be read. Fill the fields by hand.</p>}
      {readState === "timeout" && <p role="status">The read took too long. Fill the fields by hand.</p>}
      {readState === "changed" && <p role="status">The note changed while it was being read. Read it again.</p>}
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
        <button type="submit" className="btn" disabled={saving}>
          {saving ? "Saving" : "Save sighting"}
        </button>
        <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
