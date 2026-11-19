import type { Firestore } from "firebase-admin/firestore";
import type { Message } from "firebase-admin/messaging";

/** How long a push stays worth delivering: an assignment two hours old has usually changed again. */
const TTL_S = 7200;
/** The most pushes one plan sends: a plan is written by command, so its team list is bounded here. */
export const MAX_PUSHES_PER_PLAN = 20;
/**
 * A team id with no "-": incident ids hold "-", so the last "-" in a topic is the separator and no team can name
 * another incident's topic (pls-I1-dev-1-T1 would read as incident I1-dev-1, team T1).
 */
const TEAM_ID = /^[A-Za-z0-9_]{1,32}$/;
/** A plan doc id as the web writes it: the version, zero-padded to at least 4 digits (web/src/data/plans.ts). */
export const planDocId = (version: number): string => String(version).padStart(4, "0");

interface Assignment { teamId: string; segmentIds: string[]; taskText: string }

/** The teams whose assignment is new, changed or dropped since the previous plan, sorted. */
export function changedTeams(prev: Assignment[] | null, next: Assignment[]): string[] {
  const key = (x: Assignment) => JSON.stringify([[...x.segmentIds].sort(), x.taskText]);
  const before = new Map((prev ?? []).map(x => [x.teamId, key(x)]));
  const after = new Map(next.map(x => [x.teamId, key(x)]));
  const teams = new Set<string>();
  for (const [t, k] of after) if (before.get(t) !== k) teams.add(t);
  for (const t of before.keys()) if (!after.has(t)) teams.add(t);
  return [...teams].sort();
}

/** One topic per team in an incident; the searcher app subscribes to its own team's. */
export function teamTopic(incidentId: string, teamId: string): string {
  return `pls-${incidentId}-${teamId}`;
}

/** The push for one team: no person, place or task text, only that a new task is waiting. */
export function planMessage(o: { incidentId: string; teamId: string; version: number; drill: boolean; nowMs: number }): Message {
  return {
    topic: teamTopic(o.incidentId, o.teamId),
    notification: { title: o.drill ? "Training drill: new assignment" : "New assignment",
      body: "Your team has a new task. Open Point Last Seen to see it." },
    data: { incidentId: o.incidentId, teamId: o.teamId, planVersion: String(o.version) },
    android: { collapseKey: o.incidentId, ttl: TTL_S * 1000, priority: "high" },
    apns: { headers: { "apns-collapse-id": o.incidentId, "apns-expiration": String(Math.floor(o.nowMs / 1000) + TTL_S) } },
  };
}

/**
 * notifyPlanApproved's work for one new plans/{0001...} doc: compares it with the previous version's doc and sends one push
 * per changed team. Returns the teams it sent to.
 */
export async function handlePlanCreated(db: Firestore, messaging: { send(m: Message): Promise<string> },
  incidentId: string, versionId: string, nowMs: number): Promise<{ teams: string[] }> {
  if (!/^[0-9]{1,9}$/.test(versionId) || Number(versionId) < 1) return { teams: [] };
  const version = Number(versionId);
  const base = db.doc(`incidents/${incidentId}`);
  const inc = await base.get();
  // A practice search is a judge's own sandbox, with no phone on its teams: no push.
  if (inc.get("mode") === "judge") return { teams: [] };
  const [plan, prev, teamDocs] = await Promise.all([base.collection("plans").doc(versionId).get(),
    version > 1 ? base.collection("plans").doc(planDocId(version - 1)).get() : Promise.resolve(null), base.collection("teams").listDocuments()]);
  const next = (plan.get("assignments") ?? []) as Assignment[];
  const before = prev?.exists ? ((prev.get("assignments") ?? []) as Assignment[]) : null;
  // Only teams the incident has, with plain ids, and a bounded number per plan.
  const known = new Set(teamDocs.map(d => d.id));
  const teams = changedTeams(before, next).filter(t => TEAM_ID.test(t) && known.has(t)).slice(0, MAX_PUSHES_PER_PLAN);
  const drill = inc.get("mode") === "drill";
  for (const teamId of teams) await messaging.send(planMessage({ incidentId, teamId, version, drill, nowMs }));
  console.log(JSON.stringify({ event: "notifyPlanApproved", incidentId, version, teams }));
  return { teams };
}
