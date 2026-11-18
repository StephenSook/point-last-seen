import { describe, expect, it } from "vitest";
import { deletedLine, deleteMediaMessage, deleteQuestion } from "./media";

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
  it("states what the server removed", () => {
    expect(deletedLine(7)).toBe("Deleted 7 items: clips, photos and their readings.");
    expect(deletedLine(1)).toBe("Deleted 1 item: clips, photos and their readings.");
  });
});

describe("deleteMediaMessage", () => {
  it("shows the server's own reason for a refusal", () => {
    expect(deleteMediaMessage(fbErr("functions/permission-denied", "Only the incident's command can delete its media."))).toBe("Only the incident's command can delete its media.");
    expect(deleteMediaMessage(fbErr("functions/unauthenticated", "Sign in before deleting an incident's media."))).toBe("Sign in before deleting an incident's media.");
  });
  it("names a lost connection, and is plain otherwise", () => {
    expect(deleteMediaMessage(fbErr("functions/unavailable", "x"))).toBe("No connection. Nothing was deleted. Try again when the link is back.");
    expect(deleteMediaMessage(new Error("boom"))).toBe("The clips and photos were not deleted. Try again.");
  });
});
