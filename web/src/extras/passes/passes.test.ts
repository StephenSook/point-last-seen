import { describe, expect, it } from "vitest";
import { harnessRun } from "../testdata/replayIncident";
import { T0 } from "../testdata/replay";
import { loadPasses, passLines, passesUrl, readPasses } from "./passes";

const MIN = 60_000;
// The harness run, with bravo's phone (device-2) never having its clock offset measured.
const base = harnessRun();
const run = { ...base, devices: base.devices.map((d) => (d.deviceId === "device-2" ? { ...d, clockOffsetMs: null } : d)) };
// Made-up passes for the harness run: alfa's report r2 and bravo's sighting s2.
// Each pass's time is its report's phone time plus the phone's measured offset (0 here); accuracy is the report's own.
const file = () => ({
  version: 1,
  runId: "harness-run",
  source: "gps-logger",
  basis: "reports",
  trackFromMs: T0,
  trackToMs: T0 + 20 * MIN,
  passes: [
    { teamId: "alfa", eventId: "r2", distanceM: 40, atMs: T0 + 16 * MIN, accuracyM: 5, clockChecked: true },
    { teamId: "bravo", eventId: "s2", distanceM: 240, atMs: T0 + 12 * MIN, accuracyM: 5, clockChecked: false },
  ],
});

describe("readPasses", () => {
  it("takes a passes file for this run, from a GPS logger", () => {
    const r = readPasses(file(), run);
    expect(r.ok).toBe(true);
  });

  it("refuses a file for another run, a synthetic track, another version or basis", () => {
    expect(readPasses({ ...file(), runId: "other" }, run)).toEqual({ ok: false, reason: "The file is for another run." });
    expect(readPasses({ ...file(), source: "synthetic" }, run)).toEqual({ ok: false, reason: "The file comes from a synthetic track, made up for tests." });
    expect(readPasses({ ...file(), version: 2 }, run).ok).toBe(false);
    expect(readPasses({ ...file(), basis: "trails" }, run).ok).toBe(false);
  });

  it("refuses any field beyond the exact shape, so no coordinate can ride along", () => {
    const withPlace = { ...file(), passes: [{ ...file().passes[0]!, lat: 33.9, lon: -84.6 }] };
    expect(readPasses(withPlace, run)).toEqual({ ok: false, reason: "The file has a field it should not: passes.lat." });
    expect(readPasses({ ...file(), track: [[T0, 33.9, -84.6]] }, run)).toEqual({ ok: false, reason: "The file has a field it should not: track." });
  });

  it("refuses a field with an empty name too, so it cannot hide an extra field after it", () => {
    expect(readPasses({ "": true, ...file(), track: [[T0, 33.9, -84.6]] }, run)).toEqual({ ok: false, reason: 'The file has a field it should not: "".' });
    const pass = { "": 1, ...file().passes[0]!, lat: 33.9 };
    expect(readPasses({ ...file(), passes: [pass] }, run)).toEqual({ ok: false, reason: 'The file has a field it should not: passes."".' });
  });

  it("checks each pass against its report in the run: time, accuracy, GPS placing and the track's span", () => {
    const pass = file().passes[0]!;
    // A time that is not the report's phone time plus its measured offset.
    expect(readPasses({ ...file(), passes: [{ ...pass, atMs: pass.atMs + 60_000 }] }, run)).toEqual({ ok: false, reason: "A pass's time is not its report's time." });
    // An accuracy the report does not state.
    expect(readPasses({ ...file(), passes: [{ ...pass, accuracyM: 1 }] }, run)).toEqual({ ok: false, reason: "A pass's GPS accuracy is not its report's." });
    // Outside the span the track covers.
    expect(readPasses({ ...file(), trackToMs: T0 + 10 * MIN }, run)).toEqual({ ok: false, reason: "A pass falls outside the role-player's track." });
    // A report not placed by its phone's GPS (r2, marked here as placed by hand).
    const handPlaced = { ...run, events: run.events.map((e) => (e.eventId === "r2" ? { ...e, positionSource: "manual" as const } : e)) };
    expect(readPasses(file(), handPlaced)).toEqual({ ok: false, reason: "A pass names an event that is not that team's report placed by its phone's GPS." });
  });

  it("a pass says its phone's clock was checked exactly when the run has that phone's offset", () => {
    const [alfa, bravo] = file().passes as [ReturnType<typeof file>["passes"][number], ReturnType<typeof file>["passes"][number]];
    // Bravo's phone has no measured offset: the pass is taken at the phone's own time, and says so.
    expect(readPasses({ ...file(), passes: [bravo] }, run).ok).toBe(true);
    expect(readPasses({ ...file(), passes: [{ ...bravo, clockChecked: true }] }, run)).toEqual({ ok: false, reason: "A pass says its phone's clock was checked, but the run has no offset for it." });
    // Alfa's phone has one (0): a pass may not set it aside.
    expect(readPasses({ ...file(), passes: [{ ...alfa, clockChecked: false }] }, run)).toEqual({ ok: false, reason: "A pass says its phone's clock was not checked, but the run has its offset." });
    const offset = { ...run, devices: run.devices.map((d) => (d.deviceId === "device-1" ? { ...d, clockOffsetMs: 30_000 } : d)) };
    expect(readPasses({ ...file(), passes: [alfa] }, offset)).toEqual({ ok: false, reason: "A pass's time is not its report's time." });
    expect(readPasses({ ...file(), passes: [{ ...alfa, atMs: alfa.atMs + 30_000 }] }, offset).ok).toBe(true);
  });

  it("refuses a pass for a team the run lacks, or for an event that is not that team's report in the run", () => {
    const pass = file().passes[0]!;
    expect(readPasses({ ...file(), passes: [{ ...pass, teamId: "zulu" }] }, run).ok).toBe(false);
    expect(readPasses({ ...file(), passes: [{ ...pass, eventId: "nope" }] }, run).ok).toBe(false);
    // s2 is bravo's sighting, not alfa's.
    expect(readPasses({ ...file(), passes: [{ ...pass, eventId: "s2" }] }, run).ok).toBe(false);
  });

  it("refuses a distance that is not rounded to 10 m at or above zero, or two passes for one team", () => {
    const pass = file().passes[0]!;
    for (const distanceM of [-10, 38, 38.5, Number.NaN]) {
      expect(readPasses({ ...file(), passes: [{ ...pass, distanceM }] }, run).ok, String(distanceM)).toBe(false);
    }
    expect(readPasses({ ...file(), passes: [pass, pass] }, run).ok).toBe(false);
  });
});

describe("passLines", () => {
  it("one line per team of the run, in team id order (as the tool writes them): its closest pass, or that it has none", () => {
    const r = readPasses(file(), run);
    if (!r.ok) throw new Error(r.reason);
    expect(passLines(r.file, run, "America/New_York")).toEqual([
      { teamId: "alfa", eventId: "r2", text: "Alfa was 40 m from the role-player at 13:56, at its report then (its phone's GPS: within 5 m)." },
      { teamId: "bravo", eventId: "s2", text: "Bravo was 240 m from the role-player at 13:52, at its report then (its phone's GPS: within 5 m; its phone's clock was not checked)." },
    ]);
    // Under 10 m is published as 0 and said as "within 10 m", never "0 m".
    const close = { ...r.file, passes: [{ ...r.file.passes[0]!, distanceM: 0 }] };
    expect(passLines(close, run, "America/New_York")[0]!.text).toBe("Alfa was within 10 m of the role-player at 13:56, at its report then (its phone's GPS: within 5 m).");
    const onlyAlfa = { ...r.file, passes: r.file.passes.slice(0, 1) };
    // Bravo's GPS report at +12 lies inside the track's span, so its missing pass means the track had no fix then.
    expect(passLines(onlyAlfa, run, "UTC")[1]).toEqual({
      teamId: "bravo",
      eventId: null,
      text: "No pass for Bravo: its reports placed by its phone's GPS came only where the role-player's track has no fix.",
    });
    // With the track starting at +13, the run shows no GPS report of Bravo's inside it at all.
    const later = { ...onlyAlfa, trackFromMs: T0 + 13 * MIN };
    expect(passLines(later, run, "UTC")[1]!.text).toBe("No pass for Bravo: none of its reports placed by its phone's GPS came while the role-player's track ran.");
  });
});

describe("passesUrl", () => {
  it("names the file beside the run, and refuses a run id that could leave the folder", () => {
    expect(passesUrl("drill-kennesaw-1-2026-11-22")).toBe("/extras/passes/drill-kennesaw-1-2026-11-22.passes.json");
    expect(passesUrl("../x")).toBeNull();
    expect(passesUrl("a/b")).toBeNull();
    expect(passesUrl("")).toBeNull();
  });
});

describe("loadPasses", () => {
  const respond = (body: string, init: ResponseInit) => async () => new Response(body, init);

  it("reads a JSON file, and treats a missing one (404, or the app's HTML with 200) as none", async () => {
    const ok = await loadPasses(run, respond(JSON.stringify(file()), { status: 200, headers: { "content-type": "application/json" } }));
    expect(ok.state).toBe("passes");
    expect(await loadPasses(run, respond("", { status: 404 }))).toEqual({ state: "none" });
    expect(await loadPasses(run, respond("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } }))).toEqual({ state: "none" });
  });

  it("says why a file it cannot use is refused, and that a failed fetch is unavailable, not none", async () => {
    const synthetic = await loadPasses(run, respond(JSON.stringify({ ...file(), source: "synthetic" }), { status: 200, headers: { "content-type": "application/json" } }));
    expect(synthetic).toEqual({ state: "invalid", reason: "The file comes from a synthetic track, made up for tests." });
    expect(await loadPasses(run, async () => { throw new Error("offline"); })).toEqual({ state: "unavailable" });
  });

  it("fetches only the passes file beside the run, never a track", async () => {
    const urls: string[] = [];
    await loadPasses(run, async (url: string) => { urls.push(String(url)); return new Response("", { status: 404 }); });
    expect(urls).toEqual(["/extras/passes/harness-run.passes.json"]);
  });
});
