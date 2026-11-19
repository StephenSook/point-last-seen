import { createHash } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
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
/** The family's topic ends in "-family", so a team with that id would receive the family's pushes. */
const FAMILY_TOPIC_NAME = "family";
const pushableTeam = (t: string) => TEAM_ID.test(t) && t.toLowerCase() !== FAMILY_TOPIC_NAME;
/** A plan doc id as the web writes it: the version, zero-padded to at least 4 digits (web/src/data/plans.ts). */
export const planDocId = (version: number): string => String(version).padStart(4, "0");

interface Assignment { teamId: string; segmentIds: string[]; taskText: string }
/** Firestore's ALREADY_EXISTS status code, which create() reports for a document that is already there. */
const ALREADY_EXISTS = 6;

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
 * per changed team. Returns the teams it sent to. A plan a newer version has already replaced announces nothing, and
 * each team's notice for a version is claimed before it is sent (pushBudget/plan-{version}-{team}), so a redelivered
 * event sends nothing twice; a send that fails gives its claim back, so the next delivery can send it.
 */
export async function handlePlanCreated(db: Firestore, messaging: { send(m: Message): Promise<string> },
  incidentId: string, versionId: string, nowMs: number): Promise<{ teams: string[] }> {
  if (!/^[0-9]{1,9}$/.test(versionId) || Number(versionId) < 1) return { teams: [] };
  const version = Number(versionId);
  const base = db.doc(`incidents/${incidentId}`);
  const inc = await base.get();
  // A practice search is a judge's own sandbox, with no phone on its teams: no push.
  if (inc.get("mode") === "judge") return { teams: [] };
  const [plan, prev, newer, teamDocs] = await Promise.all([base.collection("plans").doc(versionId).get(),
    version > 1 ? base.collection("plans").doc(planDocId(version - 1)).get() : Promise.resolve(null),
    base.collection("plans").doc(planDocId(version + 1)).get(), base.collection("teams").listDocuments()]);
  if (newer.exists) {
    console.log(JSON.stringify({ event: "notifyPlanApproved", incidentId, version, teams: [], reason: "superseded" }));
    return { teams: [] };
  }
  const next = (plan.get("assignments") ?? []) as Assignment[];
  const before = prev?.exists ? ((prev.get("assignments") ?? []) as Assignment[]) : null;
  // Only teams the incident has, with plain ids, and a bounded number per plan.
  const known = new Set(teamDocs.map(d => d.id));
  const teams = changedTeams(before, next).filter(t => pushableTeam(t) && known.has(t)).slice(0, MAX_PUSHES_PER_PLAN);
  const drill = inc.get("mode") === "drill";
  const sentTo: string[] = [];
  for (const teamId of teams) {
    const claim = base.collection("pushBudget").doc(`plan-${planDocId(version)}-${teamId}`);
    try {
      await claim.create({ atMs: nowMs });
    } catch (e) {
      if ((e as { code?: unknown }).code === ALREADY_EXISTS) continue;
      throw e;
    }
    try {
      await messaging.send(planMessage({ incidentId, teamId, version, drill, nowMs }));
    } catch (e) {
      await claim.delete();
      throw e;
    }
    sentTo.push(teamId);
  }
  console.log(JSON.stringify({ event: "notifyPlanApproved", incidentId, version, teams: sentTo }));
  return { teams: sentTo };
}

/** The most family pushes one incident sends in a UTC day, questions and search-state changes together. */
export const FAMILY_PUSHES_PER_DAY = 20;
/** What a family push may say: a question is waiting, teams are searching, or the search is paused. Never an outcome. */
export type FamilyKind = "question" | "searching" | "paused";
const SEARCH_STATES: readonly FamilyKind[] = ["searching", "paused"];
const FAMILY_BODY: Record<FamilyKind, string> = {
  question: "The search lead has a question.",
  searching: "Teams are searching now.",
  paused: "The search is paused. The search lead will call you.",
};
/** A Firestore auto-id, as the rules require: nothing a person typed can ride the push as an id. */
const QUESTION_ID = /^[A-Za-z0-9]{20}$/;
/** An incident id that makes a valid topic name (FCM allows [A-Za-z0-9-_.~%]) and a single document path segment. */
const INCIDENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** One topic per incident for its family; the family app subscribes on join. */
export function familyTopic(incidentId: string): string {
  return `pls-${incidentId}-${FAMILY_TOPIC_NAME}`;
}

/**
 * A family push: fixed wording and the incident id only. Neither the question's text nor its id leaves Firestore; the
 * family app lists unanswered questions from Firestore, behind the rules, when it opens.
 */
export function familyMessage(o: { incidentId: string; kind: FamilyKind; drill: boolean; nowMs: number }): Message {
  const collapse = `${o.incidentId}-${FAMILY_TOPIC_NAME}`;
  return {
    topic: familyTopic(o.incidentId),
    notification: { title: o.drill ? "Training drill" : "Point Last Seen", body: FAMILY_BODY[o.kind] },
    data: { kind: o.kind, incidentId: o.incidentId },
    android: { collapseKey: collapse, ttl: TTL_S * 1000, priority: "high" },
    apns: { headers: { "apns-collapse-id": collapse, "apns-expiration": String(Math.floor(o.nowMs / 1000) + TTL_S) } },
  };
}

/**
 * Sends one family push for one trigger event, unless the ids are malformed, the event was already handled (a
 * redelivery), the incident is a judge sandbox, the event is stale (a question to an incident no longer open, or a
 * state the incident has since left) or today's budget is used. The event's claim and the budget slot are taken in one
 * transaction with the incident read, so a redelivered event can neither send twice nor use the budget twice.
 */
async function sendFamily(db: Firestore, messaging: { send(m: Message): Promise<string> }, incidentId: string,
  kind: FamilyKind, eventId: string, nowMs: number): Promise<boolean> {
  if (!INCIDENT_ID.test(incidentId) || typeof eventId !== "string" || eventId.length === 0) return false;
  const incRef = db.doc(`incidents/${incidentId}`);
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const budget = incRef.collection("pushBudget").doc(`family-${day}`);
  const claim = incRef.collection("pushBudget").doc(`event-${createHash("sha256").update(eventId).digest("hex")}`);
  const outcome = await db.runTransaction(async tx => {
    const [inc, used, seen] = await tx.getAll(incRef, budget, claim);
    if (seen!.exists) return { send: false, reason: "already sent" } as const;
    // A practice search is a judge's own sandbox, with no family phone: no push.
    if (!inc!.exists || inc!.get("mode") === "judge") return { send: false, reason: "no family" } as const;
    // Still true: the incident is open and not past its end, and a state notice's state is still the incident's.
    const exp = inc!.get("expiresAt");
    const open = inc!.get("status") === "open" && (exp == null || (exp instanceof Timestamp && exp.toMillis() > nowMs));
    const current = open && (kind === "question" || inc!.get("searchState") === kind);
    if (!current) return { send: false, reason: "stale" } as const;
    if (((used!.get("count") as number | undefined) ?? 0) >= FAMILY_PUSHES_PER_DAY) return { send: false, reason: "daily cap" } as const;
    tx.set(budget, { count: FieldValue.increment(1) }, { merge: true });
    tx.create(claim, { kind, atMs: nowMs });
    return { send: true, drill: inc!.get("mode") === "drill" } as const;
  });
  // Ids and text stay out of the log: the incident and the kind are enough to follow a push.
  if (!outcome.send) {
    console.log(JSON.stringify({ event: "notifyFamily", incidentId, kind, sent: false, reason: outcome.reason }));
    return false;
  }
  await messaging.send(familyMessage({ incidentId, kind, drill: outcome.drill, nowMs }));
  console.log(JSON.stringify({ event: "notifyFamily", incidentId, kind, sent: true }));
  return true;
}

/** notifyFamilyQuestion's work: one push to the family that command has asked a question. */
export async function handleFamilyQuestion(db: Firestore, messaging: { send(m: Message): Promise<string> },
  incidentId: string, questionId: string, eventId: string, nowMs: number): Promise<boolean> {
  if (!QUESTION_ID.test(questionId)) return false;
  return sendFamily(db, messaging, incidentId, "question", eventId, nowMs);
}

/** notifyFamilySearchState's work: one push when the incident's searchState becomes searching or paused. */
export async function handleSearchState(db: Firestore, messaging: { send(m: Message): Promise<string> }, incidentId: string,
  before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined, eventId: string,
  nowMs: number): Promise<boolean> {
  const next = after?.searchState;
  if (typeof next !== "string" || !(SEARCH_STATES as readonly string[]).includes(next) || before?.searchState === next) return false;
  return sendFamily(db, messaging, incidentId, next as FamilyKind, eventId, nowMs);
}
