// The judge's door: what this browser can do on its own (D2), and the
// published drill run the numbers come from (D5). Every sentence here is a
// claim about the product, so each says only what was measured or built.

import type { DeviceState } from "../ai/deviceModel";

/** `replay` is true only when a published run exists, so the line never points at a replay that is not there. */
export function d2Copy(state: DeviceState, opts: { replay: boolean; downloadFailed?: boolean }): { lines: string[]; photoButton: string | null } {
  if (opts.downloadFailed && state !== "text" && state !== "image") {
    return { lines: ["This browser could not download its built-in model. Nothing private was sent."], photoButton: null };
  }
  switch (state) {
    case "no-model":
      return {
        lines: [opts.replay ? "This browser has no built-in model. Nothing private was sent. Use the replay above, which runs in the cloud." : "This browser has no built-in model. Nothing private was sent."],
        photoButton: null,
      };
    case "downloadable":
      return { lines: ["This browser can download its built-in model first. Press Get this laptop ready to start; it can take a few minutes."], photoButton: null };
    case "text":
      return { lines: ["The sighting note is read on this laptop.", "This browser's model cannot read images. Photos stayed on this laptop."], photoButton: null };
    case "image":
      return { lines: ["The sighting note and sample photos are read on this laptop."], photoButton: "Read sample photos on this laptop" };
  }
}

const RUN_PARTS = ["runId", "label", "exportedAt", "incident", "segments", "teams", "devices", "events", "plans", "measurements"] as const;
export type PublishedRun = Record<(typeof RUN_PARTS)[number], unknown>;

/** The published run, or why there is none. A broken file is "invalid", never shown as numbers. */
export async function loadPublishedRun(
  fetchFn: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<{ state: "run"; run: PublishedRun } | { state: "none" } | { state: "invalid" } | { state: "unavailable" }> {
  let res: Response;
  try {
    res = await fetchFn("/evidence/published-run.json", { cache: "no-store" });
  } catch {
    return { state: "unavailable" };
  }
  if (res.status === 404) return { state: "none" };
  if (!res.ok) return { state: "unavailable" };
  // Hosting rewrites every unknown path to the app, so a missing file arrives as HTML with status 200.
  if ((res.headers.get("content-type") ?? "").includes("text/html")) return { state: "none" };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { state: "invalid" };
  }
  if (typeof body !== "object" || body === null || RUN_PARTS.some((k) => !(k in body))) return { state: "invalid" };
  return { state: "run", run: body as PublishedRun };
}

/**
 * The judge page's model lines (C2): which cloud model Remote Config selects right now, from
 * where, and when it was fetched. The pinned default is always labelled; the lines are never blank.
 */
export function modelLines(rc: { cloudModelWeb: string; cloudModelSource: "remote" | "default" | "static"; fetchedAt: string | null; killCloud: boolean }): string[] {
  const remote = rc.cloudModelSource === "remote";
  const lines = [
    remote ? `Cloud model now: ${rc.cloudModelWeb}.` : `Cloud model now: ${rc.cloudModelWeb} (default).`,
    remote
      ? `Chosen by Remote Config (fetched ${rc.fetchedAt ?? "just now"}), so it can change live with no new release.`
      : rc.fetchedAt
        ? `Remote Config answered at ${rc.fetchedAt} with no value set, so this is the page's pinned default.`
        : "Remote Config has not answered, so this is the page's pinned default.",
  ];
  if (rc.killCloud) lines.push("Cloud steps are paused by command.");
  return lines;
}

/** A Remote Config fetch time with its time zone, e.g. "14:05:09 EST" (24-hour clock). */
export function fetchedTime(ms: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short", timeZone }).format(ms);
}
