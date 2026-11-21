import { describe, expect, it } from "vitest";
import { removeErrorMessage } from "./members";

const err = (code: string, reason?: string) => Object.assign(new Error("x"), { code: `functions/${code}`, details: reason ? { reason } : undefined });

describe("removeErrorMessage: why a removal failed, in the words command needs", () => {
  it("names each refusal the server gives", () => {
    expect(removeErrorMessage(err("failed-precondition", "self"))).toBe("You cannot remove yourself.");
    expect(removeErrorMessage(err("permission-denied", "command_target"))).toBe("Command cannot be removed.");
    expect(removeErrorMessage(err("permission-denied", "not_command"))).toBe("Only command can remove someone.");
    expect(removeErrorMessage(err("not-found", "not_member"))).toBe("That person is no longer in this search.");
  });
  it("never blames the person for an App Check or network failure", () => {
    expect(removeErrorMessage(err("unauthenticated"))).toBe("Refused by App Check. Try a normal browser window.");
    expect(removeErrorMessage(err("unavailable"))).toBe("No connection. Try again when the link is back.");
    expect(removeErrorMessage(new Error("boom"))).toBe("Could not remove them. Try again.");
    expect(removeErrorMessage(null)).toBe("Could not remove them. Try again.");
  });
});
