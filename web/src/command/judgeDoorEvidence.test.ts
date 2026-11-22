import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// docs/evidence/web/2026-11-22-judge-door-what-leaves.json: the deployed judge door read in a fresh profile. Its claims
// are checked here against the file itself and against the code that shows the plan line.
const ev = JSON.parse(readFileSync(new URL("../../../docs/evidence/web/2026-11-22-judge-door-what-leaves.json", import.meta.url), "utf8")) as {
  findings: string[];
  screenshot: string;
  aiRequests: number;
  firestoreWrites: number;
  requests: { method: string; url: string; status: number | null }[];
};

describe("the judge door evidence of what leaves the device", () => {
  it("holds only methods, addresses without a query string, and statuses, so no token or id", () => {
    expect(ev.requests.length).toBeGreaterThan(20);
    for (const r of ev.requests) {
      expect(Object.keys(r).sort()).toEqual(["method", "status", "tMs", "url"]);
      expect(r.url).not.toContain("?");
    }
  });

  it("shows the AI calls answered and no Firestore write in the whole run", () => {
    const ai = ev.requests.filter((r) => /firebasevertexai|generativelanguage/.test(r.url));
    expect(ai.length).toBe(ev.aiRequests);
    expect(ai.length).toBeGreaterThan(0);
    for (const r of ai) expect(r.status).toBe(200);
    expect(ev.requests.filter((r) => r.url.includes("Firestore/Write")).length).toBe(0);
    expect(ev.firestoreWrites).toBe(0);
  });

  it("quotes the plan line exactly as the Plan section showed it at the commit it read", () => {
    // The judge door was read at deployed commit 522d88d2, before plan reasons became fact codes; this is the line that
    // commit showed. The Plan section has since changed it, so the record is of that commit only.
    const line = "Suggest plan words the draft on this laptop's built-in model, or with Gemini in the cloud when it has none. It sends only team ids, segment codes and percents, never a note or a name.";
    expect((ev as unknown as { page: string }).page).toContain("522d88d20fd29b41d8a15427d082fe08144ffece");
    expect(ev.findings.some((f) => f.includes(line))).toBe(true);
    expect(readFileSync(new URL("./WhatChanged.tsx", import.meta.url), "utf8")).not.toContain(`"${line}"`);
    expect(readFileSync(new URL(`../../../docs/evidence/web/${ev.screenshot}`, import.meta.url)).length).toBeGreaterThan(10_000);
  });
});
