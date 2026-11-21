import { describe, expect, it, vi } from "vitest";

let handlers: { next: (s: unknown) => void; error: () => void } | null = null;
vi.mock("firebase/firestore", () => ({
  collection: () => "contentReports",
  onSnapshot: (_ref: unknown, next: (s: unknown) => void, error: () => void) => {
    handlers = { next, error };
    return () => undefined;
  },
}));

describe("subscribeFlags: a refused read keeps what was shown and is reported", () => {
  it("does not empty the flags on a refusal, and tells the page", async () => {
    const { subscribeFlags } = await import("./contentReports");
    const flags = vi.fn(), refused = vi.fn();
    subscribeFlags({} as never, "I1", flags, refused);
    const d = { authorUid: "u1", role: "family", target: "family_description", targetId: null, reason: "other", createdAt: { toMillis: () => 5 } };
    handlers!.next({ docs: [{ id: "r1", data: () => d }] });
    handlers!.error();
    expect(flags).toHaveBeenCalledTimes(1);
    expect(refused).toHaveBeenCalledTimes(1);
  });
});
