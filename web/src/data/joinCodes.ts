// Command gives one role of its drill a new join code through the rotateJoinCode callable (functions/src/codes.ts): the
// server deletes every code of that role for the incident and returns the new one once, so a code that got out stops
// admitting anyone. People already in the search stay in; only new joins need the new code.

import { httpsCallable, type Functions } from "firebase/functions";

export type CodeRole = "searcher" | "family";
export type Rotation = { code: string; role: CodeRole; replaced: number };

/** The join code alphabet the server draws from (functions/src/join.ts CODE_FORMAT): digits and capitals without I, L, O, U. */
const CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

/** The server's answer, checked: a code of the right shape for the role asked, and how many old codes it replaced. */
export function parseRotation(reply: unknown, role: CodeRole): Rotation {
  const r = (typeof reply === "object" && reply !== null ? reply : {}) as Record<string, unknown>;
  if (typeof r["code"] !== "string" || !CODE.test(r["code"])) throw new Error("not a join code");
  if (r["role"] !== role) throw new Error("a code for another role");
  if (typeof r["replaced"] !== "number" || !Number.isInteger(r["replaced"]) || r["replaced"] < 0) throw new Error("no count of replaced codes");
  return { code: r["code"], role, replaced: r["replaced"] };
}

export async function rotateJoinCode(functions: Functions, incidentId: string, role: CodeRole): Promise<Rotation> {
  const call = httpsCallable<{ incidentId: string; role: CodeRole }, unknown>(functions, "rotateJoinCode");
  return parseRotation((await call({ incidentId, role })).data, role);
}

/** The sentence for a refused replacement: the server's reason when it gave one, never the person's fault for a refused
 *  sign-in or App Check token or a dropped link. */
export function rotateErrorMessage(e: unknown): string {
  const o = typeof e === "object" && e !== null ? (e as { code?: unknown; details?: unknown }) : {};
  const code = typeof o.code === "string" ? o.code : "";
  const reason = typeof o.details === "object" && o.details !== null ? (o.details as { reason?: unknown }).reason : undefined;
  if (reason === "not_command") return "Only command can replace a join code.";
  if (reason === "practice_search") return "A practice search has no join codes.";
  if (reason === "not_open") return "This search has ended, so it takes no new members.";
  if (reason === "collision") return "Could not make a new code. Try again.";
  if (reason === "bad_role") return "Only a searcher or family code can be replaced.";
  if (reason === "bad_incident_id") return "This search's link is not valid. Reload the page.";
  if (reason === "not_signed_in" || code.endsWith("unauthenticated")) return "Refused: sign-in or App Check. Reload the page and try again.";
  if (code.endsWith("unavailable")) return "No connection. Try again when the link is back.";
  return "Could not replace the code. Try again.";
}
