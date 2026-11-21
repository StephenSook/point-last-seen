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
  if (code.endsWith("resource-exhausted")) return "Too many join attempts from this browser. Try again in an hour.";
  if (code.endsWith("permission-denied")) return "That code did not match this incident.";
  if (code.endsWith("unavailable")) return "No connection. Try again when the link is back.";
  return "Could not join. Check the incident id and the code.";
}

/** The join page's sentence for a failed anonymous sign-in; each one comes with a Try again button. */
export function signInErrorMessage(e: unknown): string {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code === "auth/too-many-requests") return "Too many sign-ins from this network. Try again later.";
  if (code === "auth/network-request-failed") return "No connection. Try again when the link is back.";
  return "Could not sign in. Try again.";
}

/** The field a join error is about, so the form can show it under that field; null for an error about the whole form. */
export function joinErrorField(message: string): "incident" | "code" | null {
  if (message === "Enter the incident id.") return "incident";
  if (message === "The join code has 8 characters." || message === "That code did not match this incident.") return "code";
  return null;
}
