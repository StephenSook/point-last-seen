import { useState } from "react";
import type { SightingCard } from "./sightingCards";

const hhmm = (ms: number | null) => (ms === null ? "time not given" : new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }));
const WHO: Record<string, string> = { public_caller: "a caller", family: "the family", searcher: "a searcher", camera: "a camera", system: "the system" };

function clothing(c: SightingCard): string {
  const r = c.sighting.reading as { topColor?: string; bottomColor?: string; footwear?: string; carried?: string } | null;
  if (!r) return "";
  const parts = [r.topColor && r.topColor !== "unknown" ? `${r.topColor} top` : "", r.bottomColor && r.bottomColor !== "unknown" ? `${r.bottomColor} bottom` : "", r.footwear ?? "", r.carried ? `carrying ${r.carried}` : ""];
  return parts.filter((p) => p !== "").join(", ");
}

type Props = {
  cards: readonly SightingCard[];
  segmentOf: (c: SightingCard) => string | null;
  onDecide: (c: SightingCard, decision: "confirmed" | "rejected") => Promise<void>;
};

/** Sightings beside the profile: a person at command confirms or rejects each one. */
export function SightingsPanel({ cards, segmentOf, onDecide }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  async function decide(c: SightingCard, d: "confirmed" | "rejected") {
    setBusy(c.sighting.eventId);
    setError(null);
    try {
      await onDecide(c, d);
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
                Seen {hhmm(c.sighting.observedAtMs)}, reported by {WHO[c.sighting.reporter] ?? "someone"}.{" "}
                {c.needsPlace ? "No place yet." : seg ? `Segment ${seg}.` : ""}
              </p>
              {clothing(c) && <p className="muted">{clothing(c)}</p>}
              {c.sighting.rawText && <p className="muted">"{c.sighting.rawText}"</p>}
              {c.outside && <p role="status">Sighting outside the search area. Consider moving the start point.</p>}
              {c.status === "awaiting" ? (
                <div className="row">
                  <button type="button" className="btn" onClick={() => decide(c, "confirmed")} disabled={busy !== null || c.needsPlace}>
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
