import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InferenceMode } from "firebase/ai";
import { COVERAGE_TICKS, SAMPLE_VALUES } from "../extras/debrief/debriefSheet";
import { REPLACEMENT } from "../data/phoneNumbers";
import { cleanSheet, DEBRIEF_SHEET_JSON, DEBRIEF_SHEET_OPTS, debriefSheetParams, readDebriefSheetOnDevice, SHEET_READ_TIMEOUT_MS, type SheetDeps } from "./debriefSheetRead";

// The read is opened from segment AA's debrief, so AA is the segment the sheet must be for.
const ctx = { segmentId: "AA", segmentIds: ["AA", "AB", "BC"], teams: [{ teamId: "alfa", name: "Alfa" }, { teamId: "T2", name: "Team 2" }] };
// The SAMPLE sheet as a model would return it (made-up values; no person named).
const sampleReply = {
  team: "Alfa", segment: "AA", minutes: String(SAMPLE_VALUES.minutes), coverage: String(SAMPLE_VALUES.coveragePct),
  worked: SAMPLE_VALUES.worked, didNotWork: SAMPLE_VALUES.didNotWork, clues: SAMPLE_VALUES.clues, hazards: SAMPLE_VALUES.hazards,
};

describe("the on-device read's options", () => {
  it("ask Chrome for image input, run only on this laptop, and constrain the reply to the sheet's fields", () => {
    expect(DEBRIEF_SHEET_OPTS.expectedInputs?.map((e) => e.type)).toEqual(["text", "image"]);
    const p = debriefSheetParams();
    expect(p.mode).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(p.onDeviceParams?.createOptions).toBe(DEBRIEF_SHEET_OPTS);
    expect(p.onDeviceParams?.promptOptions?.responseConstraint).toBe(DEBRIEF_SHEET_JSON);
  });

  it("offer exactly the sheet's coverage ticks, or none", () => {
    expect(DEBRIEF_SHEET_JSON.properties.coverage.enum).toEqual([...COVERAGE_TICKS.map(String), "none"]);
  });
});

describe("cleanSheet", () => {
  it("reads the SAMPLE sheet into the debrief form, with nothing to flag", () => {
    expect(cleanSheet(sampleReply, ctx)).toEqual({
      form: { team: "Alfa", segment: "AA", minutes: "45", coverage: "75", worked: SAMPLE_VALUES.worked, didNotWork: SAMPLE_VALUES.didNotWork, clues: SAMPLE_VALUES.clues, hazards: SAMPLE_VALUES.hazards },
      problems: {},
    });
  });

  it("puts a segment in capitals, and flags one this search does not have", () => {
    expect(cleanSheet({ ...sampleReply, segment: " aa " }, ctx)).toMatchObject({ form: { segment: "AA" }, problems: {} });
    expect(cleanSheet({ ...sampleReply, segment: "ZZ" }, ctx)!.problems.segment).toBe("Not a segment of this search.");
  });

  it("flags a segment read with anything but letters, so a misread is never cleaned into a match", () => {
    const r = cleanSheet({ ...sampleReply, segment: "AA1" }, ctx)!;
    expect(r.form.segment).toBe("AA");
    expect(r.problems.segment).toBe("Read as AA1: check the segment on the sheet.");
    expect(cleanSheet({ ...sampleReply, segment: " aa " }, ctx)!.problems.segment).toBeUndefined();
  });

  it("flags a sheet for another segment of this search, and a sheet with no segment read", () => {
    const other = cleanSheet({ ...sampleReply, segment: "ab" }, ctx)!;
    expect(other.form.segment).toBe("AB");
    expect(other.problems.segment).toBe("This sheet is for segment AB, not AA.");
    expect(cleanSheet({ ...sampleReply, segment: " " }, ctx)!.problems.segment).toBe("No segment read from the sheet.");
  });

  it("matches a team by name in any letter case, and flags one this search does not have", () => {
    expect(cleanSheet({ ...sampleReply, team: "team 2" }, ctx)).toMatchObject({ form: { team: "Team 2" }, problems: {} });
    expect(cleanSheet({ ...sampleReply, team: "Bravo" }, ctx)!.problems.team).toBe("Not a team of this search.");
  });

  it("flags minutes that are not whole minutes from 0 to 1440, and keeps what was read for command to correct", () => {
    const r = cleanSheet({ ...sampleReply, minutes: "4S" }, ctx)!;
    expect(r.form.minutes).toBe("4S");
    expect(r.problems.minutes).toBe("Not whole minutes from 0 to 1440.");
    expect(cleanSheet({ ...sampleReply, minutes: "2000" }, ctx)!.problems.minutes).toBe("Not whole minutes from 0 to 1440.");
  });

  it("reads no ticked box, or more than one, as no stated coverage, and says so", () => {
    const r = cleanSheet({ ...sampleReply, coverage: "none" }, ctx)!;
    expect(r.form.coverage).toBe("");
    expect(r.problems.coverage).toBe("No box ticked, or more than one.");
    expect(cleanSheet({ ...sampleReply, coverage: "80" }, ctx)!.form.coverage).toBe("");
  });

  it("trims each note and keeps at most 500 characters", () => {
    const r = cleanSheet({ ...sampleReply, clues: `  ${"x".repeat(600)}  `, hazards: "" }, ctx)!;
    expect(r.form.clues).toHaveLength(500);
    expect(r.form.hazards).toBe("");
  });

  it("removes a phone number from every note before it can be stored", () => {
    const r = cleanSheet({ ...sampleReply, worked: "Radio 404-555-0142 worked", didNotWork: "", clues: "Call 404 555 0142 at the gate", hazards: "Ranger at (404) 555 0142" }, ctx)!;
    expect(r.form.clues).toBe(`Call ${REPLACEMENT} at the gate`);
    expect(r.form.worked).toBe(`Radio ${REPLACEMENT} worked`);
    expect(r.form.hazards).toBe(`Ranger at ${REPLACEMENT}`);
    expect(JSON.stringify(r.form)).not.toMatch(/0142/);
  });

  it("is null for a reply that is not the sheet's shape", () => {
    expect(cleanSheet(null, ctx)).toBeNull();
    expect(cleanSheet("Alfa AA 45", ctx)).toBeNull();
    expect(cleanSheet({ ...sampleReply, minutes: 45 }, ctx)).toBeNull();
  });
});

function deps(over: Partial<SheetDeps> = {}): SheetDeps & { calls: number } {
  const d = {
    calls: 0,
    available: async () => true,
    generate: async () => {
      d.calls++;
      return { text: JSON.stringify(sampleReply), inferenceSource: "on_device" as string | undefined };
    },
    timeoutMs: 1_000,
    ...over,
  };
  return d;
}

describe("the sheet read's time limit", () => {
  it("is longer than the slowest read measured on Chrome's built-in model, and the command post uses it", () => {
    const ev = JSON.parse(readFileSync(new URL("../../../docs/evidence/web/2026-11-21-debrief-sheet-chrome.json", import.meta.url), "utf8")) as { runs: { replyMs: number }[] };
    const slowest = Math.max(...ev.runs.map((r) => r.replyMs));
    expect(slowest).toBeGreaterThan(30_000);
    expect(SHEET_READ_TIMEOUT_MS).toBeGreaterThan(2 * slowest);
    expect(readFileSync(new URL("../command/CommandPost.tsx", import.meta.url), "utf8")).toMatch(/debriefSheetGenerator\(ai\(\)\)\(b\), timeoutMs: SHEET_READ_TIMEOUT_MS/);
  });
});

describe("readDebriefSheetOnDevice", () => {
  it("reads the sheet on this laptop and cleans it", async () => {
    expect(await readDebriefSheetOnDevice("jpeg", ctx, deps())).toEqual({ read: cleanSheet(sampleReply, ctx) });
  });

  it("asks Chrome first, and with no on-device model makes no call at all", async () => {
    const d = deps({ available: async () => false });
    expect(await readDebriefSheetOnDevice("jpeg", ctx, d)).toEqual({ refused: "no-on-device-model" });
    expect(d.calls).toBe(0);
    const t = deps({ available: async () => { throw new Error("no"); } });
    expect(await readDebriefSheetOnDevice("jpeg", ctx, t)).toEqual({ refused: "no-on-device-model" });
  });

  it("refuses a reply that did not run on this laptop, an unreadable reply, and a slow one", async () => {
    expect(await readDebriefSheetOnDevice("jpeg", ctx, deps({ generate: async () => ({ text: JSON.stringify(sampleReply), inferenceSource: "in_cloud" }) }))).toEqual({ refused: "not-on-device" });
    expect(await readDebriefSheetOnDevice("jpeg", ctx, deps({ generate: async () => ({ text: "not json", inferenceSource: "on_device" }) }))).toEqual({ refused: "invalid" });
    const slow = deps({ generate: () => new Promise(() => undefined), timeoutMs: 10 });
    expect(await readDebriefSheetOnDevice("jpeg", ctx, slow)).toEqual({ refused: "timeout" });
  });
});
