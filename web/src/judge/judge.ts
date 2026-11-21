// The judge's door: what this browser can do on its own (D2), and the
// published drill run the numbers come from (D5). Every sentence here is a
// claim about the product, so each says only what was measured or built.

import type { DeviceState } from "../ai/deviceModel";
import { fromPublishedRun } from "../extras/replay/replayData";

/**
 * Why the first minutes matter: what a dementia-care expert we spoke to told us, in our words. It is advice she
 * gave us, never an endorsement of this project, and it carries no quote marks because it is not word for word.
 */
export const ADVICE_LINE =
  "Kim Franklin of the Alzheimer's Association Georgia told us to check the immediate area first and, if the person is not found within five minutes, call police, because the longer you wait, the further they can get.";

const REPO = "https://github.com/StephenSook/point-last-seen";

/**
 * The Android family app: GitHub's latest published release, the newest judge build, so a new build needs no code
 * change (a browser check fails if it is not a published android-judge release). Null would hide the link.
 */
export const ANDROID_RELEASE_URL: string | null = `${REPO}/releases/latest`;
/** The iPhone app's TestFlight public link; null until Apple clears review. */
export const TESTFLIGHT_URL: string | null = null;

export type JudgeLink = { label: string; href: string; external: boolean };

/** The judge page's links, every one public for a signed-out browser; an app link appears only once its URL is set. */
export function judgeLinks(apps: { android: string | null; testflight: string | null }): JudgeLink[] {
  return [
    { label: "Command post", href: "/", external: false },
    { label: "Source code", href: REPO, external: true },
    ...(apps.android ? [{ label: "Android family app", href: apps.android, external: true }] : []),
    ...(apps.testflight ? [{ label: "iPhone app (TestFlight)", href: apps.testflight, external: true }] : []),
    { label: "iPhone test runs", href: `${REPO}/tree/main/docs/evidence/ios`, external: true },
    { label: "Which model ran where", href: `${REPO}/blob/main/docs/TEST-MATRIX.md`, external: true },
  ];
}

/** `replay` is true only when a published run exists, so the line never points at a replay that is not there. */
export function d2Copy(state: DeviceState, opts: { replay: boolean; downloadFailed?: boolean }): { lines: string[] } {
  if (opts.downloadFailed && state !== "text" && state !== "image") {
    return { lines: ["This browser could not download its built-in model. Nothing private was sent."] };
  }
  switch (state) {
    case "no-model":
      return { lines: [opts.replay ? "This browser has no built-in model. Nothing private was sent. The replay above shows a recorded drill run." : "This browser has no built-in model. Nothing private was sent."] };
    case "downloadable":
      return { lines: ["This browser can download its built-in model first. Press Get this laptop ready to start; it can take a few minutes."] };
    // The check asks Chrome what its model can take and reads nothing, so these say "ready", never "read".
    case "text":
      return { lines: ["The built-in model on this laptop is ready for the sighting note.", "It cannot read photos on this laptop."] };
    case "image":
      return { lines: ["The built-in model on this laptop is ready for the sighting note and photos."] };
  }
}

const RUN_PARTS = ["runId", "label", "exportedAt", "incident", "segments", "teams", "devices", "events", "plans", "measurements"] as const;
export type PublishedRun = Record<(typeof RUN_PARTS)[number], unknown>;

export type PublishedRunLoad =
  | { state: "run"; run: PublishedRun }
  /** The file is a run the replay reader refuses; `reason` says why in plain words. */
  | { state: "refused"; run: PublishedRun; reason: string }
  | { state: "none" }
  | { state: "invalid" }
  | { state: "unavailable" };

/**
 * The published run, or why there is none. The run is checked by the same reader the replay uses
 * (fromPublishedRun), so the page never calls a file a run that the replay then refuses. A file that is
 * not a JSON object is "invalid"; nothing from either is shown as numbers.
 */
export async function loadPublishedRun(fetchFn: (url: string, init?: RequestInit) => Promise<Response> = fetch): Promise<PublishedRunLoad> {
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
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { state: "invalid" };
  const run = body as PublishedRun;
  const read = fromPublishedRun(run);
  return read.ok ? { state: "run", run } : { state: "refused", run, reason: read.reason };
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
