// "Add sighting": a caller's or passer-by's sighting, entered at command.
// The place comes from a map click or the Place list. A callback name or number may be typed
// for the operator, but it stays in this form only and is cleared on save:
// no field of the stored event holds it, and phone numbers are removed from
// the note (by the shared rule, see data/phoneNumbers) before it is stored or read.

import { readsAsSearchReport, SEARCH_REPORT_LINE, type ClothingColor, type Direction, type RouteRecord } from "@pls/engine";
import { useRef, useState, type FormEvent } from "react";
import { receiptLines } from "../ai/receipt";
import { consentPreview, type SightingCues, type SightingRead } from "../ai/sightingText";
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
  /** Command has paused cloud reading (Remote Config kill_cloud): the form offers no cloud read and says why. */
  cloudPaused?: boolean;
  /** Segments that stand cleared: a search report placed in one can open that segment's debrief. */
  debriefable?: ReadonlySet<string>;
  /** Opens that segment's debrief form below; the sighting form stays as it is, and nothing is carried or saved. */
  onOpenDebrief?: (segmentId: string) => void;
};

const CLOUD_PAUSED = "Cloud reading is paused by command.";

function localInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

export function SightingForm({ place, placeSegmentId, choices, onPlace, onSave, readNote, readNoteInCloud, onClose, cloudPaused = false, debriefable, onOpenDebrief }: Props) {
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
  const [readState, setReadState] = useState<"none" | "no-model" | "filled" | "not-read" | "evidence" | "consent" | "changed" | "timeout" | "not-english" | "cloud-paused">("none");
  // The last read that filled the fields: what was asked for, where it ran and what it sent.
  const [ran, setRan] = useState<{ asked: string; route: RouteRecord; sentBytes: number } | null>(null);
  // The read that filled the fields, kept for the saved sighting's route even if its receipt is no longer shown.
  const [readFilled, setReadFilled] = useState<{ route: RouteRecord | null } | null>(null);
  // The note as it is now: a reply for an older note is dropped rather than filled in.
  const noteNow = useRef(note);
  noteNow.current = note;
  const [error, setError] = useState<string | null>(null);
  // The note a team's search report was typed as ("Segment 4 searched, subject not seen"): Save asked once whether it
  // is a sighting. It only warns, in English only: a second tap saves it as typed, and an edit asks again.
  const [reportAsked, setReportAsked] = useState<string | null>(null);
  // The segment whose debrief this form opened below. The sighting draft stays as it is: command copies what belongs
  // in the debrief, then cancels this sighting or saves it anyway. The line says "was opened", which stays true if
  // that debrief is later cancelled or Details is closed.
  const [debriefOpened, setDebriefOpened] = useState<string | null>(null);

  // The words of the note the read took its answer from (checked against the note by the read itself).
  const [quote, setQuote] = useState("");
  // Fields the person changed by hand. A read fills only the others, and says when it kept an edit: what a person
  // typed or picked is never overwritten by a model's guess.
  const handEdited = useRef(new Set<"direction" | "topColor" | "bottomColor" | "footwear" | "carried">());
  const [keptEdits, setKeptEdits] = useState(false);
  // The fields after the note wait under More details; a read that fills them opens it, so each one is checked.
  const [moreOpen, setMoreOpen] = useState(false);
  function fill(c: { direction: Direction; topColor: ClothingColor; bottomColor: ClothingColor; footwear: string; carried: string; evidenceQuote?: string }) {
    setMoreOpen(true);
    const mine = handEdited.current;
    setQuote(c.evidenceQuote?.trim() ?? "");
    if (!mine.has("direction")) setDirection(c.direction);
    if (!mine.has("topColor")) setTop(c.topColor);
    if (!mine.has("bottomColor")) setBottom(c.bottomColor);
    if (!mine.has("footwear")) setFootwear(c.footwear);
    if (!mine.has("carried")) setCarried(c.carried);
    setKeptEdits(mine.size > 0);
    setReadState("filled");
  }

  // A read's status, its receipt and the words it came from belong to the note it read. Once the note is edited
  // they no longer describe it, so they go; the fields it filled stay, since they may have been checked by hand.
  function changeNote(text: string) {
    setNote(text);
    setReportAsked(null);
    setDebriefOpened(null);
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
        setRan(w.route ? { asked: "this device only", route: w.route, sentBytes: w.sentBytes ?? 0 } : null);
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
      else setReadState(r.refused === "possible-evidence" ? "evidence" : r.refused === "not-english" ? "not-english" : r.refused === "cloud-paused" ? "cloud-paused" : "not-read");
    } catch {
      if (readSeq.current === mine) setReadState("not-read");
    } finally {
      setBusy(null);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    await saveSighting(reportAsked === note);
  }

  async function saveSighting(asked: boolean) {
    setError(null);
    const observedAtMs = new Date(when).getTime();
    if (!Number.isFinite(observedAtMs)) {
      setError("Enter the time it was seen.");
      return;
    }
    // A read still running when Save is pressed fills nothing afterwards, also when Save first asks about a search
    // report: what is saved is what was on screen.
    readSeq.current++;
    if (!asked && readsAsSearchReport(note)) {
      setReportAsked(note);
      return;
    }
    setSaving(true);
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

  // The exact note a consented cloud read would send, shown in the consent box.
  const shown = readState === "consent" ? consentPreview(note) : null;
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
        Note
        <textarea value={note} maxLength={2000} rows={3} onChange={(e) => changeNote(e.target.value)} aria-describedby="note-hint" />
      </label>
      <p id="note-hint" className="muted">Do not type the caller's name.</p>
      <div className="row">
        <button type="button" className="btn ghost" onClick={readOnLaptop} disabled={busy !== null || note.trim() === ""}>
          {busy === "read" ? "Reading" : "Read the note"}
        </button>
      </div>
      {busy === "read" && (
        <p role="status" className="muted">
          Reading the note on this laptop. The first read can take up to a minute.
        </p>
      )}
      {readState === "no-model" && (
        <div role="status" className="note-state">
          <p>This laptop has no local model. Nothing was sent.</p>
          {cloudPaused ? (
            <p>{CLOUD_PAUSED}</p>
          ) : (
            <button type="button" className="btn ghost" onClick={() => setReadState("consent")} disabled={busy !== null}>
              Read in the cloud
            </button>
          )}
        </div>
      )}
      {readState === "consent" && (
        <div role="status" className="note-state">
          {cloudPaused ? (
            <p>{CLOUD_PAUSED}</p>
          ) : (
            <>
              {/* The exact note the cloud read sends (consentPreview), so the person approves the real payload. */}
              <p>This goes to Gemini in the cloud:</p>
              <p className="small consent-note" data-testid="consent-note">{shown?.text}</p>
              {shown?.removedLine && <p className="small muted">{shown.removedLine}</p>}
              <button type="button" className="btn ghost" onClick={readInCloud} disabled={busy !== null}>
                {busy === "cloud" ? "Reading" : "I consent for this note"}
              </button>
            </>
          )}
        </div>
      )}
      {readState === "cloud-paused" && <p role="status">{CLOUD_PAUSED} Fill the fields by hand.</p>}
      {readState === "filled" && <p role="status" className="muted">{keptEdits ? "Suggested from the note. Check every field. Your edits were kept." : "Suggested from the note. Check every field."}</p>}
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
      {readState === "not-english" && <p role="status">This note doesn't look like English, so it isn't sent to the cloud to be read. Fill the fields by hand.</p>}
      {readState === "changed" && <p role="status">The note changed while it was being read. Read it again.</p>}
      <details className="more-details" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
        <summary>More details</summary>
        <label>
          Going
          <select value={direction} onChange={(e) => { handEdited.current.add("direction"); setDirection(e.target.value as Direction); }}>
            {DIRECTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <div className="two">
          <label>
            Top
            <select value={topColor} onChange={(e) => { handEdited.current.add("topColor"); setTop(e.target.value as ClothingColor); }}>
              {COLORS.map((c) => (
                <option key={c} value={c}>{c === "unknown" ? "Not known" : c}</option>
              ))}
            </select>
          </label>
          <label>
            Bottom
            <select value={bottomColor} onChange={(e) => { handEdited.current.add("bottomColor"); setBottom(e.target.value as ClothingColor); }}>
              {COLORS.map((c) => (
                <option key={c} value={c}>{c === "unknown" ? "Not known" : c}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Footwear
          <input value={footwear} maxLength={40} onChange={(e) => { handEdited.current.add("footwear"); setFootwear(e.target.value); }} />
        </label>
        <label>
          Carrying
          <input value={carried} maxLength={40} onChange={(e) => { handEdited.current.add("carried"); setCarried(e.target.value); }} />
        </label>
        <label>
          Reported by
          <select value={reportedBy} onChange={(e) => setWho(e.target.value as SightingInput["reportedBy"])}>
            {WHO.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
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
      </details>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {reportAsked !== null && reportAsked === note && (
        <div className="note-state" role="alert">
          <p>{SEARCH_REPORT_LINE}</p>
          {debriefOpened && (
            <p role="status">{`Segment ${debriefOpened}'s debrief was opened below. Copy what belongs there, then cancel this sighting, or save it as a sighting anyway.`}</p>
          )}
          <div className="row">
            {placeSegmentId && onOpenDebrief && debriefable?.has(placeSegmentId) && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setDebriefOpened(placeSegmentId);
                  onOpenDebrief(placeSegmentId);
                }}
                disabled={saving}
              >
                Open segment {placeSegmentId}'s debrief
              </button>
            )}
            <button type="button" className="btn ghost" onClick={() => saveSighting(true)} disabled={saving}>
              Save as a sighting anyway
            </button>
          </div>
        </div>
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
