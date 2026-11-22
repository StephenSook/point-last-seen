// The judge page's Measured block: numbers computed by scripts/measured_export.py from stored data (each report
// read's route record, each approved plan's wording route, Firebase AI Logic's token counts) and committed to
// web/public/evidence/measured.json. The page types no number; it shows the file's, and refuses a file that is
// unreadable or more than MEASURED_MAX_AGE_DAYS old.

export const MEASURED_MAX_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

type Count = { count: number; medianMs: number | null };
type Block = { reads: number; onDevice: Count; cloud: Count; rules: number; unknown: number };
type Window = { from: string | null; to: string | null };
export type Measured = {
  schemaVersion: number;
  generatedAt: string;
  window: Window;
  reads: Block;
  wordingWindow: Window;
  wording: Block;
  spend: { from: string; usd: number; days: number; usdPerDay: number };
};

export type MeasuredLoad = { state: "file"; file: Measured } | { state: "none" };
export type MeasuredView =
  | { state: "ok"; heading: string; source: string; lines: string[]; asOf: string }
  | { state: "stale"; line: string }
  | { state: "unreadable"; line: string };

export async function loadMeasured(fetchFn: (url: string, init?: RequestInit) => Promise<Response> = fetch): Promise<MeasuredLoad> {
  try {
    const res = await fetchFn("/evidence/measured.json", { cache: "no-store" });
    // Hosting rewrites an unknown path to the app, so a missing file can arrive as HTML with status 200.
    if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) return { state: "none" };
    const file: unknown = await res.json();
    return typeof file === "object" && file !== null && !Array.isArray(file) ? { state: "file", file: file as Measured } : { state: "none" };
  } catch {
    return { state: "none" };
  }
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isCount = (c: unknown): c is Count =>
  typeof c === "object" && c !== null && Number.isInteger((c as Count).count) && ((c as Count).medianMs === null || isNum((c as Count).medianMs));
const isBlock = (b: unknown): b is Block =>
  typeof b === "object" && b !== null && [(b as Block).reads, (b as Block).rules, (b as Block).unknown].every(Number.isInteger)
  && isCount((b as Block).onDevice) && isCount((b as Block).cloud);

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "?");
const seconds = (ms: number | null) => (ms === null ? "" : ` (median ${(ms / 1000).toFixed(1)} s)`);

function blockLine(name: string, w: Window, b: Block, noun: string, onDevice: string, cloud: string, rules: string, none: string): string {
  const parts = [
    ...(b.onDevice.count > 0 ? [`${b.onDevice.count} ${onDevice}${seconds(b.onDevice.medianMs)}`] : []),
    ...(b.cloud.count > 0 ? [`${b.cloud.count} ${cloud}${seconds(b.cloud.medianMs)}`] : []),
    ...(b.rules > 0 ? [`${b.rules} ${rules}`] : []),
    ...(b.unknown > 0 ? [`${b.unknown} with no route recorded`] : []),
  ];
  const head = `${name}, ${day(w.from)} to ${day(w.to)}: ${b.reads}${noun}.`;
  return [head, parts.length ? `${parts.join(", ")}.` : "", b.onDevice.count === 0 ? none : ""].filter(Boolean).join(" ");
}

/** What the Measured block shows for this file at nowMs: its lines, or why it shows none. */
export function measuredLines(f: Measured, nowMs: number): MeasuredView {
  const unreadable = { state: "unreadable" as const, line: "The measured numbers can't be read, so none are shown." };
  if (typeof f?.generatedAt !== "string" || !UTC.test(f.generatedAt) || !isBlock(f.reads) || !isBlock(f.wording)
    || !f.spend || ![f.spend.usd, f.spend.days, f.spend.usdPerDay].every(isNum)) return unreadable;
  const at = Date.parse(f.generatedAt);
  if (nowMs - at > MEASURED_MAX_AGE_DAYS * DAY_MS) {
    return { state: "stale", line: `The measured numbers are more than ${MEASURED_MAX_AGE_DAYS} days old, so none are shown.` };
  }
  const lines = [
    blockLine("Report reads", f.window, f.reads, "", "on the device, in our own iPhone test runs", "by the cloud model", "by fixed rules with no model",
      "On the device: none stored yet. An iPhone's practice drill keeps its reads on the phone; a drill report read on the phone is stored with its route."),
    blockLine("Plan wording", f.wordingWindow, f.wording, " plans", "written by the laptop's own model", "by the cloud model", "in fixed wording with no model",
      "On the laptop: none stored yet. A plan uses the laptop's model only when its browser has Chrome's built-in model."),
    `Cloud model spend, ${day(`${f.spend.from}T00:00:00Z`)} to ${day(f.generatedAt)}: $${f.spend.usd.toFixed(2)} over ${f.spend.days} days ($${f.spend.usdPerDay} a day), from Firebase AI Logic's token counts.`,
  ];
  const asOf = `Computed on ${new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} by scripts/measured_export.py from the route records each read and plan stores.`;
  // Every number is from our own test runs and practice drills: the page says so beside the block.
  const source = `All counts come from our own test runs and practice drills (${day(`${f.spend.from}T00:00:00Z`)} to ${day(f.generatedAt)}); no real search has used the app yet.`;
  return { state: "ok", heading: "Stored on our servers", source, lines, asOf };
}
