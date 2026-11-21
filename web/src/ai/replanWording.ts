// Plan wording on the SDK's own hybrid mode, this laptop first: the cloud answers only when the browser has no
// local model, and the route records which one ran (the SDK's inferenceSource), never the mode asked for. The plan itself is
// drafted by code, and so is each team's task line ("Search segment AA."): a
// model writes only each team's reason and the summary, in a closed schema.
// Code rejects wording whose teams differ from the draft, or whose reason names
// a segment that team was not given. Any failure falls to a fixed template, and
// the route says "rules".

import { InferenceMode, type HybridParams } from "firebase/ai";
import type { DraftAssignment, PlanWording, RankedSegment, RouteRecord } from "@pls/engine";
import { onDeviceCreateOptions } from "./gate";
import { CLOUD_MAX_OUTPUT_TOKENS } from "./limits";

export type PlanDraft = { eventSetHash: string; priorVersion: number; rank: RankedSegment[]; assignments: DraftAssignment[] };

/** Cloud replies on gemini-3.5-flash-lite took 0.8 to 1.8 s (S4 step 4 controls, 2026-11-17); 15 s leaves room for a long table. */
export const REPLY_TIMEOUT_MS = 15_000;

const MAX_TEXT = 200;

export const PLAN_WORDING_JSON = {
  type: "object",
  properties: {
    assignments: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        properties: { teamId: { type: "string" }, reason: { type: "string" } },
        required: ["teamId", "reason"],
      },
    },
    summary: { type: "string" },
  },
  required: ["assignments", "summary"],
} as const;

const SYSTEM = [
  "You word a search plan that code has already decided. You never change which team searches which segment.",
  "For each team, write reason: one short line from the table about that team's own segments only.",
  "Use plain words. Never say the person will be found or where the person is.",
  "Return JSON with assignments (teamId, reason) and a one-sentence summary.",
].join(" ");

export function wordingParams(model: string, teamIds: readonly string[] | null = null): HybridParams {
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

/** The engine's table, in the user text (the SDK passes only contents and our prompt options to Chrome). */
export function planPrompt(draft: PlanDraft): string {
  const lines = [
    "Assignments decided by code:",
    ...draft.assignments.map((a) => `${a.teamId}: ${a.segmentIds.join(", ")}`),
    "Segments by POA, highest first:",
    ...draft.rank.slice(0, 10).map((r) => `${r.segmentId} ${pct(r.poa)} (was ${pct(r.priorPoa)})`),
  ];
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

/** What the model returns. A task line it sends anyway is ignored: task lines come from the plan. */
type ModelWording = { assignments: { teamId: string; reason: string; taskText?: unknown }[]; summary: string };

export const NUMBER_NOT_IN_PLAN = "a number that is not in the plan";
const NUMBER = /\d+(?:\.\d+)?/g;

export function checkWording(draft: PlanDraft, wording: ModelWording): { ok: true } | { ok: false; reason: string } {
  if (!wording || !Array.isArray(wording.assignments)) return { ok: false, reason: "no assignments" };
  const want = draft.assignments.map((a) => a.teamId).sort();
  const got = wording.assignments.map((a) => a?.teamId).sort();
  if (want.length !== got.length || want.some((t, i) => t !== got[i])) return { ok: false, reason: "team ids differ from the draft" };
  const known = [...new Set([...draft.rank.map((r) => r.segmentId), ...draft.assignments.flatMap((a) => a.segmentIds)])];
  for (const a of wording.assignments) {
    const s = a.reason;
    if (typeof s !== "string" || s.trim() === "" || s.length > MAX_TEXT) return { ok: false, reason: "empty or overlong text" };
    const own = new Set(draft.assignments.find((d) => d.teamId === a.teamId)?.segmentIds ?? []);
    if (known.some((id) => !own.has(id) && new RegExp(`\\b${id}\\b`).test(s))) return { ok: false, reason: "a reason names another team's segment" };
  }
  if (typeof wording.summary !== "string" || wording.summary.length > 300) return { ok: false, reason: "bad summary" };
  // Every number the model writes must be one it was given: an invented figure would reach command as fact.
  const given = new Set(planPrompt(draft).match(NUMBER) ?? []);
  const written = [...wording.assignments.map((a) => a.reason), wording.summary].flatMap((t) => t.match(NUMBER) ?? []);
  if (written.some((n) => !given.has(n))) return { ok: false, reason: NUMBER_NOT_IN_PLAN };
  return { ok: true };
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
export type WordingAttempt = { route: RouteRecord; failure: "error" | "timeout" | "unreadable" | "rejected" | "number" };
/** `attempt` is present only when a model was asked and its answer was not used; `route` is what worded the plan. */
/** `promptBytes`: the UTF-8 size of the plan text a model is sent (for the receipt), when this file built it. */
export type WordedPlan = { wording: PlanWording; route: RouteRecord; notice: string | null; attempt?: WordingAttempt; promptBytes?: number };

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
    let modelWording: ModelWording;
    try {
      modelWording = JSON.parse(reply.text) as ModelWording;
    } catch {
      return template(UNUSED, { route: askedRoute(reply.inferenceSource), failure: "unreadable" });
    }
    const checked = checkWording(draft, modelWording);
    if (!checked.ok) return template(UNUSED, { route: askedRoute(reply.inferenceSource), failure: checked.reason === NUMBER_NOT_IN_PLAN ? "number" : "rejected" });
    // The task lines come from the plan; the model's own text supplies only the reasons and the summary.
    const wording: PlanWording = {
      assignments: modelWording.assignments.map((a) => {
        const own = draft.assignments.find((d) => d.teamId === a.teamId)!;
        return { teamId: a.teamId, taskText: taskTextFor(own), reason: a.reason };
      }),
      summary: modelWording.summary,
    };
    if (reply.inferenceSource === "on_device") return { wording, route: route("on_device", "sdk_prefer_on_device", "chrome-built-in", t1 - t0, true, t1), notice: null };
    if (reply.inferenceSource === "in_cloud") return { wording, route: route("cloud", "on_device_unavailable", deps.model, t1 - t0, true, t1), notice: null };
    return { wording, route: route("unknown", "sdk_prefer_on_device", deps.model, t1 - t0, false, t1), notice: null };
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
export function wordingOnDeviceParams(teamIds: readonly string[] | null = null): HybridParams {
  return { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: wordingParams("", teamIds).onDeviceParams };
}

/**
 * The wording's JSON schema for one plan: exactly one assignment per team, naming only that plan's teams. On Chrome's
 * built-in model the general schema let a reply repeat the teams up to its 12 items, which code then rejected
 * (docs/evidence/web/2026-11-21-plan-wording-chrome.json). With no teams it is the general schema.
 */
export type PlanWordingSchema = {
  type: "object";
  properties: {
    assignments: {
      type: "array";
      minItems?: number;
      maxItems: number;
      items: { type: "object"; properties: { teamId: { type: "string"; enum?: string[] }; reason: { type: "string" } }; required: readonly string[] };
    };
    summary: { type: "string" };
  };
  required: readonly string[];
};

export function planWordingJson(teamIds: readonly string[] | null): PlanWordingSchema {
  if (!teamIds || teamIds.length === 0) return PLAN_WORDING_JSON;
  const a = PLAN_WORDING_JSON.properties.assignments;
  return {
    ...PLAN_WORDING_JSON,
    properties: {
      ...PLAN_WORDING_JSON.properties,
      assignments: {
        ...a,
        minItems: teamIds.length,
        maxItems: teamIds.length,
        items: { ...a.items, properties: { ...a.items.properties, teamId: { type: "string", enum: [...teamIds] } } },
      },
    },
  };
}

/**
 * How long the command post waits for a plan's wording before it uses the fixed wording. On Chrome's built-in model a
 * page's first wording took 19.8 s on a fast Mac and later ones 2 to 3 s, past the 15 s a cloud request gets
 * (evidence: docs/evidence/web/2026-11-21-plan-wording-schema-chrome.json). A cloud request keeps its own 15 s limit
 * (REPLY_TIMEOUT_MS, set on the SDK request), so a cloud fallback is no slower.
 */
export const WORDING_WAIT_MS = 60_000;
