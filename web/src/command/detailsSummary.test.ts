import { describe, expect, it } from "vitest";
import { detailsSummary, newFamilyAnswers, photosToReview } from "./detailsSummary";

describe("the rail's Details summary", () => {
  it("is just Details when nothing there needs a person", () => {
    expect(detailsSummary({ conditions: null, photosToReview: 0, newAnswers: 0 })).toBe("Details");
  });

  it("counts what needs a person, in the singular and the plural", () => {
    expect(detailsSummary({ conditions: null, photosToReview: 1, newAnswers: 0 })).toBe("Details: 1 photo to review.");
    expect(detailsSummary({ conditions: null, photosToReview: 2, newAnswers: 1 })).toBe("Details: 2 photos to review, 1 family answer.");
    expect(detailsSummary({ conditions: null, photosToReview: 0, newAnswers: 3 })).toBe("Details: 3 family answers.");
  });

  it("shows the conditions' reading once they are set, before the counts", () => {
    expect(detailsSummary({ conditions: { tempF: 38, wet: false, setAtMs: 1 }, photosToReview: 0, newAnswers: 0 })).toBe("Details: 38 °F, wet: no.");
    expect(detailsSummary({ conditions: { tempF: null, wet: true, setAtMs: 1 }, photosToReview: 2, newAnswers: 1 })).toBe(
      "Details: temperature not known, wet: yes. 2 photos to review, 1 family answer.",
    );
  });
});

describe("what the counts count", () => {
  it("a family photo needs review until command has saved a reading of it", () => {
    const photos = [{ sha256: "a" }, { sha256: "b" }, { sha256: "c" }];
    expect(photosToReview(photos, new Set(["b"]))).toBe(2);
    expect(photosToReview(photos, new Set(["a", "b", "c"]))).toBe(0);
    expect(photosToReview([], new Set())).toBe(0);
  });

  it("a family answer is new until command opens Details after it arrived", () => {
    const q = (id: string, atMs: number | null, answered = true) => ({ id, text: "?", askedAtMs: 0, answer: answered ? { text: "yes", atMs } : null });
    const questions = [q("1", 100), q("2", 300), q("3", null), q("4", 500, false)];
    expect(newFamilyAnswers(questions, 0)).toBe(3);
    expect(newFamilyAnswers(questions, 200)).toBe(2);
    // An answer whose server time has not arrived yet counts as new: it is surfaced, never hidden.
    expect(newFamilyAnswers(questions, 400)).toBe(1);
    expect(newFamilyAnswers(questions.filter((x) => x.id !== "3"), 400)).toBe(0);
  });
});
