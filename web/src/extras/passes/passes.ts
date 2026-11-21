// Each team's closest pass to the role-player in a published drill run, as tools/extras/import_track.py wrote it: team,
// event id, metres rounded to 10 (0 for under 10, said as "within 10 m"), time, the phone's stated accuracy and whether
// its clock offset was measured. It holds no coordinate. The role-player's GPS track itself is never published, so this
// page never fetches it; only this file, beside the run. Each pass is checked against its report in the run; only the
// distance rests on the tool alone.

import type { PublishedRunV1 } from "../replay/runContract";
import { clockLabel } from "../replay/ruler";

export type Pass = { teamId: string; eventId: string; distanceM: number; atMs: number; accuracyM: number | null; clockChecked: boolean };
export type PassesFile = { version: 1; runId: string; source: "gps-logger"; basis: "reports"; trackFromMs: number; trackToMs: number; passes: Pass[] };
export type PassLine = { teamId: string; eventId: string | null; text: string };

/** A run the replay reader has accepted (its teams and events are of the contract's shape). */
type RunLike = Pick<PublishedRunV1, "runId" | "teams" | "events" | "devices">;

const FILE_FIELDS = ["version", "runId", "source", "basis", "trackFromMs", "trackToMs", "passes"];
const PASS_FIELDS = ["teamId", "eventId", "distanceM", "atMs", "accuracyM", "clockChecked"];
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** The first key not in `allowed` (an empty name included), or undefined. */
const extraKey = (o: Record<string, unknown>, allowed: string[]) => Object.keys(o).find((k) => !allowed.includes(k));
const named = (k: string) => (k === "" ? '""' : k);

/** The passes file beside the run, or null for a run id that could leave the folder. */
export function passesUrl(runId: string): string | null {
  return RUN_ID.test(runId) && !runId.includes("..") ? `/extras/passes/${runId}.passes.json` : null;
}

/** The file when it is exactly the tool's shape, for this run, from a GPS logger; otherwise why not, in plain words. */
export function readPasses(json: unknown, run: RunLike): { ok: true; file: PassesFile } | { ok: false; reason: string } {
  const no = (reason: string) => ({ ok: false as const, reason });
  if (!isObj(json)) return no("The file is not a passes file.");
  const extra = extraKey(json, FILE_FIELDS);
  if (extra !== undefined) return no(`The file has a field it should not: ${named(extra)}.`);
  if (json["version"] !== 1) return no("The file is not version 1.");
  if (json["runId"] !== run.runId) return no("The file is for another run.");
  if (json["source"] === "synthetic") return no("The file comes from a synthetic track, made up for tests.");
  if (json["source"] !== "gps-logger") return no("The file does not say where its track came from.");
  if (json["basis"] !== "reports") return no("The file does not measure passes at the teams' reports.");
  if (!num(json["trackFromMs"]) || !num(json["trackToMs"]) || json["trackToMs"] < json["trackFromMs"]) return no("The file's track times cannot be read.");
  if (!Array.isArray(json["passes"])) return no("The file has no list of passes.");
  const teams = new Set(run.teams.map((t) => t.teamId));
  const events = new Map(run.events.map((e) => [e.eventId, e]));
  const offsets = new Map(run.devices.map((d) => [d.deviceId, d.clockOffsetMs]));
  const from = json["trackFromMs"];
  const to = json["trackToMs"];
  const seen = new Set<string>();
  const passes: Pass[] = [];
  for (const p of json["passes"] as unknown[]) {
    if (!isObj(p)) return no("A pass cannot be read.");
    const bad = extraKey(p, PASS_FIELDS);
    if (bad !== undefined) return no(`The file has a field it should not: passes.${named(bad)}.`);
    const { teamId, eventId, distanceM, atMs, accuracyM, clockChecked } = p;
    if (typeof teamId !== "string" || !teams.has(teamId)) return no("A pass names a team the run does not have.");
    if (seen.has(teamId)) return no("A team has two passes.");
    seen.add(teamId);
    const e = typeof eventId === "string" ? events.get(eventId) : undefined;
    if (!e || e.teamId !== teamId || !gpsReport(e) || !e.position) {
      return no("A pass names an event that is not that team's report placed by its phone's GPS.");
    }
    // Published rounded to the nearest 10 m, with 0 for under 10 m, so no pass pins a point of the role-player's track.
    if (!num(distanceM) || !Number.isInteger(distanceM) || distanceM < 0 || distanceM % 10 !== 0) return no("A pass's distance is not rounded to 10 m.");
    if (!num(atMs) || typeof clockChecked !== "boolean") return no("A pass's time cannot be read.");
    // The report's phone time plus the phone's measured offset; the pass says "checked" exactly when the run has one.
    const offset = offsets.get(e.deviceId);
    const measured = num(offset);
    if (clockChecked && !measured) return no("A pass says its phone's clock was checked, but the run has no offset for it.");
    if (!clockChecked && measured) return no("A pass says its phone's clock was not checked, but the run has its offset.");
    if (atMs !== e.clientTimeMs + (measured ? offset : 0)) return no("A pass's time is not its report's time.");
    const stated = num(e.position.accuracyM) && e.position.accuracyM >= 0 ? e.position.accuracyM : null;
    if (accuracyM !== stated) return no("A pass's GPS accuracy is not its report's.");
    if (atMs < from || atMs > to) return no("A pass falls outside the role-player's track.");
    passes.push({ teamId, eventId: e.eventId, distanceM, atMs, accuracyM: stated, clockChecked });
  }
  return { ok: true, file: { version: 1, runId: run.runId, source: "gps-logger", basis: "reports", trackFromMs: json["trackFromMs"], trackToMs: json["trackToMs"], passes } };
}

/** A report the tool measures from: a team's searcher report placed by its phone's GPS. */
function gpsReport(e: PublishedRunV1["events"][number]): boolean {
  // A place must be there: the run reader lets a field be left out, so an absent place counts as none.
  return e.role === "searcher" && e.positionSource === "gps" && isObj(e.position) && e.teamId !== null;
}

/**
 * One line per team of the run, in team id order: its closest pass, or why it has none. The run shows whether any of
 * the team's GPS-placed reports came inside the track's span; if one did, the track had no fix then (the tool's word).
 */
export function passLines(file: PassesFile, run: RunLike, timeZone: string): PassLine[] {
  const byTeam = new Map(file.passes.map((p) => [p.teamId, p]));
  const offsets = new Map(run.devices.map((d) => [d.deviceId, d.clockOffsetMs]));
  const inSpan = (teamId: string) =>
    run.events.some((e) => {
      if (e.teamId !== teamId || !gpsReport(e)) return false;
      const offset = offsets.get(e.deviceId);
      const t = e.clientTimeMs + (num(offset) ? offset : 0);
      return t >= file.trackFromMs && t <= file.trackToMs;
    });
  return [...run.teams]
    .sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0))
    .map((t) => {
      const p = byTeam.get(t.teamId);
      if (!p) {
        const why = inSpan(t.teamId)
          ? "its reports placed by its phone's GPS came only where the role-player's track has no fix"
          : "none of its reports placed by its phone's GPS came while the role-player's track ran";
        return { teamId: t.teamId, eventId: null, text: `No pass for ${t.name}: ${why}.` };
      }
      const notes = [
        ...(p.accuracyM === null ? [] : [`its phone's GPS: within ${Math.round(p.accuracyM)} m`]),
        ...(p.clockChecked ? [] : ["its phone's clock was not checked"]),
      ];
      const acc = notes.length > 0 ? ` (${notes.join("; ")})` : "";
      const how = p.distanceM === 0 ? "within 10 m of" : `${p.distanceM} m from`;
      return { teamId: t.teamId, eventId: p.eventId, text: `${t.name} was ${how} the role-player at ${clockLabel(p.atMs, timeZone)}, at its report then${acc}.` };
    });
}

/** The run's passes file: read, none (no file), refused with a reason, or unavailable (the fetch failed). */
export async function loadPasses(
  run: RunLike,
  fetchFn: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<{ state: "passes"; file: PassesFile } | { state: "none" } | { state: "invalid"; reason: string } | { state: "unavailable" }> {
  const url = passesUrl(run.runId);
  if (url === null) return { state: "none" };
  let res: Response;
  try {
    res = await fetchFn(url, { cache: "no-store" });
  } catch {
    return { state: "unavailable" };
  }
  if (res.status === 404) return { state: "none" };
  if (!res.ok) return { state: "unavailable" };
  // Hosting rewrites an unknown path to the app, so a missing file can arrive as HTML with status 200.
  if ((res.headers.get("content-type") ?? "").includes("text/html")) return { state: "none" };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { state: "invalid", reason: "The file is not JSON." };
  }
  const r = readPasses(body, run);
  return r.ok ? { state: "passes", file: r.file } : { state: "invalid", reason: r.reason };
}
