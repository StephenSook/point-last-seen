import { describe, expect, it } from "vitest";
import vector from "../../test-vectors/found-kind.json";
import { correctFoundKind, FOUND_AS_CLUE_REASON, type ReportKind, type ReportReading } from "../src/index";

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
