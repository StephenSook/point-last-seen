// Checks a model's "found" against its note (shared/test-vectors/found-kind.json). A model can read "Found a blue
// coat by the creek" as the person found: the command post then says Found, and the coat's clue value is lost.
//
// A person-found note read as a clue is the one wrong answer that must never happen, so the rule is conservative by
// construction: it corrects only a note made entirely of words it knows to describe an object (OBJECT_NOTE_WORDS),
// where every "found" is followed by a determiner and a known object, and no word names a person (PERSON_WORDS, a
// profile name). Any other note, including one with a single unknown word, keeps the model's kind. The corrected
// reading takes its item and place from the note the way the phones' rules parser reads them (ReportParser), and the
// reason, shown in the UI and the receipt, says the model said found.
import groundingWords from "../../constants/grounding-words.json";
import type { Feature, ReportReading } from "./types";

export const FOUND_AS_CLUE_REASON = "Read as a clue: an object was found, not the person. The model said found; check the note.";

// Words that could mean the person was found: pronouns and the rules parser's subject words, words for a person, family
// and relations, the person's state, and the response to a found person. None is ever an object-note word (the engine
// test checks the two lists never share a word); "her" is also a possessive (see possessiveHer).
export const PERSON_WORDS: ReadonlySet<string> = new Set([
  "he", "she", "they", "him", "her", "them", "subject", "person", "patient", "someone", "somebody",
  "man", "woman", "lady", "gentleman", "guy", "boy", "girl", "child", "kid", "baby", "toddler", "teen", "mr", "mrs", "ms",
  "sir", "body", "victim",
  "grandma", "grandpa", "grandmother", "grandfather", "granny", "nana", "papa", "mom", "mum", "mama", "mother", "dad",
  "father", "wife", "husband", "partner", "aunt", "uncle", "sister", "brother", "son", "daughter", "grandson",
  "granddaughter", "niece", "nephew", "cousin", "friend", "neighbor",
  "located", "safe", "alive", "conscious", "unconscious", "awake", "alert", "responsive", "unresponsive", "talking",
  "breathing", "hurt", "injured", "bleeding", "ok", "okay", "fine", "dead", "deceased", "hypothermic", "rescued",
  "sitting", "standing", "walking", "wandering", "sleeping", "crying",
  "ambulance", "ems", "medic", "medics", "paramedic", "paramedics", "911", "hospital", "cpr",
]);
// Things a person drops or leaves behind. A "found a man" or "found a woman" is not one, so it is never corrected.
const OBJECTS = new Set([
  "coat", "jacket", "shoe", "shoes", "hat", "cap", "glove", "gloves", "mitten", "mittens", "bag", "backpack", "purse", "handbag",
  "phone", "wallet", "keys", "key", "scarf", "glasses", "sunglasses", "cane", "walker", "id", "badge", "slipper", "slippers",
  "boot", "boots", "sandal", "sandals", "sock", "socks", "sweater", "hoodie", "shirt", "blanket", "umbrella", "watch",
  "bracelet", "card", "cards", "belt", "hearing", "aid", "dentures", "pill", "pills", "medication", "bottle",
]);
// The rules parser's determiners after "found", and the possessives ("found his glasses", "found her coat").
const DETERMINERS = new Set(["a", "an", "some", "the", "his", "their"]);
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
// Every word an object-found note may hold: the lists above, the shared colour and direction words, clue words, and a
// short list of words for where and what state the object is in.
export const OBJECT_NOTE_WORDS: ReadonlySet<string> = new Set([
  "found", ...DETERMINERS, ...OBJECTS, ...STOP_WORDS, ...FEATURES.flatMap(([, w]) => w),
  ...Object.values(groundingWords.colorWords as Record<string, string[]>).flat(),
  ...Object.values(groundingWords.directionWords as Record<string, string[]>).flat(),
  "clue", "clues", "item", "track", "tracks", "footprint", "footprints", "print", "prints", "dropped",
  "then", "also", "it", "its", "was", "were", "is", "are", "there", "here", "nearby", "just", "one", "two", "three", "pair",
  "small", "large", "big", "little", "old", "torn", "wet", "muddy", "dirty", "broken", "ripped", "left", "lying",
  "side", "edge", "bank", "base", "top", "bottom", "end", "middle", "this", "that", "area", "segment", "team", "we", "our",
  "feet", "ft", "foot", "meters", "metres", "yards", "about", "around", "behind", "inside", "outside", "over", "past",
  "along", "across", "off", "up", "down", "into", "onto", "toward", "towards", "ago", "min", "mins", "minutes",
]);
const ITEM_MAX = 40;
// A segment id as the grid writes it (AA to MZ), typed in capitals inside a note that is not all capitals.
const SEGMENT_CODE = /^[A-Z]{2}$/;

type Token = { word: string; raw: string; start: number; end: number };

/** Runs of letters and digits, lowercased, with where each sits in the note ("she's" is "she" and "s"). */
function tokens(text: string): Token[] {
  const out: Token[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) out.push({ word: m[0].toLowerCase(), raw: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

function words(text: string): string[] {
  return tokens(text).map((t) => t.word);
}

/** "her" right before a known object with only spaces between ("her coat"), so not the person ("found her, coat"). */
function possessiveHer(t: readonly Token[], i: number, note: string): boolean {
  const next = t[i + 1];
  return t[i]!.word === "her" && next !== undefined && OBJECTS.has(next.word) && /^\s+$/.test(note.slice(t[i]!.end, next.start));
}

/** The words after "found a/an/some/the/his/their/her" at t[i], up to three, stopping at a place word or a number. */
function itemAfter(t: readonly Token[], i: number, note: string): string[] {
  if (i + 1 >= t.length || !(DETERMINERS.has(t[i + 1]!.word) || possessiveHer(t, i + 1, note))) return [];
  const out: string[] = [];
  for (let j = i + 2; j < t.length && out.length < 3 && !STOP_WORDS.has(t[j]!.word) && /^\p{L}/u.test(t[j]!.word); j++) out.push(t[j]!.word);
  return out;
}

/**
 * The first found item, when every "found" in the note is followed by a determiner and a known object. Null when
 * any "found" is not ("found mom", "found Bea", "found him"): whatever it found may be the person.
 */
function foundItem(t: readonly Token[], note: string): string[] | null {
  const items = t.flatMap((x, i) => (x.word === "found" ? [itemAfter(t, i, note)] : []));
  if (items.length === 0 || items.some((item) => !item.some((w) => OBJECTS.has(w)))) return null;
  return items[0]!;
}

/** True only when every word is one an object-found note may hold, and none could name the person. */
function onlyObjectWords(t: readonly Token[], note: string, names: readonly string[]): boolean {
  const nameWords = new Set(names.flatMap(words));
  const trustCodes = /\p{Ll}/u.test(note);
  return t.every((x, i) => {
    if (nameWords.has(x.word)) return false;
    if (x.word === "her") return possessiveHer(t, i, note);
    if (PERSON_WORDS.has(x.word)) return false;
    return OBJECT_NOTE_WORDS.has(x.word) || /^\p{N}+$/u.test(x.word) || (trustCodes && SEGMENT_CODE.test(x.raw));
  });
}

/**
 * A reading the model read as "found", checked against its note and the missing person's names. Returns the reading
 * to store, whether it was changed, and the reason to show when it was.
 */
export function correctFoundKind(reading: ReportReading, note: string, names: readonly string[]): { reading: ReportReading; corrected: boolean; reason: string | null } {
  const unchanged = { reading, corrected: false, reason: null };
  if (reading.kind !== "found") return unchanged;
  const t = tokens(note);
  const item = foundItem(t, note);
  if (item === null || !onlyObjectWords(t, note, names)) return unchanged;
  const feature = FEATURES.find(([, place]) => t.some((x) => place.includes(x.word)))?.[0] ?? "none";
  return { reading: { ...reading, kind: "clue", item: item.join(" ").slice(0, ITEM_MAX), feature }, corrected: true, reason: FOUND_AS_CLUE_REASON };
}
