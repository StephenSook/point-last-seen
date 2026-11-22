// Command removes a searcher or family member from its incident through the removeMember callable: the server
// records the removal (the rules then refuse that account at once), clears its claims and revokes its sessions.
// Command cannot remove itself or another command.

import { httpsCallable, type Functions } from "firebase/functions";
import { collection, onSnapshot, type Firestore } from "firebase/firestore";

export async function removeMember(functions: Functions, incidentId: string, uid: string): Promise<void> {
  await httpsCallable<{ incidentId: string; uid: string }, { removed: true }>(functions, "removeMember")({ incidentId, uid });
}

/** The sentence for a failed removal: the server's reason when it gave one, and never the person's fault for a
 *  refused sign-in or App Check token or a dropped link. */
export function removeErrorMessage(e: unknown): string {
  const o = typeof e === "object" && e !== null ? (e as { code?: unknown; details?: unknown }) : {};
  const code = typeof o.code === "string" ? o.code : "";
  const reason = typeof o.details === "object" && o.details !== null ? (o.details as { reason?: unknown }).reason : undefined;
  if (reason === "self") return "You cannot remove yourself.";
  if (reason === "command_target") return "Command cannot be removed.";
  if (reason === "not_command") return "Only command can remove someone.";
  if (reason === "not_member") return "That person is no longer in this search.";
  if (code.endsWith("unauthenticated")) return "Refused: sign-in or App Check. Reload the page and try again.";
  if (code.endsWith("unavailable")) return "No connection. Try again when the link is back.";
  return "Could not remove them. Try again.";
}

/** A server-written members record (incidents/{id}/members/{uid}); accounts that joined before it existed have none. */
export type MemberDoc = { role: string; team: string | null };
export type MemberRow = { uid: string; role: "searcher" | "family"; teamId: string | null; label: string; removed: boolean };

/**
 * Everyone command can remove: the incident's members records (written by the server at join), never the caller and
 * never a command record. An account with no record is not listed: it either left (Leave and delete this sign-in
 * deletes its records) or never joined through the server. Its reports and flags still name its team from the events.
 * People with the same label are told apart by the end of their id, longer until every label is distinct. Removed
 * members come last.
 */
export function memberRows(
  members: Readonly<Record<string, MemberDoc>>,
  removed: ReadonlySet<string>,
  teams: readonly { teamId: string; name: string }[],
  selfUid: string | null = null,
): MemberRow[] {
  const known = new Map<string, { role: string; teamId: string | null }>();
  for (const [uid, m] of Object.entries(members)) if (uid !== selfUid) known.set(uid, { role: m.role, teamId: m.team ?? null });
  const name = (teamId: string | null) => teams.find((t) => t.teamId === teamId)?.name ?? teamId ?? "No team";
  const rows: MemberRow[] = [];
  for (const [uid, k] of known) {
    if (k.role !== "searcher" && k.role !== "family") continue;
    const label = k.role === "family" ? "Family member" : `${name(k.teamId)} searcher`;
    rows.push({ uid, role: k.role, teamId: k.teamId, label, removed: removed.has(uid) });
  }
  const groups = new Map<string, MemberRow[]>();
  for (const r of rows) groups.set(r.label, [...(groups.get(r.label) ?? []), r]);
  for (const [label, group] of groups) {
    if (group.length < 2) continue;
    let n = 4;
    while (n < 128 && new Set(group.map((r) => r.uid.slice(-n))).size < group.length) n += 2;
    for (const r of group) r.label = `${label} (${r.uid.slice(-n)})`;
  }
  return rows.sort((a, b) => Number(a.removed) - Number(b.removed) || a.label.localeCompare(b.label));
}

/**
 * Command's live view of the members records and the removal records. A refused read keeps what was shown (so a removed
 * person never looks removable again) and calls onRefused: Firestore stops a listener after a refusal, so the list
 * may be out of date from then on.
 */
export function subscribeMembers(db: Firestore, incidentId: string, onMembers: (m: Record<string, MemberDoc>) => void,
  onRemoved: (uids: Set<string>) => void, onRefused: () => void = () => undefined): () => void {
  const stopMembers = onSnapshot(collection(db, "incidents", incidentId, "members"), (s) => {
    const m: Record<string, MemberDoc> = {};
    for (const d of s.docs) {
      const role = d.get("role"), team = d.get("team");
      if (typeof role === "string") m[d.id] = { role, team: typeof team === "string" ? team : null };
    }
    onMembers(m);
  }, () => onRefused());
  const stopRemoved = onSnapshot(collection(db, "incidents", incidentId, "removed"), (s) => onRemoved(new Set(s.docs.map((d) => d.id))),
    () => onRefused());
  return () => { stopMembers(); stopRemoved(); };
}
