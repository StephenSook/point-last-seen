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
    expect(removeErrorMessage(err("unauthenticated"))).toBe("Refused: sign-in or App Check. Reload the page and try again.");
    expect(removeErrorMessage(err("unavailable"))).toBe("No connection. Try again when the link is back.");
    expect(removeErrorMessage(new Error("boom"))).toBe("Could not remove them. Try again.");
    expect(removeErrorMessage(null)).toBe("Could not remove them. Try again.");
  });
});

describe("memberRows: who command can remove", () => {
  const teams = [{ teamId: "T1", name: "Team 1" }, { teamId: "T2", name: "Team 2" }];
  it("lists the members records, never command, and labels by team", async () => {
    const { memberRows } = await import("./members");
    const rows = memberRows(
      { u1: { role: "searcher", team: "T1" }, f1: { role: "family", team: null }, c1: { role: "command", team: null }, u2: { role: "searcher", team: "T2" } },
      new Set(),
      teams,
    );
    expect(rows.map((r) => [r.uid, r.label, r.removed])).toEqual([
      ["f1", "Family member", false],
      ["u1", "Team 1 searcher", false],
      ["u2", "Team 2 searcher", false],
    ]);
  });
  it("an account with no members record is not listed, so someone who left (record deleted) is gone", async () => {
    const { memberRows } = await import("./members");
    const rows = memberRows({ u1: { role: "searcher", team: "T1" } }, new Set(), teams);
    expect(rows.map((r) => r.uid)).toEqual(["u1"]);
    expect(memberRows({}, new Set(["gone"]), teams)).toEqual([]);
  });
  it("two searchers on one team are told apart by the end of their id", async () => {
    const { memberRows } = await import("./members");
    const rows = memberRows({ "aaaa1111": { role: "searcher", team: "T1" }, "bbbb2222": { role: "searcher", team: "T1" } }, new Set(), teams);
    expect(rows.map((r) => r.label)).toEqual(["Team 1 searcher (1111)", "Team 1 searcher (2222)"]);
  });
  it("removed members come last and say so; a team not in the list is named by its id", async () => {
    const { memberRows } = await import("./members");
    const rows = memberRows({ u1: { role: "searcher", team: "T9" }, f1: { role: "family", team: null } }, new Set(["f1"]), teams);
    expect(rows.map((r) => [r.label, r.removed])).toEqual([["T9 searcher", false], ["Family member", true]]);
  });
});

describe("memberRows: never the caller or a command account, and never two identical labels", () => {
  const teams = [{ teamId: "T1", name: "Team 1" }];
  it("leaves out the caller and every command record", async () => {
    const { memberRows } = await import("./members");
    const rows = memberRows(
      { me: { role: "searcher", team: "T1" }, s2: { role: "command", team: null }, s3: { role: "searcher", team: "T1" } },
      new Set(),
      teams,
      "me",
    );
    expect(rows.map((r) => r.uid)).toEqual(["s3"]);
  });
  it("lengthens the id ending until every label is distinct", async () => {
    const { memberRows } = await import("./members");
    const rows = memberRows({ "aa001111": { role: "searcher", team: "T1" }, "bb001111": { role: "searcher", team: "T1" } }, new Set(), teams, null);
    const labels = rows.map((r) => r.label);
    expect(new Set(labels).size).toBe(2);
    expect(labels).toEqual(["Team 1 searcher (aa001111)", "Team 1 searcher (bb001111)"]);
  });
});
