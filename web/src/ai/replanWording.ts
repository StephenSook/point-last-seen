// Plan wording on the SDK's own hybrid mode, this laptop first: the cloud answers only when the browser has no
// local model, and the route records which one ran (the SDK's inferenceSource), never the mode asked for. The plan itself is
// drafted by code, and so is each team's task line ("Search segment AA."). A model only picks, for each team, its main
// reason: one fact from those code found for that team's own segments (reasonCodes.ts), in a closed schema. Code adds
// a supporting fact by a fixed rule and writes every sentence of the reasons and the summary. A reply whose teams
// differ from the draft, or that picks a code outside a team's own facts, falls to a fixed template, and the route
// says "rules". No text a model writes reaches the page.

import { InferenceMode, type HybridParams } from "firebase/ai";
import type { DraftAssignment, PlanWording, RankedSegment, RouteRecord } from "@pls/engine"; import { FACT_CODES, renderReason, renderSummary, supportingFact, teamFacts, type FactCode, type PlanFacts } from "./reasonCodes";
import { onDeviceCreateOptions } from "./gate";
import { CLOUD_MAX_OUTPUT_TOKENS } from "./limits";

export type PlanDraft = { eventSetHash: string; priorVersion: number; rank: RankedSegment[]; assignments: DraftAssignment[]; facts?: PlanFacts };

/** Cloud replies on gemini-3.5-flash-lite took 0.8 to 1.8 s (S4 step 4 controls, 2026-11-17); 15 s leaves room for a long table. */
export const REPLY_TIMEOUT_MS = 15_000;

// Every sentence the page shows is written by code: task lines here, reasons and the summary in reasonCodes.ts.

/**
 * The reply's shape: one property per team id, holding the code of that team's main fact. This general form names no
 * team; a plan's own schema (planWordingJson) names its teams and gives each an enum of only that team's own facts,
 * so a constrained reply can never pick another team's fact (the cloud model did, on the earlier list shape, which let
 * every team name any code).
 * No summary and no sentences: code writes them from the codes chosen.
 */
export const PLAN_WORDING_JSON: PlanWordingSchema = {
  type: "object",
  properties: {},
  required: [],
};
/** Each team with a fact to choose, with its own fact codes in FACT_CODES order. */
export type ChoiceTeams = Readonly<Record<string, readonly FactCode[]>>;
// The per-plan form, built from the plan's facts.
export type PlanWordingSchema = { type: "object"; properties: Record<string, { type: "string"; enum: readonly FactCode[] }>; required: readonly string[] };

const SYSTEM = [
  "Code has already decided which team searches which segment, and code writes every sentence of the plan.",
  "For each team, choose the one fact from that team's own list that best explains why it searches there.",
  "Use only codes from that team's own list. Teams with no segment are left out.",
  "Return JSON with one property per team id: the code of that team's main fact.",
].join(" ");

export function wordingParams(model: string, teamIds: ChoiceTeams | null = null): HybridParams {
  return {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: {
      model,
      systemInstruction: SYSTEM,
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: planWordingJson(teamIds), maxOutputTokens: CLOUD_MAX_OUTPUT_TOKENS },
    },
    onDeviceParams: {
      createOptions: onDeviceCreateOptions("text", SYSTEM),
      promptOptions: { responseConstraint: planWordingJson(teamIds) },
    },
  };
}

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
/**
 * Each team's segments and the facts code found for them, with the segments each fact holds for, in the user text
 * (the SDK passes only contents and our prompt options to Chrome).
 */
export function planPrompt(draft: PlanDraft): string {
  const facts = teamFacts(draft);
  const lines = ["Teams, their segments, and the facts code found for those segments:"];
  for (const a of draft.assignments) {
    const f = facts.get(a.teamId);
    lines.push(
      f
        ? `${a.teamId} searches ${a.segmentIds.join(", ")}. Facts: ${[...f].map(([code, ids]) => `${code} (${ids.join(", ")})`).join(", ")}`
        : `${a.teamId} has no segment. Facts: none.`,
    );
  }
  return lines.join("\n");
}

/** A team's task line, always from the plan's own assignment, never from a model. */
export function taskTextFor(a: DraftAssignment): string {
  return a.segmentIds.length > 0 ? `Search segment ${a.segmentIds.join(", ")}.` : "No segment left to assign.";
}

export function templateWording(draft: PlanDraft): PlanWording {
  const poa = new Map(draft.rank.map((r) => [r.segmentId, r.poa]));
  return {
    assignments: draft.assignments.map((a) => ({
      teamId: a.teamId,
      taskText: taskTextFor(a),
      reason: a.segmentIds.length > 0 ? `POA now ${pct(poa.get(a.segmentIds[0]!) ?? 0)}.` : "No segment left to assign.",
    })),
    summary: "Assignments follow the current POA ranking.",
  };
}

export const NOT_A_TEAM_FACT = "a reason code is not one of that team's own facts";
/** Each team with segments and a fact, with its codes (what the schema offers it); one with no fact is left out. */
export function choiceTeams(draft: PlanDraft): Record<string, FactCode[]> {
  return Object.fromEntries([...teamFacts(draft)].filter(([, f]) => f.size > 0).map(([t, f]) => [t, [...f.keys()]]));
}

/**
 * Whether the reply names exactly the teams with a fact, each with one code from its own facts and nothing else.
 */
export function checkChoice(draft: PlanDraft, reply: unknown): { ok: true; codes: Map<string, FactCode[]> } | { ok: false; reason: string } {
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) return { ok: false, reason: "no assignments" };
  const m = reply as Record<string, unknown>;
  const facts = teamFacts(draft);
  if ([...facts.values()].some((f) => f.size === 0)) return { ok: false, reason: "a team with segments has no fact to choose" };
  const want = [...facts.keys()].sort();
  const got = Object.keys(m).sort();
  if (want.length !== got.length || want.some((t, i) => t !== got[i])) return { ok: false, reason: "team ids differ from the draft" };
  const codes = new Map<string, FactCode[]>();
  for (const team of want) {
    const c = m[team];
    if (typeof c !== "string") return { ok: false, reason: "a team's reason code is not text" };
    if (!facts.get(team)!.has(c as FactCode)) return { ok: false, reason: NOT_A_TEAM_FACT };
    codes.set(team, [c as FactCode]);
  }
  return { ok: true, codes };
}

export type WordingDeps = {
  generate: (text: string) => Promise<{ text: string; inferenceSource: string | undefined }>;
  now: () => number;
  timeoutMs: number;
  model: string;
  /** Remote Config kill_cloud: when true the cloud is never called. */
  killCloud?: boolean;
};

/** A model asked for wording whose answer was not used: where it ran (as far as the SDK said) and why. */
export type WordingAttempt = { route: RouteRecord; failure: "error" | "timeout" | "unreadable" | "rejected" };
/** `attempt` is present only when a model was asked and its answer was not used; `route` is what worded the plan. */
/** `promptBytes`: the UTF-8 size of the plan text a model is sent (for the receipt), when this file built it. */
/** `codes`: per team, the main reason the model chose and the supporting fact code added; only when the model's choice was used. */
export type ChosenReason = { main: FactCode; support: FactCode | null };
export type WordedPlan = { wording: PlanWording; route: RouteRecord; notice: string | null; attempt?: WordingAttempt; promptBytes?: number; codes?: Record<string, ChosenReason> };

const UNUSED = "The model's wording could not be used. The plan below uses fixed wording.";

class ReplyTimeout extends Error {}

function statusOf(e: unknown): number | null {
  const s = (e as { customErrorData?: { status?: unknown } } | null)?.customErrorData?.status;
  return typeof s === "number" ? s : null;
}

/** Fixed plain sentences only: no raw error text ever reaches the page. */
function noticeFor(e: unknown): string {
  if (e instanceof ReplyTimeout) return "The cloud took too long. The plan below uses fixed wording.";
  const status = statusOf(e);
  if (status === 401 || status === 403) return "Cloud step refused by App Check. Try a normal browser window.";
  if (status === 429) return "The cloud is busy right now. The plan below uses fixed wording.";
  if (status === 503) return "The cloud is unavailable right now. The plan below uses fixed wording.";
  return "The cloud step did not answer. The plan below uses fixed wording.";
}

function route(path: RouteRecord["path"], reason: RouteRecord["reason"], model: string, latencyMs: number, sdkReported: boolean, at: number): RouteRecord {
  return { platform: "web", path, stage: "sdk", model, reason, latencyMs, sdkReported, blocked: null, decidedAtMs: at };
}

export async function wordPlan(draft: PlanDraft, deps: WordingDeps): Promise<WordedPlan> {
  const out = await wordPlanInner(draft, deps);
  return { ...out, promptBytes: new TextEncoder().encode(planPrompt(draft)).length };
}

async function wordPlanInner(draft: PlanDraft, deps: WordingDeps): Promise<WordedPlan> {
  const t0 = deps.now();
  const template = (notice: string | null, attempt?: WordingAttempt): WordedPlan => {
    const t1 = deps.now();
    const plan: WordedPlan = { wording: templateWording(draft), route: route("rules", "template_fallback", "template", t1 - t0, false, t1), notice };
    return attempt ? { ...plan, attempt } : plan;
  };
  // Where the asked model ran, as the SDK reported it; with no report it stays unknown.
  const askedRoute = (source: string | undefined): RouteRecord => {
    const t1 = deps.now();
    if (source === "on_device") return route("on_device", "sdk_prefer_on_device", "chrome-built-in", t1 - t0, true, t1);
    if (source === "in_cloud") return route("cloud", "on_device_unavailable", deps.model, t1 - t0, true, t1);
    return route("unknown", "sdk_prefer_on_device", deps.model, t1 - t0, false, t1);
  };
  if (deps.killCloud) return template("Cloud paused by command. The plan below uses fixed wording.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ReplyTimeout()), deps.timeoutMs);
    });
    const reply = await Promise.race([Promise.resolve().then(() => deps.generate(planPrompt(draft))), late]);
    const t1 = deps.now();
    let parsed: unknown;
    try {
      parsed = JSON.parse(reply.text);
    } catch {
      return template(UNUSED, { route: askedRoute(reply.inferenceSource), failure: "unreadable" });
    }
    const checked = checkChoice(draft, parsed);
    if (!checked.ok) return template(UNUSED, { route: askedRoute(reply.inferenceSource), failure: "rejected" });
    // Every sentence comes from code: the task lines from the plan, the reasons and the summary from each team's main
    // reason (the model's) and its supporting fact (code's fixed rule).
    const codes: Record<string, ChosenReason> = {};
    const choices = new Map<string, FactCode[]>();
    for (const a of draft.assignments) {
      const main = checked.codes.get(a.teamId)?.[0];
      if (!main) continue;
      const support = supportingFact(draft, a.teamId, main);
      codes[a.teamId] = { main, support };
      choices.set(a.teamId, support ? [main, support] : [main]);
    }
    const wording: PlanWording = {
      assignments: draft.assignments.map((a) => ({
        teamId: a.teamId,
        taskText: taskTextFor(a),
        reason: a.segmentIds.length > 0 ? renderReason(draft, a.teamId, choices.get(a.teamId)!) : "No segment left to assign.",
      })),
      summary: renderSummary(draft, choices),
    };
    if (reply.inferenceSource === "on_device") return { wording, route: route("on_device", "sdk_prefer_on_device", "chrome-built-in", t1 - t0, true, t1), notice: null, codes };
    if (reply.inferenceSource === "in_cloud") return { wording, route: route("cloud", "on_device_unavailable", deps.model, t1 - t0, true, t1), notice: null, codes };
    return { wording, route: route("unknown", "sdk_prefer_on_device", deps.model, t1 - t0, false, t1), notice: null, codes };
  } catch (e) {
    return template(noticeFor(e), { route: askedRoute(undefined), failure: e instanceof ReplyTimeout ? "timeout" : "error" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The wording's own on-device options, ONLY_ON_DEVICE and with no cloud params: what a measurement page asks for, since
 * a dev page never builds a cloud model. With the built-in model available, PREFER_ON_DEVICE runs these same options.
 */
export function wordingOnDeviceParams(teamIds: ChoiceTeams | null = null): HybridParams {
  return { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: wordingParams("", teamIds).onDeviceParams };
}

/** The schema for one plan: each team with a fact gets a required code from an enum of its own facts only. */
export function planWordingJson(teams: ChoiceTeams | null): PlanWordingSchema {
  if (!teams || Object.keys(teams).length === 0) return PLAN_WORDING_JSON;
  return {
    type: "object",
    properties: Object.fromEntries(Object.entries(teams).map(([t, codes]) => [t, { type: "string", enum: [...codes] }])),
    required: Object.keys(teams),
  };
}

/**
 * How long the command post waits for a plan's wording before it uses the fixed wording. On Chrome's built-in model a
 * page's first wording took 19.8 s on a fast Mac and later ones 2 to 3 s, past the 15 s a cloud request gets
 * (evidence: docs/evidence/web/2026-11-21-plan-wording-schema-chrome.json). A cloud request keeps its own 15 s limit
 * (REPLY_TIMEOUT_MS, set on the SDK request), so a cloud fallback is no slower.
 */
export const WORDING_WAIT_MS = 60_000;
