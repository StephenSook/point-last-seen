import { describe, expect, it } from "vitest";
import { appendEventWith, classifyWriteFailure, compareServerCopy, retryEventWith, type WriteDeps } from "./events";

const doc = { eventId: "a".repeat(32), incidentId: "I1", deviceId: "D1", seq: 4, authorUid: "U1", clientTimeMs: 1000, rawText: "x" };

describe("classifyWriteFailure", () => {
  it("a denied write that exists on the server is acknowledged", () => {
    expect(classifyWriteFailure("permission-denied", "same")).toBe("acked");
    expect(classifyWriteFailure("permission-denied", "absent")).toBe("rejected");
    expect(classifyWriteFailure("unavailable", "offline")).toBe("checking");
  });

  it("a server copy with another identity is a rejection, never an ack", () => {
    expect(classifyWriteFailure("permission-denied", "different")).toBe("rejected");
  });
});

describe("compareServerCopy", () => {
  it("is same only when deviceId, seq, authorUid and clientTimeMs all match", () => {
    expect(compareServerCopy(doc, { ...doc })).toBe("same");
    expect(compareServerCopy(doc, { ...doc, seq: 5 })).toBe("different");
    expect(compareServerCopy(doc, { ...doc, authorUid: "U2" })).toBe("different");
    expect(compareServerCopy(doc, { ...doc, clientTimeMs: 1001 })).toBe("different");
    expect(compareServerCopy(doc, { ...doc, deviceId: "D2" })).toBe("different");
    expect(compareServerCopy(doc, undefined)).toBe("absent");
  });
});

function deps(over: Partial<WriteDeps>): WriteDeps & { states: string[] } {
  const states: string[] = [];
  return {
    states,
    write: () => Promise.resolve(),
    readFromServer: () => Promise.resolve(undefined),
    onState: (_id, s) => states.push(s),
    ...over,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("appendEventWith", () => {
  it("does not wait for the write and reports pending at once", () => {
    const d = deps({ write: () => new Promise(() => {}) });
    const ret = appendEventWith(doc, d);
    expect(ret).toBeUndefined();
    expect(d.states).toEqual(["pending"]);
  });

  it("a write that lands is acknowledged", async () => {
    const d = deps({});
    appendEventWith(doc, d);
    await flush();
    expect(d.states).toEqual(["pending", "acked"]);
  });

  it("a denied write whose document is on the server with the same identity is acknowledged", async () => {
    const d = deps({ write: () => Promise.reject({ code: "permission-denied" }), readFromServer: () => Promise.resolve({ ...doc }) });
    appendEventWith(doc, d);
    await flush(); await flush();
    expect(d.states).toEqual(["pending", "checking", "acked"]);
  });

  it("a denied write with no server copy is rejected and stays rejected", async () => {
    const d = deps({ write: () => Promise.reject({ code: "permission-denied" }) });
    appendEventWith(doc, d);
    await flush(); await flush();
    expect(d.states).toEqual(["pending", "checking", "rejected"]);
  });

  it("when the read-back itself fails offline the entry waits as checking", async () => {
    const d = deps({ write: () => Promise.reject({ code: "unavailable" }), readFromServer: () => Promise.reject({ code: "unavailable" }) });
    appendEventWith(doc, d);
    await flush(); await flush();
    expect(d.states).toEqual(["pending", "checking"]);
  });
});

describe("retryEventWith", () => {
  it("reads first and never rewrites a document that is already on the server", async () => {
    let writes = 0;
    const d = deps({ write: () => { writes++; return Promise.resolve(); }, readFromServer: () => Promise.resolve({ ...doc }) });
    retryEventWith(doc, d);
    await flush(); await flush();
    expect(writes).toBe(0);
    expect(d.states).toEqual(["checking", "acked"]);
  });

  it("writes again only when the server has no copy", async () => {
    let writes = 0;
    const d = deps({ write: () => { writes++; return Promise.resolve(); } });
    retryEventWith(doc, d);
    await flush(); await flush(); await flush();
    expect(writes).toBe(1);
    expect(d.states).toEqual(["checking", "pending", "acked"]);
  });

  it("a server copy with another identity is rejected without a write", async () => {
    let writes = 0;
    const d = deps({ write: () => { writes++; return Promise.resolve(); }, readFromServer: () => Promise.resolve({ ...doc, seq: 9 }) });
    retryEventWith(doc, d);
    await flush(); await flush();
    expect(writes).toBe(0);
    expect(d.states).toEqual(["checking", "rejected"]);
  });

  it("offline, it waits as checking and writes nothing", async () => {
    let writes = 0;
    const d = deps({ write: () => { writes++; return Promise.resolve(); }, readFromServer: () => Promise.reject({ code: "unavailable" }) });
    retryEventWith(doc, d);
    await flush(); await flush();
    expect(writes).toBe(0);
    expect(d.states).toEqual(["checking"]);
  });
});
