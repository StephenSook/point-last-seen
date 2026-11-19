import { describe, expect, it, vi } from "vitest";
import { classifyPriorRefusal, PRIOR_SUPERSEDED } from "./refusal";
import { priorRefusalMessage } from "../command/postAccess";

const denied = () => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });

describe("classifyPriorRefusal", () => {
  it("names a refusal superseded only when the server holds the sent version or newer", async () => {
    const e = await classifyPriorRefusal(denied(), 6, async () => 6);
    expect((e as { code?: string }).code).toBe(PRIOR_SUPERSEDED);
    expect(((await classifyPriorRefusal(denied(), 6, async () => 9)) as { code?: string }).code).toBe(PRIOR_SUPERSEDED);
  });
  it("keeps the original error when the server's version did not move (for example a closed incident)", async () => {
    const original = denied();
    expect(await classifyPriorRefusal(original, 6, async () => 5)).toBe(original);
  });
  it("keeps the original error when the server cannot be read", async () => {
    const original = denied();
    expect(await classifyPriorRefusal(original, 6, async () => { throw new Error("offline"); })).toBe(original);
    expect(await classifyPriorRefusal(original, 6, async () => null)).toBe(original);
  });
  it("does not read the server for any other failure", async () => {
    const read = vi.fn(async () => 9);
    const other = Object.assign(new Error("x"), { code: "unavailable" });
    expect(await classifyPriorRefusal(other, 6, read)).toBe(other);
    expect(read).not.toHaveBeenCalled();
  });
});

describe("priorRefusalMessage", () => {
  it("says another seat updated the map only for a confirmed newer version", () => {
    expect(priorRefusalMessage(Object.assign(new Error("x"), { code: PRIOR_SUPERSEDED }))).toBe("Another seat updated the map. Showing the newer one.");
  });
  it("is the plain failure line for an unconfirmed refusal or anything else", () => {
    expect(priorRefusalMessage(denied())).toBe("The prior was not saved. Try again.");
    expect(priorRefusalMessage(new Error("boom"))).toBe("The prior was not saved. Try again.");
  });
});
