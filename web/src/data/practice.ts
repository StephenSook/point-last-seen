// "Try a practice search" (judge's door): a capped, credential-free practice incident on the real
// park grid. startJudgeSession (server, App Check enforced) makes or re-opens the caller's own
// sandbox and grants a command seat on it; the sign-in is refreshed so the new claims apply.

import { httpsCallable, type Functions } from "firebase/functions";
import type { Auth } from "firebase/auth";
import { MissingConfigError } from "../firebaseConfig";
import { callableError } from "./callableError";

type Deps = { call: () => Promise<{ data: unknown }>; refresh: () => Promise<unknown> };

export async function startPracticeSearch(d: Deps): Promise<string> {
  const { data } = await d.call();
  const r = data as { incidentId?: unknown; role?: unknown } | null;
  if (!r || typeof r.incidentId !== "string" || !r.incidentId.startsWith("judge-") || r.role !== "command") {
    throw new Error("The practice search answer was not a command seat on a practice incident.");
  }
  await d.refresh();
  return r.incidentId;
}

export function practiceSearch(functions: Functions, auth: Auth): Promise<string> {
  return startPracticeSearch({
    call: () => httpsCallable(functions, "startJudgeSession")(),
    refresh: () => auth.currentUser?.getIdToken(true) ?? Promise.reject(new Error("not signed in")),
  });
}

// The server's refusals are already plain sentences meant for the person; show them as they are. A
// stable details.reason marks one when the server sends it; until then the sentence itself does.
const SERVER_SENTENCES = new Set([
  "One new practice search per hour. Try again later.",
  "Practice searches are full for today. Try again tomorrow.",
  "No practice search is available right now.",
]);
const SERVER_REASONS = new Set(["hourly_limit", "daily_limit", "no_practice"]);

const SETTING_UP = "Your practice search is still being set up. Try again in a moment.";

/** The server is still setting up this browser's practice search (a second start, or a released copy): retry. */
export function isSettingUp(e: unknown): boolean {
  const { code, message, reason } = callableError(e);
  return code.endsWith("unavailable") && (reason === "setup_busy" || message === SETTING_UP);
}

export function practiceErrorMessage(e: unknown): string {
  // A copy built with no Firebase settings (a fresh clone with no .env) cannot reach the backend at all.
  if (e instanceof MissingConfigError) return "This copy has no Firebase settings, so it cannot start a practice search. Use the live site.";
  const { code, message, reason } = callableError(e);
  const refusal = reason !== null ? SERVER_REASONS.has(reason) : SERVER_SENTENCES.has(message);
  if ((code.endsWith("resource-exhausted") || code.endsWith("failed-precondition")) && refusal && message !== "") return message;
  if (isSettingUp(e)) return message || SETTING_UP;
  if (code.endsWith("unavailable")) return "No connection. Try again when the link is back.";
  if (code.endsWith("unauthenticated")) return "This browser could not be checked. Reload and try again.";
  return "The practice search could not start. Try again.";
}
