import { describe, expect, it, vi } from "vitest";

type Handlers = { next: (s: unknown) => void; error: () => void };
const listeners: Record<string, Handlers> = {};
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...path: string[]) => path.join("/"),
  onSnapshot: (ref: string, next: Handlers["next"], error: Handlers["error"]) => {
    listeners[ref.split("/").pop()!] = { next, error };
    return () => undefined;
  },
}));
vi.mock("firebase/functions", () => ({ httpsCallable: () => () => Promise.resolve() }));

describe("subscribeMembers: a refusal after a good read keeps what was shown", () => {
  it("does not forget removals (or members) when a later read is refused", async () => {
    const { subscribeMembers } = await import("./members");
    const members = vi.fn(), removed = vi.fn();
    subscribeMembers({} as never, "I1", members, removed);
    const docs = (ids: string[], data: Record<string, unknown> = {}) => ({ docs: ids.map((id) => ({ id, get: (k: string) => data[k] })) });
    listeners["removed"]!.next(docs(["u1"]));
    listeners["members"]!.next(docs(["u2"], { role: "searcher", team: "T1" }));
    listeners["removed"]!.error();
    listeners["members"]!.error();
    expect(removed.mock.calls.map((c) => [...(c[0] as Set<string>)])).toEqual([["u1"]]);
    expect(members.mock.calls).toHaveLength(1);
  });
});
