// Each team's closest pass to the role-player in a published drill run, as tools/extras/import_track.py wrote it: team,
// event id, whole metres, time and the phone's stated accuracy. It holds no coordinate. The role-player's GPS track
// itself is never published, so this page never fetches it; only this file, beside the run.

import type { PublishedRunV1 } from "../replay/runContract";
import { clockLabel } from "../replay/ruler";

export type Pass = { teamId: string; eventId: string; distanceM: number; atMs: number; accuracyM: number | null };
export type PassesFile = { version: 1; runId: string; source: "gps-logger"; basis: "reports"; trackFromMs: number; trackToMs: number; passes: Pass[] };
export type PassLine = { teamId: string; eventId: string | null; text: string };

/** A run the replay reader has accepted (its teams and events are of the contract's shape). */
type RunLike = Pick<PublishedRunV1, "runId" | "teams" | "events">;

const FILE_FIELDS = ["version", "runId", "source", "basis", "trackFromMs", "trackToMs", "passes"];
const PASS_FIELDS = ["teamId", "eventId", "distanceM", "atMs", "accuracyM"];
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The passes file beside the run, or null for a run id that could leave the folder. */
export function passesUrl(runId: string): string | null {
  return RUN_ID.test(runId) && !runId.includes("..") ? `/extras/passes/${runId}.passes.json` : null;
}

/** The file when it is exactly the tool's shape, for this run, from a GPS logger; otherwise why not, in plain words. */
export function readPasses(json: unknown, run: RunLike): { ok: true; file: PassesFile } | { ok: false; reason: string } {
  const no = (reason: string) => ({ ok: false as const, reason });
  if (!isObj(json)) return no("The file is not a passes file.");
  const extra = Object.keys(json).find((k) => !FILE_FIELDS.includes(k));
  if (extra) return no(`The file has a field it should not: ${extra}.`);
  if (json["version"] !== 1) return no("The file is not version 1.");
  if (json["runId"] !== run.runId) return no("The file is for another run.");
  if (json["source"] === "synthetic") return no("The file comes from a synthetic track, made up for tests.");
  if (json["source"] !== "gps-logger") return no("The file does not say where its track came from.");
  if (json["basis"] !== "reports") return no("The file does not measure passes at the teams' reports.");
  if (!num(json["trackFromMs"]) || !num(json["trackToMs"]) || json["trackToMs"] < json["trackFromMs"]) return no("The file's track times cannot be read.");
  if (!Array.isArray(json["passes"])) return no("The file has no list of passes.");
  const teams = new Set(run.teams.map((t) => t.teamId));
  const teamOf = new Map(run.events.map((e) => [e.eventId, e.teamId]));
  const seen = new Set<string>();
  const passes: Pass[] = [];
  for (const p of json["passes"] as unknown[]) {
    if (!isObj(p)) return no("A pass cannot be read.");
    const bad = Object.keys(p).find((k) => !PASS_FIELDS.includes(k));
    if (bad) return no(`The file has a field it should not: passes.${bad}.`);
    const { teamId, eventId, distanceM, atMs, accuracyM } = p;
    if (typeof teamId !== "string" || !teams.has(teamId)) return no("A pass names a team the run does not have.");
    if (seen.has(teamId)) return no("A team has two passes.");
    seen.add(teamId);
    if (typeof eventId !== "string" || teamOf.get(eventId) !== teamId) return no("A pass names an event that is not that team's report in the run.");
    if (!num(distanceM) || !Number.isInteger(distanceM) || distanceM < 0) return no("A pass's distance is not a whole number of metres.");
    if (!num(atMs)) return no("A pass's time cannot be read.");
    if (accuracyM !== null && (!num(accuracyM) || accuracyM < 0)) return no("A pass's GPS accuracy cannot be read.");
    passes.push({ teamId, eventId, distanceM, atMs, accuracyM });
  }
  return { ok: true, file: { version: 1, runId: run.runId, source: "gps-logger", basis: "reports", trackFromMs: json["trackFromMs"], trackToMs: json["trackToMs"], passes } };
}

/** One line per team of the run, in team id order: its closest pass, or that it sent no GPS-placed report then. */
export function passLines(file: PassesFile, run: Pick<PublishedRunV1, "teams">, timeZone: string): PassLine[] {
  const byTeam = new Map(file.passes.map((p) => [p.teamId, p]));
  return [...run.teams]
    .sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0))
    .map((t) => {
      const p = byTeam.get(t.teamId);
      if (!p) return { teamId: t.teamId, eventId: null, text: `${t.name} sent no report placed by its phone's GPS while the role-player's track ran.` };
      const acc = p.accuracyM === null ? "" : ` (its phone's GPS: within ${Math.round(p.accuracyM)} m)`;
      return { teamId: t.teamId, eventId: p.eventId, text: `${t.name} was ${p.distanceM} m from the role-player at ${clockLabel(p.atMs, timeZone)}, at its report then${acc}.` };
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
