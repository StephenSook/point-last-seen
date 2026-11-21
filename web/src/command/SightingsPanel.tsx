import { useState } from "react";
import type { SightingCard } from "./sightingCards";

const hhmm = (ms: number | null) => (ms === null ? "time not given" : new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }));
const WHO: Record<string, string> = { public_caller: "a caller", family: "the family", searcher: "a searcher", camera: "a camera", system: "the system" };

function clothing(c: SightingCard): string {
  // A camera clip's reading holds what the clip saw under `sighting`.
  const raw = c.sighting.reading as Record<string, unknown> | null;
  const seen = c.camera && raw && typeof raw["sighting"] === "object" ? (raw["sighting"] as Record<string, unknown>) : raw;
  const r = seen ? { topColor: seen["topColor"] as string | undefined, bottomColor: seen["bottomColor"] as string | undefined, footwear: seen["footwear"] as string | undefined, carried: (Array.isArray(seen["carriedItems"]) ? (seen["carriedItems"] as string[]).join(", ") : (seen["carried"] as string | undefined)) } : null;
  if (!r) return "";
  const parts = [r.topColor && r.topColor !== "unknown" ? `${r.topColor} top` : "", r.bottomColor && r.bottomColor !== "unknown" ? `${r.bottomColor} bottom` : "", r.footwear ?? "", r.carried ? `carrying ${r.carried}` : ""];
  return parts.filter((p) => p !== "").join(", ");
}

type Props = {
  cards: readonly SightingCard[];
  segmentOf: (c: SightingCard) => string | null;
  /** Resolves with a line to show on the card when the decision rebuilt the prior with a change command should know. */
  onDecide: (c: SightingCard, decision: "confirmed" | "rejected") => Promise<string | void>;
  /** Starts a map pick for a report with no place (a family report); command's placement is then confirmed as usual. */
  onPlace?: (c: SightingCard) => void;
};

/** Sightings beside the profile: a person at command confirms or rejects each one. */
export function SightingsPanel({ cards, segmentOf, onDecide, onPlace }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function decide(c: SightingCard, d: "confirmed" | "rejected") {
    setBusy(c.sighting.eventId);
    setError(null);
    try {
      const note = await onDecide(c, d);
      if (typeof note === "string") setNotes((n) => ({ ...n, [c.sighting.eventId]: note }));
    } catch {
      setError({ id: c.sighting.eventId, text: "Not saved. Try again." });
    } finally {
      setBusy(null);
    }
  }

  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="sightings-h">
      <h2 id="sightings-h" className="label">Sightings</h2>
      <ul className="sightings">
        {cards.map((c) => {
          const seg = segmentOf(c);
          const id = c.sighting.eventId;
          return (
            <li key={id} className="sighting" data-testid={`sighting-${id}`}>
              <p>
                {c.camera ? `Camera clip from the family, last seen ${hhmm(c.sighting.observedAtMs)}. ` : `Seen ${hhmm(c.sighting.observedAtMs)}, reported by ${WHO[c.sighting.reporter] ?? "someone"}. `}
                {c.needsPlace ? (c.camera ? "Camera place not given." : "No place yet.") : seg ? `Segment ${seg}.` : ""}
              </p>
              {c.camera && c.status === "awaiting" && <p className="muted small">Confirming rebuilds the map from the camera's place.</p>}
              {clothing(c) && <p className="muted">{clothing(c)}</p>}
              {c.sighting.rawText && <p className="muted">"{c.sighting.rawText}"</p>}
              {c.outside && <p role="status">Sighting outside the search area. Consider moving the start point.</p>}
              {notes[id] && <p className="muted small" role="status">{notes[id]}</p>}
              {c.status === "awaiting" ? (
                <div className="row">
                  {c.needsPlace && onPlace && (
                    <button type="button" className="btn" onClick={() => onPlace(c)} disabled={busy !== null}>
                      {c.camera ? "Place camera" : "Place on map"}
                    </button>
                  )}
                  <button type="button" className={c.needsPlace ? "btn ghost" : "btn"} onClick={() => decide(c, "confirmed")} disabled={busy !== null || c.needsPlace}>
                    Confirm
                  </button>
                  <button type="button" className="btn ghost" onClick={() => decide(c, "rejected")} disabled={busy !== null}>
                    Reject
                  </button>
                </div>
              ) : (
                <p className="tag">{c.status === "confirmed" ? "Confirmed" : "Rejected"}</p>
              )}
              {error?.id === id && (
                <p className="error" role="alert">
                  {error.text}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
