// Joining an incident: the joinIncident callable checks the code and sets the
// caller's claims { inc, role, team }. The ID token is then refreshed so the
// new claims reach Firestore rules at once.

import type { Auth } from "firebase/auth";
import { httpsCallable, type Functions } from "firebase/functions";

export type Role = "command" | "searcher" | "family";
export type JoinRequest = { incidentId: string; joinCode: string; role: Role; teamId?: string };

export function joinRequest(incidentId: string, code: string, role: Role, teamId?: string): JoinRequest {
  const id = incidentId.trim();
  if (id === "") throw new Error("Enter the incident id.");
  const joinCode = code.trim().toUpperCase().replace(/[\s-]/g, "");
  if (joinCode.length !== 8) throw new Error("The join code has 8 characters.");
  if (role === "searcher") {
    if (!teamId) throw new Error("Pick a team to join as a searcher.");
    return { incidentId: id, joinCode, role, teamId };
  }
  return { incidentId: id, joinCode, role };
}

export async function joinIncident(functions: Functions, auth: Auth, req: JoinRequest): Promise<void> {
  await httpsCallable<JoinRequest, { ok: true }>(functions, "joinIncident")(req);
  await auth.currentUser?.getIdToken(true);
}

/** The join form's sentence for a failed join. An App Check refusal never reads as a wrong code. */
export function joinErrorMessage(e: unknown): string {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code.endsWith("unauthenticated")) return "Join refused by App Check. Try a normal browser window.";
  if (code.endsWith("permission-denied")) return "That code did not match this incident.";
  if (code.endsWith("unavailable")) return "No connection. Try again when the link is back.";
  return "Could not join. Check the incident id and the code.";
}
