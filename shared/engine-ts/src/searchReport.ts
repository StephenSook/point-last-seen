// Whether a sighting note reads as a search report: a team saying what it searched and found nothing, typed into the
// sighting form by mistake. With no model and the same answer on every platform (shared/test-vectors/search-report.json).
// English only. The form only warns: it never blocks a save, so a wrong answer costs a tap, never a sighting.

export const SEARCH_REPORT_LINE = "This reads as a search report, not a sighting.";

// A search result: one of these words, or one of these two-word phrases.
const RESULT_WORDS = new Set(["searched", "cleared", "swept", "combed"]);
const RESULT_PHRASES = [["no", "sign"], ["nothing", "found"], ["not", "found"], ["no", "trace"]];
// "Segment AB done", "segment 4 finished", "segment AE is complete".
const DONE = new Set(["done", "finished", "complete", "completed"]);
const SEGMENT_ID = /^(?:[a-z]{1,3}|\d{1,3})$/;
// What someone saw, heard or picked up: any of these makes the note a sighting. Pronouns are not here ("no sign of
// him" is a search report).
const SIGHTING = new Set([
  "saw", "seen", "spotted", "sighted", "caller", "walking", "heading", "wearing", "heard", "found",
  "footprint", "footprints", "track", "tracks", "shoe", "shoes", "clothing",
  "witness", "witnesses", "recognized", "recognised", "identified",
]);
// A sighting word within two words after one of these, in the same clause, does not count ("subject not seen", "no
// one saw"); "found" after "nothing" does not count either ("nothing found").
const NEGATIONS = new Set([
  "not", "never", "no", "nobody", "wasn't", "hasn't", "haven't", "hadn't", "didn't", "isn't", "weren't", "couldn't",
]);

// Lowercase, curly apostrophes as ', and a word is a run of a-z, 0-9 and ' with any ' at its ends trimmed (so a quoted
// 'saw' is the word saw, and wasn't keeps its own); everything else separates words.
function words(text: string): string[] {
  const runs = text.toLowerCase().replace(/[\u2018\u2019]/g, "'").match(/[a-z0-9']+/g) ?? [];
  return runs.map((r) => r.replace(/^'+|'+$/g, "")).filter((r) => r !== "");
}

// A clause ends at . ! ? ; : , a line break, an en or em dash, or a hyphen with a space on each side: a negation looks
// back only inside its own clause, so "no sign. Footprints at the creek." keeps its footprints.
function clauses(note: string): string[][] {
  return note.split(/[.!?;:,\n\r\u2013\u2014]|\s-\s/).map(words).filter((w) => w.length > 0);
}

function hasResult(w: readonly string[]): boolean {
  if (w.some((x) => RESULT_WORDS.has(x))) return true;
  if (RESULT_PHRASES.some(([a, b]) => w.some((x, i) => x === a && w[i + 1] === b))) return true;
  return w.some((x, i) => x === "segment" && SEGMENT_ID.test(w[i + 1] ?? "")
    && (DONE.has(w[i + 2] ?? "") || ((w[i + 2] === "is" || w[i + 2] === "was") && DONE.has(w[i + 3] ?? ""))));
}

function hasSighting(w: readonly string[]): boolean {
  return w.some((x, i) => {
    if (!SIGHTING.has(x)) return false;
    const before = [w[i - 1], w[i - 2]];
    if (before.some((b) => b !== undefined && NEGATIONS.has(b))) return false;
    return !(x === "found" && before.includes("nothing"));
  });
}

/** True when the note names a search result and nothing seen, heard or found. */
export function readsAsSearchReport(note: string): boolean {
  return hasResult(words(note)) && !clauses(note).some(hasSighting);
}
