import { describe, expect, it } from "vitest";
import { parseRotation, rotateErrorMessage } from "./joinCodes";

const refused = (reason: string | undefined, code = "functions/failed-precondition") => Object.assign(new Error("refused"), { code, details: reason ? { reason } : undefined });

describe("parseRotation: the server's answer to a code replacement", () => {
  it("takes a new code of eight join-code characters for the role asked, with the number of codes it replaced", () => {
    expect(parseRotation({ code: "7K3M9QX2", role: "searcher", replaced: 1 }, "searcher")).toEqual({ code: "7K3M9QX2", role: "searcher", replaced: 1 });
    expect(parseRotation({ code: "0123ABCD", role: "family", replaced: 0 }, "family")).toEqual({ code: "0123ABCD", role: "family", replaced: 0 });
  });

  it("refuses an answer that is not one: a malformed code, the wrong role, or a count that is not a whole number", () => {
    expect(() => parseRotation({ code: "7K3M9QX", role: "searcher", replaced: 1 }, "searcher")).toThrow();
    expect(() => parseRotation({ code: "7K3M9QXI", role: "searcher", replaced: 1 }, "searcher")).toThrow();
    expect(() => parseRotation({ code: "7K3M9QX2", role: "family", replaced: 1 }, "searcher")).toThrow();
    expect(() => parseRotation({ code: "7K3M9QX2", role: "searcher", replaced: -1 }, "searcher")).toThrow();
    expect(() => parseRotation(null, "searcher")).toThrow();
  });
});

describe("rotateErrorMessage: the sentence for a refused replacement", () => {
  it("names the server's reason in plain words", () => {
    expect(rotateErrorMessage(refused("not_command", "functions/permission-denied"))).toBe("Only command can replace a join code.");
    expect(rotateErrorMessage(refused("practice_search"))).toBe("A practice search has no join codes.");
    expect(rotateErrorMessage(refused("not_open"))).toBe("This search has ended, so it takes no new members.");
    expect(rotateErrorMessage(refused("collision", "functions/aborted"))).toBe("Could not make a new code. Try again.");
    expect(rotateErrorMessage(refused("bad_role", "functions/invalid-argument"))).toBe("Only a searcher or family code can be replaced.");
    expect(rotateErrorMessage(refused("bad_incident_id", "functions/invalid-argument"))).toBe("This search's link is not valid. Reload the page.");
    expect(rotateErrorMessage(refused("not_signed_in", "functions/unauthenticated"))).toBe("Refused: sign-in or App Check. Reload the page and try again.");
  });

  it("never blames the person for a refused sign-in, a dropped link or an answer it could not read", () => {
    expect(rotateErrorMessage(refused(undefined, "functions/unauthenticated"))).toBe("Refused: sign-in or App Check. Reload the page and try again.");
    expect(rotateErrorMessage(refused(undefined, "functions/unavailable"))).toBe("No connection. Try again when the link is back.");
    expect(rotateErrorMessage(new Error("odd answer"))).toBe("Could not replace the code. Try again.");
  });
});
