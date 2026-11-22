import { describe, expect, it } from "vitest";
import { APP_CHECK_JOIN_LINE, joinErrorMessage, joinOffersReload, joinRequest, signInErrorMessage } from "./join";

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

  it("says this browser failed the security check and to reload, instead of blaming the code", () => {
    expect(joinErrorMessage(err("functions/unauthenticated"))).toBe(
      "This browser did not pass the site's security check. Reload the page and try again; if it fails again, try a normal browser window.",
    );
    expect(joinErrorMessage(err("functions/unauthenticated"))).toBe(APP_CHECK_JOIN_LINE);
  });

  it("offers a reload for the security check refusal only", () => {
    expect(joinOffersReload(joinErrorMessage(err("functions/unauthenticated")))).toBe(true);
    for (const code of ["functions/permission-denied", "functions/resource-exhausted", "functions/unavailable", "functions/internal"]) {
      expect(joinOffersReload(joinErrorMessage(err(code)))).toBe(false);
    }
    expect(joinOffersReload("Enter the incident id.")).toBe(false);
  });

  it("names the join limit (10 attempts an hour) instead of blaming the code", () => {
    expect(joinErrorMessage(err("functions/resource-exhausted"))).toBe("Too many join attempts from this browser. Try again in an hour.");
  });

  it("keeps the wrong-code and no-connection messages", () => {
    expect(joinErrorMessage(err("functions/permission-denied"))).toBe("That code did not match this incident.");
    expect(joinErrorMessage(err("functions/unavailable"))).toBe("No connection. Try again when the link is back.");
    expect(joinErrorMessage(new Error("other"))).toBe("Could not join. Check the incident id and the code.");
  });
});

describe("signInErrorMessage", () => {
  const authErr = (code: string) => Object.assign(new Error(code), { code });
  it("names Firebase Auth's sign-up limit for this network", () => {
    expect(signInErrorMessage(authErr("auth/too-many-requests"))).toBe("Too many sign-ins from this network. Try again later.");
  });
  it("names a lost connection", () => {
    expect(signInErrorMessage(authErr("auth/network-request-failed"))).toBe("No connection. Try again when the link is back.");
  });
  it("otherwise says sign-in failed and offers a retry", () => {
    expect(signInErrorMessage(new Error("x"))).toBe("Could not sign in. Try again.");
  });
});

describe("joinErrorField: which field a join error is about", () => {
  it("puts each error beside the field it names, and the rest under the form", async () => {
    const { joinErrorField } = await import("./join");
    expect(joinErrorField("Enter the incident id.")).toBe("incident");
    expect(joinErrorField("The join code has 8 characters.")).toBe("code");
    expect(joinErrorField("That code did not match this incident.")).toBe("code");
    expect(joinErrorField("No connection. Try again when the link is back.")).toBeNull();
    expect(joinErrorField("Could not join. Check the incident id and the code.")).toBeNull();
  });
});
