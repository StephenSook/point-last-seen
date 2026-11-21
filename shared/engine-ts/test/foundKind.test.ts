import { describe, expect, it } from "vitest";
import vector from "../../test-vectors/found-kind.json";
import { correctFoundKind, FOUND_AS_CLUE_REASON, type ReportKind, type ReportReading } from "../src/index";
import { OBJECT_NOTE_WORDS, PERSON_WORDS } from "../src/found";

const BLANK: ReportReading = {
  kind: "found", segmentIds: [], method: "unknown", coverage: null, minutes: null, searchers: null, searchType: "unknown",
  detectionRangeM: null, item: "", feature: "none", direction: "unknown", topColor: "unknown", bottomColor: "unknown",
  footwear: "", carried: "", matchesProfile: "unknown", evidenceQuote: "",
};

type Case = { name: string; note: string; names: string[]; kindIn: ReportKind; kindOut: ReportKind; item?: string; feature?: string; corrected: boolean; parserKind: ReportKind };
const cases = vector.cases as Case[];

describe("a found reading checked against its note (shared/test-vectors/found-kind.json)", () => {
  it("has corrected and unchanged cases, and the reason the UI shows", () => {
    expect(cases.some((c) => c.corrected)).toBe(true);
    expect(cases.some((c) => !c.corrected && c.kindIn === "found")).toBe(true);
    expect(vector.reason).toBe(FOUND_AS_CLUE_REASON);
  });

  it.each(cases.map((c) => [c.name, c]))("%s", (_name, c) => {
    const reading: ReportReading = { ...BLANK, kind: c.kindIn };
    const out = correctFoundKind(reading, c.note, c.names);
    expect(out.reading.kind).toBe(c.kindOut);
    expect(out.corrected).toBe(c.corrected);
    expect(out.reason).toBe(c.corrected ? vector.reason : null);
    if (c.corrected) {
      expect(out.reading.item).toBe(c.item);
      expect(out.reading.feature).toBe(c.feature);
    } else {
      expect(out.reading).toEqual(reading);
    }
  });

  it("never changes the reading it was given", () => {
    const reading: ReportReading = { ...BLANK, kind: "found" };
    correctFoundKind(reading, "Found a blue coat by the creek in BO", []);
    expect(reading).toEqual({ ...BLANK, kind: "found" });
  });

  // A person-found note read as a clue is the one wrong answer that must never happen: every found object beside every
  // way a note says the person was found stays found.
  it("never corrects a note that also says the person was found, in any of many phrasings", () => {
    const objects = ["a coat", "a jacket", "the walker", "a shoe", "a cane", "some keys", "the glasses", "a backpack", "her coat", "his hat"];
    const people = [
      "she is sitting by the creek", "he is talking to us", "they are alive", "she's conscious", "the woman is hurt",
      "ambulance on the way", "she is ok", "he is okay", "she is fine", "he is awake", "she is responsive", "he is injured",
      "EMS on scene", "medic with him", "called 911 for her", "the man is cold but breathing", "a lady is with us",
      "he is dead", "she was located", "the subject is safe", "taking him to the hospital", "paramedics have them",
      "grandma nearby", "found mom too", "found Bea by the bench", "grandpa is with the team", "her husband is here",
      "my dad is sitting down", "nana answered", "found Bea", "and then found grandpa",
    ];
    for (const o of objects) {
      for (const p of people) {
        for (const note of [`Found ${o}, ${p}`, `Found ${o} and ${p}`, `Found ${o}. ${p}`]) {
          const out = correctFoundKind({ ...BLANK, kind: "found" }, note, []);
          expect(out.corrected, note).toBe(false);
          expect(out.reading.kind, note).toBe("found");
        }
      }
    }
  });

  // Generated notes pairing a found object with a family word, a name, or a second "found" about a person.
  it("never corrects an object found beside a family word, a name, or a second find of a person", () => {
    const objects = ["a coat", "the walker", "a shoe", "some keys", "her coat", "his hat", "a blue jacket"];
    const family = ["grandma", "grandpa", "grandmother", "grandfather", "granny", "nana", "papa", "mom", "mother", "dad", "father",
      "wife", "husband", "partner", "son", "daughter", "brother", "sister", "aunt", "uncle", "friend", "neighbor", "someone"];
    const names = ["Bea", "bea", "Arthur", "Rosa", "Mr. Kim", "Art", "Lee"];
    const people = [...family, ...names, "him", "her", "them", "the man", "the woman", "the person", "the patient", "the subject"];
    const shapes = (o: string, p: string) => [`Found ${o} and ${p} nearby`, `Found ${o}. Found ${p} too`, `Found ${o} near ${p}`,
      `Found ${o}, ${p} is here`, `found ${o}, then found ${p}`, `Found ${o} by the creek. ${p} by the bench`];
    let count = 0;
    for (const o of objects) {
      for (const p of people) {
        for (const note of shapes(o, p)) {
          for (const profile of [[], ["Arthur Lee"]]) {
            const out = correctFoundKind({ ...BLANK, kind: "found" }, note, profile);
            expect(out.corrected, note).toBe(false);
            count++;
          }
        }
      }
    }
    expect(count).toBeGreaterThan(2000);
  });

  it("no word that could name the person is ever an object-note word", () => {
    for (const w of PERSON_WORDS) expect(OBJECT_NOTE_WORDS.has(w), w).toBe(false);
  });

  it("each case's parserKind is what the phones' rules parser gives the note", () => {
    for (const c of cases) expect(parserKind(c.note), c.name).toBe(c.parserKind);
  });
});

// A test-only copy of the phones' rules parser's kind (ios/PLSCore/Sources/PLSCore/ReportParser.swift, kind), so the
// vectors' parserKind is checked here rather than assumed. It is not the product rule.
function parserKind(text: string): ReportKind {
  const w = (text.match(/[\p{L}\p{N}]+/gu) ?? []).map((t) => t.toLowerCase());
  const subject = new Set(["him", "her", "them", "subject", "person", "patient"]);
  const has = (words: string[]) => w.some((x) => words.includes(x));
  for (let i = 0; i < w.length; i++) {
    const next = w[i + 1] ?? "";
    const after = w[i + 2] ?? "";
    if ((w[i] === "found" || w[i] === "located") && (subject.has(next) || (next === "the" && subject.has(after)))) return "found";
    if (w[i] === "subject" && (next === "found" || next === "located")) return "found";
  }
  if (has(["cleared", "clear", "searched", "swept", "completed"])) return "cleared";
  for (let i = 0; i + 1 < w.length; i++) if (w[i] === "found" && ["a", "an", "some", "the"].includes(w[i + 1]!)) return "clue";
  if (has(["clue", "item", "track", "tracks", "footprint", "footprints", "prints", "dropped"])) return "clue";
  if (has(["saw", "seen", "sighting", "spotted", "sighted", "witness"])) return "sighting";
  return "unclear";
}
