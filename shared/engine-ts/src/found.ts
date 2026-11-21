// Checks a model's "found" against its note (shared/test-vectors/found-kind.json). A model can read "Found a blue
// coat by the creek" as the person found: the command post then says Found, and the coat's clue value is lost. When
// the note says an object was found and nothing in it says the person was, the reading becomes a clue, its item and
// place read from the note the way the phones' rules parser reads them (ReportParser), and the reason is returned for
// the UI and the receipt. Any other reading comes back unchanged: a possible person-found is never downgraded.
import type { Feature, ReportReading } from "./types";

export const FOUND_AS_CLUE_REASON = "Read as a clue: an object was found, not the person.";

// The rules parser's subject words, then words that only a person found would bring.
const PERSON_WORDS = new Set(["him", "her", "them", "subject", "person", "patient", "located", "safe", "breathing"]);
const PERSON_PHRASES = [["with", "us"]];
// Things a person drops or leaves behind. A "found a man" or "found a woman" is not one, so it is never corrected.
const OBJECTS = new Set([
  "coat", "jacket", "shoe", "shoes", "hat", "cap", "glove", "gloves", "mitten", "mittens", "bag", "backpack", "purse", "handbag",
  "phone", "wallet", "keys", "key", "scarf", "glasses", "sunglasses", "cane", "walker", "id", "badge", "slipper", "slippers",
  "boot", "boots", "sandal", "sandals", "sock", "socks", "sweater", "hoodie", "shirt", "blanket", "umbrella", "watch",
  "bracelet", "card", "cards", "belt", "hearing", "aid", "dentures", "pill", "pills", "medication", "bottle",
]);
const DETERMINERS = new Set(["a", "an", "some", "the"]);
// The rules parser's words that end an item, and its place words.
const STOP_WORDS = new Set(["by", "near", "in", "on", "at", "under", "next", "beside", "and", "with", "from", "to", "of", "heading", "close"]);
const FEATURES: [Feature, string[]][] = [
  ["creek_or_drainage", ["creek", "stream", "drainage", "ditch", "gully", "brook", "culvert", "creekbed"]],
  ["water", ["pond", "lake", "river", "water", "swamp", "marsh"]],
  ["road", ["road", "street", "highway", "driveway"]],
  ["trail", ["trail", "path", "footpath"]],
  ["structure", ["house", "shed", "barn", "building", "structure", "cabin", "garage"]],
  ["brush", ["brush", "bushes", "bush", "thicket", "briars"]],
  ["woods", ["woods", "forest", "trees", "treeline"]],
  ["field", ["field", "meadow", "pasture", "clearing"]],
];
const ITEM_MAX = 40;

function words(text: string): string[] {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => w.toLowerCase());
}

/** The words after the first "found a/an/some/the", up to three, stopping at a place word or a number. */
function foundItem(w: readonly string[]): string[] {
  for (let i = 0; i + 1 < w.length; i++) {
    if (w[i] !== "found" || !DETERMINERS.has(w[i + 1]!)) continue;
    const out: string[] = [];
    for (let j = i + 2; j < w.length && out.length < 3 && !STOP_WORDS.has(w[j]!) && /^\p{L}/u.test(w[j]!); j++) out.push(w[j]!);
    if (out.length > 0) return out;
  }
  return [];
}

function personFound(w: readonly string[], names: readonly string[]): boolean {
  const nameWords = new Set(names.flatMap(words));
  if (w.some((x) => PERSON_WORDS.has(x) || nameWords.has(x))) return true;
  return PERSON_PHRASES.some((p) => w.some((_, i) => p.every((x, k) => w[i + k] === x)));
}

/**
 * A reading the model read as "found", checked against its note and the missing person's names. Returns the reading
 * to store, whether it was changed, and the reason to show when it was.
 */
export function correctFoundKind(reading: ReportReading, note: string, names: readonly string[]): { reading: ReportReading; corrected: boolean; reason: string | null } {
  const unchanged = { reading, corrected: false, reason: null };
  if (reading.kind !== "found") return unchanged;
  const w = words(note);
  const item = foundItem(w);
  if (!item.some((x) => OBJECTS.has(x)) || personFound(w, names)) return unchanged;
  const feature = FEATURES.find(([, place]) => w.some((x) => place.includes(x)))?.[0] ?? "none";
  return { reading: { ...reading, kind: "clue", item: item.join(" ").slice(0, ITEM_MAX), feature }, corrected: true, reason: FOUND_AS_CLUE_REASON };
}
