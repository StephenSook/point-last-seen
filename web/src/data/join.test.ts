import { describe, expect, it } from "vitest";
import { joinErrorMessage, joinRequest } from "./join";

describe("joinRequest", () => {
  it("trims, upper-cases and drops spaces and hyphens from the code", () => {
    expect(joinRequest("I1", " ab12-cd34 ", "command")).toEqual({ incidentId: "I1", joinCode: "AB12CD34", role: "command" });
  });

  it("refuses a code that is not 8 characters after cleaning", () => {
    expect(() => joinRequest("I1", "ABC", "command")).toThrow(/8 characters/);
    expect(() => joinRequest("I1", "ABCDEFGHJ", "command")).toThrow(/8 characters/);
  });

  it("refuses an empty incident id", () => {
    expect(() => joinRequest(" ", "AB12CD34", "command")).toThrow(/incident/);
  });

  it("sends a team only for the searcher role", () => {
    expect(joinRequest("I1", "AB12CD34", "searcher", "T1")).toEqual({ incidentId: "I1", joinCode: "AB12CD34", role: "searcher", teamId: "T1" });
    expect(() => joinRequest("I1", "AB12CD34", "searcher")).toThrow(/team/);
    expect(joinRequest("I1", "AB12CD34", "command", "T1")).toEqual({ incidentId: "I1", joinCode: "AB12CD34", role: "command" });
  });
});

describe("joinErrorMessage", () => {
  const err = (code: string) => Object.assign(new Error("x"), { code });

  it("says App Check refused this browser instead of blaming the code", () => {
    expect(joinErrorMessage(err("functions/unauthenticated"))).toBe("Join refused by App Check. Try a normal browser window.");
  });

  it("keeps the wrong-code and no-connection messages", () => {
    expect(joinErrorMessage(err("functions/permission-denied"))).toBe("That code did not match this incident.");
    expect(joinErrorMessage(err("functions/unavailable"))).toBe("No connection. Try again when the link is back.");
    expect(joinErrorMessage(new Error("other"))).toBe("Could not join. Check the incident id and the code.");
  });
});
