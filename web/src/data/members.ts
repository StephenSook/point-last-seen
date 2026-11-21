// Command removes a searcher or family member from its incident through the removeMember callable: the server
// records the removal (the rules then refuse that account at once), clears its claims and revokes its sessions.
// Command cannot remove itself or another command.

import { httpsCallable, type Functions } from "firebase/functions";

export async function removeMember(functions: Functions, incidentId: string, uid: string): Promise<void> {
  await httpsCallable<{ incidentId: string; uid: string }, { removed: true }>(functions, "removeMember")({ incidentId, uid });
}

/** The sentence for a failed removal: the server's reason when it gave one, and never the person's fault for a
 *  refused App Check token or a dropped link. */
export function removeErrorMessage(e: unknown): string {
  const o = typeof e === "object" && e !== null ? (e as { code?: unknown; details?: unknown }) : {};
  const code = typeof o.code === "string" ? o.code : "";
  const reason = typeof o.details === "object" && o.details !== null ? (o.details as { reason?: unknown }).reason : undefined;
  if (reason === "self") return "You cannot remove yourself.";
  if (reason === "command_target") return "Command cannot be removed.";
  if (reason === "not_command") return "Only command can remove someone.";
  if (reason === "not_member") return "That person is no longer in this search.";
  if (code.endsWith("unauthenticated")) return "Refused by App Check. Try a normal browser window.";
  if (code.endsWith("unavailable")) return "No connection. Try again when the link is back.";
  return "Could not remove them. Try again.";
}
