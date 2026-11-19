import { describe, expect, it } from "vitest";
import { deletedLine, deleteFailure, deleteQuestion, readDeletedCount, UNCONFIRMED } from "./media";

const fbErr = (code: string, message: string) => Object.assign(new Error(message), { code });

describe("deleteQuestion", () => {
  it("names the counts and says it cannot be undone", () => {
    expect(deleteQuestion({ clips: 4, photos: 3, records: 7 })).toBe("Delete 4 clips and 3 photos for this search? This can't be undone.");
    expect(deleteQuestion({ clips: 1, photos: 1, records: 0 })).toBe("Delete 1 clip and 1 photo for this search? This can't be undone.");
    expect(deleteQuestion({ clips: 0, photos: 2, records: 2 })).toBe("Delete 0 clips and 2 photos for this search? This can't be undone.");
  });
  it("still asks when only saved records remain (a clip whose upload failed leaves its consent record)", () => {
    expect(deleteQuestion({ clips: 0, photos: 0, records: 2 })).toBe("Delete 2 saved records for this search's clips and photos? This can't be undone.");
    expect(deleteQuestion({ clips: 0, photos: 0, records: 1 })).toBe("Delete 1 saved record for this search's clips and photos? This can't be undone.");
  });
  it("asks nothing when there is nothing to delete", () => {
    expect(deleteQuestion({ clips: 0, photos: 0, records: 0 })).toBeNull();
  });
});

describe("deletedLine", () => {
  it("gives the server's number as the server's: two deletes at once can both count the same files", () => {
    expect(deletedLine(7)).toBe("The server reports 7 items deleted: clips, photos and their readings.");
    expect(deletedLine(1)).toBe("The server reports 1 item deleted: clips, photos and their readings.");
  });
  it("does not invent a count the server did not send", () => {
    expect(deletedLine(null)).toBe("The delete finished, but the server did not say how many items it removed.");
  });
});

describe("readDeletedCount", () => {
  it("takes a whole, non-negative count and nothing else", () => {
    expect(readDeletedCount({ deleted: 7 })).toBe(7);
    expect(readDeletedCount({ deleted: 0 })).toBe(0);
    expect(readDeletedCount({})).toBeNull();
    expect(readDeletedCount({ deleted: "7" })).toBeNull();
    expect(readDeletedCount({ deleted: -1 })).toBeNull();
    expect(readDeletedCount(null)).toBeNull();
  });
});

describe("deleteFailure", () => {
  it("shows the server's own refusal, which it gives before deleting anything", () => {
    expect(deleteFailure(fbErr("functions/permission-denied", "Only the incident's command can delete its media."))).toEqual({ text: "Only the incident's command can delete its media.", unconfirmed: false });
    expect(deleteFailure(fbErr("functions/unauthenticated", "Sign in before deleting an incident's media."))).toEqual({ text: "Sign in before deleting an incident's media.", unconfirmed: false });
  });
  it("calls any other failure unconfirmed: the server deletes in steps and its reply can be lost", () => {
    expect(deleteFailure(fbErr("functions/unavailable", "x"))).toEqual({ text: UNCONFIRMED, unconfirmed: true });
    expect(deleteFailure(fbErr("functions/internal", "x"))).toEqual({ text: UNCONFIRMED, unconfirmed: true });
    expect(deleteFailure(fbErr("functions/permission-denied", "some other sentence"))).toEqual({ text: UNCONFIRMED, unconfirmed: true });
    expect(deleteFailure(new Error("boom"))).toEqual({ text: UNCONFIRMED, unconfirmed: true });
    expect(UNCONFIRMED).toBe("The server did not confirm the delete. This shows what is stored now.");
  });
});
