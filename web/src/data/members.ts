// Command removes a searcher or family member from its incident through the removeMember callable: the server
// records the removal (the rules then refuse that account at once), clears its claims and revokes its sessions.
// Command cannot remove itself or another command.

import { httpsCallable, type Functions } from "firebase/functions";
import { collection, onSnapshot, type Firestore } from "firebase/firestore";

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

/** A server-written members record (incidents/{id}/members/{uid}); accounts that joined before it existed have none. */
export type MemberDoc = { role: string; team: string | null };
export type MemberRow = { uid: string; role: "searcher" | "family"; teamId: string | null; label: string; removed: boolean };

/**
 * Everyone command can remove: the members records joined with the authors of the incident's events (an account that
 * joined before the records existed is known only by what it wrote). Never listed: the caller, and any account ever
 * seen as command (in a members record or in any of its events, whichever came first). A members record wins over an
 * event for role and team. Two people with the same label are told apart by the last four characters of their id. Removed members come last.
 */
export function memberRows(
  members: Readonly<Record<string, MemberDoc>>,
  events: readonly Readonly<Record<string, unknown>>[],
  removed: ReadonlySet<string>,
  teams: readonly { teamId: string; name: string }[],
  selfUid: string | null = null,
): MemberRow[] {
  const command = new Set<string>(selfUid ? [selfUid] : []);
  for (const e of events) if (e["role"] === "command" && typeof e["authorUid"] === "string") command.add(e["authorUid"]);
  for (const [uid, m] of Object.entries(members)) if (m.role === "command") command.add(uid);
  const known = new Map<string, { role: string; teamId: string | null }>();
  for (const e of events) {
    const uid = e["authorUid"], teamId = e["teamId"];
    if (typeof uid !== "string" || known.has(uid)) continue;
    known.set(uid, { role: String(e["role"]), teamId: typeof teamId === "string" ? teamId : null });
  }
  for (const [uid, m] of Object.entries(members)) known.set(uid, { role: m.role, teamId: m.team ?? null });
  const name = (teamId: string | null) => teams.find((t) => t.teamId === teamId)?.name ?? teamId ?? "No team";
  const rows: MemberRow[] = [];
  for (const [uid, k] of known) {
    if (command.has(uid) || (k.role !== "searcher" && k.role !== "family")) continue;
    const label = k.role === "family" ? "Family member" : `${name(k.teamId)} searcher`;
    rows.push({ uid, role: k.role, teamId: k.teamId, label, removed: removed.has(uid) });
  }
  const count = new Map<string, number>();
  for (const r of rows) count.set(r.label, (count.get(r.label) ?? 0) + 1);
  for (const r of rows) if ((count.get(r.label) ?? 0) > 1) r.label = `${r.label} (${r.uid.slice(-4)})`;
  return rows.sort((a, b) => Number(a.removed) - Number(b.removed) || a.label.localeCompare(b.label));
}

/**
 * Command's live view of the members records and the removal records. Either listener that is refused (rules not yet
 * deployed, or not command) reads as empty, so the list falls back to event authors.
 */
export function subscribeMembers(db: Firestore, incidentId: string, onMembers: (m: Record<string, MemberDoc>) => void,
  onRemoved: (uids: Set<string>) => void): () => void {
  const stopMembers = onSnapshot(collection(db, "incidents", incidentId, "members"), (s) => {
    const m: Record<string, MemberDoc> = {};
    for (const d of s.docs) {
      const role = d.get("role"), team = d.get("team");
      if (typeof role === "string") m[d.id] = { role, team: typeof team === "string" ? team : null };
    }
    onMembers(m);
  }, () => onMembers({}));
  const stopRemoved = onSnapshot(collection(db, "incidents", incidentId, "removed"), (s) => onRemoved(new Set(s.docs.map((d) => d.id))),
    () => onRemoved(new Set()));
  return () => { stopMembers(); stopRemoved(); };
}
