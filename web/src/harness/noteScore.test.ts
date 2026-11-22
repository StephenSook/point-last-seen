import { describe, expect, it } from "vitest";
import { scoreNote, type NoteFields } from "./noteScore";

const blank: NoteFields = { direction: "unknown", topColor: "unknown", bottomColor: "unknown", footwear: "", carried: "" };

describe("scoreNote", () => {
  it("counts a stated list field right only on the exact value", () => {
    const s = scoreNote({ direction: "n", bottomColor: "gray" }, { ...blank, direction: "n", bottomColor: "unknown" });
    expect(s).toMatchObject({ stated: 2, right: 1, misses: ["bottomColor"] });
  });

  it("counts stated free text right ignoring case, spaces and a leading article, never on part of it", () => {
    expect(scoreNote({ carried: "brown bag" }, { ...blank, carried: " A Brown bag " }).right).toBe(1);
    expect(scoreNote({ carried: "brown bag" }, { ...blank, carried: "bag" }).misses).toEqual(["carried"]);
  });

  it("lists every field the note does not state that the reading filled; unknown and empty are not filled", () => {
    const s = scoreNote({}, { ...blank, direction: "n", carried: "radio" });
    expect(s).toMatchObject({ stated: 0, right: 0, unstatedFilled: ["direction", "carried"] });
    expect(scoreNote({}, blank).unstatedFilled).toEqual([]);
  });

  it("leaves a skipped field out of both counts", () => {
    const s = scoreNote({ direction: "w" }, { ...blank, direction: "w", carried: "small dog" }, ["carried"]);
    expect(s).toMatchObject({ stated: 1, right: 1, unstatedFilled: [] });
  });

  it("scores a refused read as every stated field missed and nothing filled", () => {
    expect(scoreNote({ direction: "e" }, null)).toEqual({ stated: 1, right: 0, misses: ["direction"], unstatedFilled: [] });
  });
});
