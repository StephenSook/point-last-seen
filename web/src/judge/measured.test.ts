import { describe, expect, it } from "vitest";
import { loadMeasured, MEASURED_MAX_AGE_DAYS, measuredLines, type Measured } from "./measured";

const DAY = 86_400_000;
const AT = Date.UTC(2026, 10, 21, 4, 29, 46);
const block = (on: number, onMs: number | null, cl: number, clMs: number | null, rules: number) =>
  ({ reads: on + cl + rules, onDevice: { count: on, medianMs: onMs }, cloud: { count: cl, medianMs: clMs }, rules, unknown: 0 });
const file: Measured = {
  schemaVersion: 1,
  generatedAt: "2026-11-21T04:29:46Z",
  window: { from: "2026-11-19T23:22:33Z", to: "2026-11-21T04:15:06Z" },
  reads: block(0, null, 2, 2760, 50),
  wordingWindow: { from: "2026-11-18T12:13:14Z", to: "2026-11-21T04:14:53Z" },
  wording: block(1, 14778, 2, 1524.5, 28),
  spend: { from: "2026-11-13", usd: 0.0842, days: 8, usdPerDay: 0.0105 },
};
const res = (body: string, type = "application/json", status = 200) =>
  Promise.resolve(new Response(body, { status, headers: { "content-type": type } }));

describe("measuredLines: the judge page's Measured block, from the committed file only", () => {
  it("says what each number is and where it came from, using only the file's values", () => {
    const m = measuredLines(file, AT + DAY);
    expect(m.state).toBe("ok");
    if (m.state !== "ok") return;
    expect(m.heading).toBe("Stored on our servers");
    expect(m.lines).toEqual([
      "Report reads, Nov 19 to Nov 21: 52. 2 by the cloud model (median 2.8 s), 50 by fixed rules with no model. On the device: none stored yet. An iPhone's practice drill keeps its reads on the phone; a drill report read on the phone is stored with its route.",
      "Plan wording, Nov 18 to Nov 21: 31 plans. 1 written by the laptop's own model (median 14.8 s), 2 by the cloud model (median 1.5 s), 28 in fixed wording with no model.",
      "Cloud model spend, Nov 13 to Nov 21: $0.08 over 8 days ($0.0105 a day), from Firebase AI Logic's token counts.",
    ]);
    expect(m.asOf).toBe("Computed on Nov 21, 2026 by scripts/measured_export.py from the route records each read and plan stores.");
  });

  it("gives the on-device count with its median once a drill stores one, and the laptop's reason when none", () => {
    const m = measuredLines({ ...file, reads: block(3, 1200, 2, 2760, 50), wording: block(0, null, 2, 1524.5, 28) }, AT);
    if (m.state !== "ok") throw new Error(m.state);
    expect(m.lines[0]).toBe("Report reads, Nov 19 to Nov 21: 55. 3 on the device (median 1.2 s), 2 by the cloud model (median 2.8 s), 50 by fixed rules with no model.");
    expect(m.lines[1]).toBe("Plan wording, Nov 18 to Nov 21: 30 plans. 2 by the cloud model (median 1.5 s), 28 in fixed wording with no model. On the laptop: none stored yet. A plan is worded on the laptop only when its browser has Chrome's built-in model.");
  });

  it("refuses a file older than the limit, so stale numbers never show", () => {
    expect(MEASURED_MAX_AGE_DAYS).toBe(30);
    expect(measuredLines(file, AT + 30 * DAY).state).toBe("ok");
    const old = measuredLines(file, AT + 30 * DAY + 1);
    expect(old).toEqual({ state: "stale", line: "The measured numbers are more than 30 days old, so none are shown." });
  });

  it("shows nothing for a file it cannot read", () => {
    expect(measuredLines({ ...file, generatedAt: "yesterday" } as Measured, AT).state).toBe("unreadable");
    expect(measuredLines({ ...file, reads: { ...file.reads, rules: "50" } } as unknown as Measured, AT).state).toBe("unreadable");
    expect(measuredLines({ ...file, spend: undefined } as unknown as Measured, AT).state).toBe("unreadable");
  });
});

describe("loadMeasured", () => {
  it("reads the served file", async () => {
    expect(await loadMeasured(() => res(JSON.stringify(file)))).toEqual({ state: "file", file });
  });
  it("treats the app's HTML fallback, a 404 or bad JSON as no file", async () => {
    expect((await loadMeasured(() => res("<html></html>", "text/html"))).state).toBe("none");
    expect((await loadMeasured(() => res("", "text/plain", 404))).state).toBe("none");
    expect((await loadMeasured(() => res("not json"))).state).toBe("none");
    expect((await loadMeasured(() => Promise.reject(new Error("offline")))).state).toBe("none");
  });
});
