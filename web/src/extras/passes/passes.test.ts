import { describe, expect, it } from "vitest";
import { harnessRun } from "../testdata/replayIncident";
import { T0 } from "../testdata/replay";
import { loadPasses, passLines, passesUrl, readPasses } from "./passes";

const MIN = 60_000;
const run = harnessRun();
// Made-up passes for the harness run: alfa's report r2 and bravo's sighting s2.
const file = () => ({
  version: 1,
  runId: "harness-run",
  source: "gps-logger",
  basis: "reports",
  trackFromMs: T0,
  trackToMs: T0 + 20 * MIN,
  passes: [
    { teamId: "alfa", eventId: "r2", distanceM: 38, atMs: Date.UTC(2026, 10, 22, 18, 12), accuracyM: 8 },
    { teamId: "bravo", eventId: "s2", distanceM: 240, atMs: Date.UTC(2026, 10, 22, 18, 30), accuracyM: null },
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

  it("refuses a pass for a team the run lacks, or for an event that is not that team's report in the run", () => {
    const pass = file().passes[0]!;
    expect(readPasses({ ...file(), passes: [{ ...pass, teamId: "zulu" }] }, run).ok).toBe(false);
    expect(readPasses({ ...file(), passes: [{ ...pass, eventId: "nope" }] }, run).ok).toBe(false);
    // s2 is bravo's sighting, not alfa's.
    expect(readPasses({ ...file(), passes: [{ ...pass, eventId: "s2" }] }, run).ok).toBe(false);
  });

  it("refuses a distance that is not a whole number of metres at or above zero, or two passes for one team", () => {
    const pass = file().passes[0]!;
    for (const distanceM of [-1, 38.5, Number.NaN]) {
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
      { teamId: "alfa", eventId: "r2", text: "Alfa was 38 m from the role-player at 13:12, at its report then (its phone's GPS: within 8 m)." },
      { teamId: "bravo", eventId: "s2", text: "Bravo was 240 m from the role-player at 13:30, at its report then." },
    ]);
    const onlyAlfa = { ...r.file, passes: r.file.passes.slice(0, 1) };
    expect(passLines(onlyAlfa, run, "UTC")[1]).toEqual({ teamId: "bravo", eventId: null, text: "Bravo sent no report placed by its phone's GPS while the role-player's track ran." });
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
