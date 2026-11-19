import { serverTimestamp, Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { newQuestionDoc, parseQuestion, QUESTION_TEMPLATES, questionFromDoc, searchStateOf } from "./familyQuestions";

describe("asking the family", () => {
  it("offers three plain templates", () => {
    expect(QUESTION_TEMPLATES).toEqual(["Did they ever go by another name?", "Places they used to walk or live?", "What were they wearing when you last saw them?"]);
  });
  it("takes a question of 1 to 280 characters, trimmed", () => {
    expect(parseQuestion("  Where did they work?  ")).toEqual({ ok: true, text: "Where did they work?" });
    expect(parseQuestion("   ")).toEqual({ ok: false, message: "Type a question first." });
    expect(parseQuestion("x".repeat(281))).toEqual({ ok: false, message: "A question is 280 characters at most." });
  });
  it("writes the text, the writer and the server's time, nothing else", () => {
    const d = newQuestionDoc("Where did they work?", "u1") as Record<string, unknown>;
    expect(Object.keys(d).sort()).toEqual(["createdAt", "createdByUid", "text"]);
    expect((d["createdAt"] as ReturnType<typeof serverTimestamp>).isEqual(serverTimestamp())).toBe(true);
  });
});

describe("reading questions and answers", () => {
  it("reads a question and, when present, the family's answer", () => {
    expect(questionFromDoc("q1", { text: "Where did they work?", createdByUid: "u1", createdAt: Timestamp.fromMillis(5) })).toEqual({ id: "q1", text: "Where did they work?", askedAtMs: 5, answer: null });
    expect(questionFromDoc("q1", { text: "Where did they work?", createdByUid: "u1", createdAt: Timestamp.fromMillis(5), answer: "The bakery on Main", answeredByUid: "f1", answeredAt: Timestamp.fromMillis(9) })).toEqual({
      id: "q1", text: "Where did they work?", askedAtMs: 5, answer: { text: "The bakery on Main", atMs: 9 },
    });
  });
  it("is null for a document that is not a question", () => {
    expect(questionFromDoc("q1", { createdByUid: "u1" })).toBeNull();
  });
});

describe("search state", () => {
  it("reads only the two states the family is told", () => {
    expect(searchStateOf({ searchState: "searching" })).toBe("searching");
    expect(searchStateOf({ searchState: "paused" })).toBe("paused");
    expect(searchStateOf({ searchState: "found" })).toBeNull();
    expect(searchStateOf({})).toBeNull();
  });
});
