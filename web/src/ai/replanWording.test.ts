import { describe, expect, it } from "vitest";
import { InferenceMode } from "firebase/ai";
import {
  PLAN_WORDING_JSON,
  REPLY_TIMEOUT_MS,
  checkChoice,
  NOT_A_TEAM_FACT,
  planPrompt,
  templateWording,
  wordPlan,
  wordingParams,
  type PlanDraft,
  type WordingDeps,
} from "./replanWording";

const draft: PlanDraft = {
  eventSetHash: "a".repeat(64),
  priorVersion: 2,
  rank: [
    { segmentId: "AC", rank: 1, poa: 0.31, priorPoa: 0.2, deltaPoa: 0.11 },
    { segmentId: "AB", rank: 2, poa: 0.22, priorPoa: 0.25, deltaPoa: -0.03 },
    { segmentId: "AD", rank: 3, poa: 0.1, priorPoa: 0.1, deltaPoa: 0 },
  ],
  assignments: [
    { teamId: "T1", segmentIds: ["AC"] },
    { teamId: "T2", segmentIds: ["AB"] },
  ],
};

// The model picks reason codes from each team's own facts; code writes every sentence.
const good = JSON.stringify({ assignments: [{ teamId: "T1", reasons: ["highest_poa", "poa_rose"] }, { teamId: "T2", reasons: ["top_three"] }] });
const goodWording = {
  assignments: [
    { teamId: "T1", taskText: "Search segment AC.", reason: "AC has the highest POA, 31.0%. AC rose from 20.0% to 31.0% since the starting map." },
    { teamId: "T2", taskText: "Search segment AB.", reason: "AB is in the top three by POA." },
  ],
  summary: "T1 searches AC: AC has the highest POA, 31.0%. AC rose from 20.0% to 31.0% since the starting map. T2 searches AB: AB is in the top three by POA.",
};
function deps(over: Partial<WordingDeps>): WordingDeps {
  let t = 1000;
  return { generate: async () => ({ text: good, inferenceSource: "in_cloud" }), now: () => (t += 250), timeoutMs: 50, model: "gemini-3.5-flash-lite", ...over };
}
const httpError = (status: number, raw: string) => Object.assign(new Error(raw), { customErrorData: { status } });

describe("templateWording", () => {
  it("words every team of the draft from code, naming its segments", () => {
    const t = templateWording(draft);
    expect(t.assignments.map((a) => a.teamId)).toEqual(["T1", "T2"]);
    expect(t.assignments[0]!.taskText).toContain("AC");
    expect(t.assignments.map((a) => a.reason)).toEqual(["POA now 31.0%.", "POA now 22.0%."]);
  });
});

describe("planPrompt", () => {
  it("lists each team's segments and the facts code found for them, and a team with no segment", () => {
    const withEmpty: PlanDraft = { ...draft, assignments: [...draft.assignments, { teamId: "T3", segmentIds: [] }] };
    expect(planPrompt(withEmpty).split("\n")).toEqual([
      "Teams, their segments, and the facts code found for those segments:",
      "T1 searches AC. Facts: highest_poa (AC), poa_rose (AC), poa_now (AC)",
      "T2 searches AB. Facts: top_three (AB), poa_now (AB)",
      "T3 has no segment. Facts: none.",
    ]);
  });
});

describe("the model picks reason codes, code writes every sentence", () => {
  it("asks the model only for each team's reason codes, from the known codes: no sentence, task line or summary", () => {
    const item = PLAN_WORDING_JSON.properties.assignments.items;
    expect(item.required).toEqual(["teamId", "reasons"]);
    expect(Object.keys(item.properties)).toEqual(["teamId", "reasons"]);
    expect(item.properties.reasons).toMatchObject({ type: "array", maxItems: 2, items: { type: "string" } });
    expect(PLAN_WORDING_JSON.required).toEqual(["assignments"]);
    expect("summary" in PLAN_WORDING_JSON.properties).toBe(false);
  });
  it("renders each team's reason and the summary from the codes chosen", async () => {
    const out = await wordPlan(draft, deps({}));
    expect(out.wording).toEqual(goodWording);
    expect(out.codes).toEqual({ T1: ["highest_poa", "poa_rose"], T2: ["top_three"] });
  });
  it("ignores any text the model sends anyway", async () => {
    const sly = JSON.stringify({ assignments: [{ teamId: "T1", taskText: "Search segment AD.", reason: "She is in AC.", reasons: ["highest_poa"] }, { teamId: "T2", reasons: ["top_three"] }], summary: "They will be found." });
    const out = await wordPlan(draft, deps({ generate: async () => ({ text: sly, inferenceSource: "in_cloud" }) }));
    expect(out.wording.assignments).toEqual([
      { teamId: "T1", taskText: "Search segment AC.", reason: "AC has the highest POA, 31.0%." },
      { teamId: "T2", taskText: "Search segment AB.", reason: "AB is in the top three by POA." },
    ]);
    expect(out.wording.summary).not.toMatch(/found|She/);
  });
  it("a code that is not one of the team's own facts falls to the template", async () => {
    const wrong = JSON.stringify({ assignments: [{ teamId: "T1", reasons: ["highest_poa"] }, { teamId: "T2", reasons: ["highest_poa"] }] });
    const out = await wordPlan(draft, deps({ generate: async () => ({ text: wrong, inferenceSource: "in_cloud" }) }));
    expect(out.route.path).toBe("rules");
    expect(out.wording).toEqual(templateWording(draft));
    expect(out.attempt).toMatchObject({ failure: "rejected" });
  });
});

describe("checkChoice", () => {
  const pick = (t1: unknown, t2: unknown = ["top_three"]) => checkChoice(draft, { assignments: [{ teamId: "T1", reasons: t1 }, { teamId: "T2", reasons: t2 }] });
  it("accepts one or two of each team's own facts, in any team order", () => {
    expect(pick(["highest_poa"])).toMatchObject({ ok: true });
    expect(pick(["poa_rose", "highest_poa"])).toMatchObject({ ok: true });
    expect(checkChoice(draft, { assignments: [{ teamId: "T2", reasons: ["poa_now"] }, { teamId: "T1", reasons: ["poa_now"] }] })).toMatchObject({ ok: true });
  });
  it("refuses a code from another team's facts, an unknown code, or a known code no segment of the team has", () => {
    expect(pick(["highest_poa"], ["poa_rose"])).toEqual({ ok: false, reason: NOT_A_TEAM_FACT });
    expect(pick(["near_trail"])).toEqual({ ok: false, reason: NOT_A_TEAM_FACT });
    expect(pick(["customer_complaints"])).toEqual({ ok: false, reason: NOT_A_TEAM_FACT });
  });
  it("refuses no code, more than two, a repeated code, or codes that are not a list of text", () => {
    for (const bad of [[], ["highest_poa", "poa_rose", "poa_now"], ["poa_now", "poa_now"], "highest_poa", [1], null]) {
      expect(pick(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it("refuses teams that differ from the draft, and a team with no segment must get no code", () => {
    expect(checkChoice(draft, { assignments: [{ teamId: "T9", reasons: ["poa_now"] }] }).ok).toBe(false);
    expect(checkChoice(draft, { assignments: [{ teamId: "T1", reasons: ["poa_now"] }, { teamId: "T1", reasons: ["poa_now"] }] }).ok).toBe(false);
    const withEmpty: PlanDraft = { ...draft, assignments: [...draft.assignments, { teamId: "T3", segmentIds: [] }] };
    const base = [{ teamId: "T1", reasons: ["poa_now"] }, { teamId: "T2", reasons: ["poa_now"] }];
    expect(checkChoice(withEmpty, { assignments: [...base, { teamId: "T3", reasons: [] }] })).toMatchObject({ ok: true });
    expect(checkChoice(withEmpty, { assignments: [...base, { teamId: "T3", reasons: ["poa_now"] }] }).ok).toBe(false);
  });
  it("refuses a reply that is not an object of assignments", () => {
    expect(checkChoice(draft, null).ok).toBe(false);
    expect(checkChoice(draft, { assignments: "x" }).ok).toBe(false);
  });
});

describe("wordPlan", () => {
  it("records the SDK's route", async () => {
    // On this laptop first: the cloud answers only when there is no local model, and the route says which ran.
    expect((await wordPlan(draft, deps({ generate: async () => ({ text: good, inferenceSource: "on_device" }) }))).route).toMatchObject({ platform: "web", path: "on_device", sdkReported: true, reason: "sdk_prefer_on_device", stage: "sdk" });
    expect((await wordPlan(draft, deps({}))).route).toMatchObject({ path: "cloud", sdkReported: true, reason: "on_device_unavailable" });
  });

  it("with no inferenceSource records path unknown and says the route was not reported", async () => {
    const out = await wordPlan(draft, deps({ generate: async () => ({ text: good, inferenceSource: undefined }) }));
    expect(out.route).toMatchObject({ path: "unknown", sdkReported: false });
    expect(out.wording).toEqual(goodWording);
  });

  it("falls to the template when the call throws or the wording is wrong", async () => {
    const thrown = await wordPlan(draft, deps({ generate: async () => { throw new Error("boom"); } }));
    expect(thrown.wording).toEqual(templateWording(draft));
    expect(thrown.route).toMatchObject({ path: "rules", reason: "template_fallback", sdkReported: false });
    const wrong = await wordPlan(draft, deps({ generate: async () => ({ text: JSON.stringify({ assignments: [{ teamId: "T9", taskText: "x", reason: "y" }], summary: "" }), inferenceSource: "in_cloud" }) }));
    expect(wrong.route.path).toBe("rules");
    const notJson = await wordPlan(draft, deps({ generate: async () => ({ text: "not json", inferenceSource: "in_cloud" }) }));
    expect(notJson.route.path).toBe("rules");
  });

  it("429 and 503 show a plain message and the template", async () => {
    for (const status of [429, 503]) {
      const out = await wordPlan(draft, deps({ generate: async () => { throw httpError(status, `[GoogleGenerativeAI Error]: ${status} RESOURCE_EXHAUSTED quota project 123`); } }));
      expect(out.wording).toEqual(templateWording(draft));
      expect(out.notice).toMatch(/^The cloud is (busy|unavailable) right now\. The plan below uses fixed wording\.$/);
    }
  });

  it("a 500 (for example the AI Logic guard refusing a model off the allow-list) shows a plain message and the template", async () => {
    const out = await wordPlan(draft, deps({ generate: async () => { throw httpError(500, "[GoogleGenerativeAI Error]: 500 INTERNAL blocked by before-generate trigger"); } }));
    expect(out.wording).toEqual(templateWording(draft));
    expect(out.notice).toBe("The cloud step did not answer. The plan below uses fixed wording.");
  });

  it("App Check refusal says so in plain words", async () => {
    const out = await wordPlan(draft, deps({ generate: async () => { throw httpError(401, "App Check token is invalid"); } }));
    expect(out.notice).toBe("Cloud step refused by App Check. Try a normal browser window.");
  });

  it("no raw error text reaches the notice", async () => {
    const raw = "[GoogleGenerativeAI Error]: secret-ish internal detail xyz";
    const out = await wordPlan(draft, deps({ generate: async () => { throw new Error(raw); } }));
    expect(out.notice).not.toContain("xyz");
    expect(out.notice).not.toContain("GoogleGenerativeAI");
  });

  it("a slow reply times out to the template with a plain notice", async () => {
    const out = await wordPlan(draft, deps({ generate: () => new Promise(() => {}), timeoutMs: 20 }));
    expect(out.route.path).toBe("rules");
    expect(out.notice).toBe("The cloud took too long. The plan below uses fixed wording.");
  });

  it("records the call's latency and never rejects", async () => {
    const out = await wordPlan(draft, deps({}));
    expect(out.route.latencyMs).toBe(250);
    expect(out.notice).toBeNull();
    await expect(wordPlan(draft, deps({ generate: () => { throw new Error("sync"); } }))).resolves.toBeDefined();
  });

  it("uses the measured reply timeout by default", () => {
    expect(REPLY_TIMEOUT_MS).toBe(15_000);
  });
});

describe("wordingParams", () => {
  const p = wordingParams("gemini-3.5-flash-lite");

  it("is the SDK's hybrid mode with this laptop first", () => {
    expect(p.mode).toBe(InferenceMode.PREFER_ON_DEVICE);
    expect(p.inCloudParams).toMatchObject({ model: "gemini-3.5-flash-lite", generationConfig: { responseMimeType: "application/json", responseJsonSchema: PLAN_WORDING_JSON } });
  });

  it("places English text in and out under onDeviceParams.createOptions, with the system prompt repeated there", () => {
    expect(p.onDeviceParams?.createOptions?.expectedInputs).toEqual([{ type: "text", languages: ["en"] }]);
    expect(p.onDeviceParams?.createOptions?.expectedOutputs).toEqual([{ type: "text", languages: ["en"] }]);
    expect(p.onDeviceParams?.createOptions?.initialPrompts?.[0]?.role).toBe("system");
    expect(p.onDeviceParams?.promptOptions?.responseConstraint).toEqual(PLAN_WORDING_JSON);
    expect(p.inCloudParams?.systemInstruction).toBeDefined();
  });
});

describe("wordPlan with the cloud paused", () => {
  it("never calls the model and uses the template with a plain notice", async () => {
    let calls = 0;
    const out = await wordPlan(draft, deps({ killCloud: true, generate: async () => { calls++; return { text: good, inferenceSource: "in_cloud" }; } }));
    expect(calls).toBe(0);
    expect(out.wording).toEqual(templateWording(draft));
    expect(out.route).toMatchObject({ path: "rules", reason: "template_fallback" });
    expect(out.notice).toBe("Cloud paused by command. The plan below uses fixed wording.");
  });
});

describe("a model attempt whose answer was not used", () => {
  it("is kept apart from the fixed-wording route, so an attempt that may have sent the draft stays visible", async () => {
    const failed = await wordPlan(draft, deps({ generate: async () => { throw httpError(503, "raw"); } }));
    expect(failed.route).toMatchObject({ path: "rules", reason: "template_fallback" });
    expect(failed.attempt).toMatchObject({ failure: "error", route: { path: "unknown", stage: "sdk", sdkReported: false, model: "gemini-3.5-flash-lite" } });

    const unread = await wordPlan(draft, deps({ generate: async () => ({ text: "not json", inferenceSource: "in_cloud" }) }));
    expect(unread.attempt).toMatchObject({ failure: "unreadable", route: { path: "cloud", sdkReported: true } });
    expect(unread.notice).toBe("The model's wording could not be used. The plan below uses fixed wording.");

    const rejected = await wordPlan(draft, deps({ generate: async () => ({ text: JSON.stringify({ assignments: [], summary: "" }), inferenceSource: "on_device" }) }));
    expect(rejected.attempt).toMatchObject({ failure: "rejected", route: { path: "on_device", sdkReported: true, model: "chrome-built-in" } });

    const late = await wordPlan(draft, deps({ timeoutMs: 1, generate: () => new Promise(() => {}) }));
    expect(late.attempt).toMatchObject({ failure: "timeout", route: { path: "unknown", sdkReported: false } });
  });

  it("is absent when the model's wording was used, or when no model was asked", async () => {
    expect((await wordPlan(draft, deps({}))).attempt).toBeUndefined();
    expect((await wordPlan(draft, deps({ killCloud: true }))).attempt).toBeUndefined();
  });
});

describe("the plan text's size", () => {
  it("is the UTF-8 size of the exact prompt the model is sent, for the receipt", async () => {
    const out = await wordPlan(draft, deps({}));
    expect(out.promptBytes).toBe(new TextEncoder().encode(planPrompt(draft)).length);
    expect(out.promptBytes).toBeGreaterThan(0);
  });
});

describe("the wording's on-device-only params (for measurement pages, which never build a cloud model)", () => {
  it("are the command post's own on-device options, ONLY_ON_DEVICE, with no cloud params", async () => {
    const { wordingOnDeviceParams } = await import("./replanWording");
    const p = wordingOnDeviceParams();
    expect(p.mode).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(p.onDeviceParams).toEqual(wordingParams("gemini-3.5-flash-lite").onDeviceParams);
    expect(p.inCloudParams).toBeUndefined();
  });
});

describe("the wording's schema for one plan: one entry per team, only that plan's teams", () => {
  it("fixes the number of assignments and names only the plan's teams", async () => {
    const { planWordingJson, PLAN_WORDING_JSON } = await import("./replanWording");
    const s = planWordingJson(["T1", "T2"]);
    expect(s.properties.assignments.minItems).toBe(2);
    expect(s.properties.assignments.maxItems).toBe(2);
    expect(s.properties.assignments.items.properties.teamId).toEqual({ type: "string", enum: ["T1", "T2"] });
    expect(s.required).toEqual(PLAN_WORDING_JSON.required);
    // With no teams there is nothing to fix: the general schema.
    expect(planWordingJson([])).toEqual(PLAN_WORDING_JSON);
    expect(planWordingJson(null)).toEqual(PLAN_WORDING_JSON);
  });

  it("is what both the cloud and this laptop are asked for, when the plan's teams are given", async () => {
    const { planWordingJson, wordingOnDeviceParams } = await import("./replanWording");
    const p = wordingParams("gemini-3.5-flash-lite", ["T1", "T2"]);
    expect(p.inCloudParams?.generationConfig?.responseJsonSchema).toEqual(planWordingJson(["T1", "T2"]));
    expect(p.onDeviceParams?.promptOptions?.responseConstraint).toEqual(planWordingJson(["T1", "T2"]));
    expect(wordingOnDeviceParams(["T1", "T2"]).onDeviceParams).toEqual(p.onDeviceParams);
  });

  it("the command post asks with its draft's own teams", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../command/CommandPost.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/wordingGenerator\(aiClient\(pls\.app\), rc\.cloudModelWeb, draft\.assignments\.map\(\(a\) => a\.teamId\)\)/);
  });
});

describe("how long the command post waits for a plan's wording", () => {
  it("is more than twice the slowest wording measured on Chrome's built-in model, and the command post uses it", async () => {
    const { readFileSync } = await import("node:fs");
    const { WORDING_WAIT_MS, REPLY_TIMEOUT_MS } = await import("./replanWording");
    const replies = ["2026-11-21-plan-wording-chrome.json", "2026-11-21-plan-wording-schema-chrome.json"].flatMap((f) =>
      (JSON.parse(readFileSync(new URL(`../../../docs/evidence/web/${f}`, import.meta.url), "utf8")) as { sessions: { runs: { replyMs: number }[] }[] }).sessions.flatMap((s) => s.runs.map((r) => r.replyMs)),
    );
    const slowest = Math.max(...replies);
    expect(slowest).toBeGreaterThan(REPLY_TIMEOUT_MS);
    expect(WORDING_WAIT_MS).toBeGreaterThan(2 * slowest);
    // The cloud request keeps its own 15 s limit, so a cloud fallback is no slower than before.
    expect(REPLY_TIMEOUT_MS).toBe(15_000);
    expect(readFileSync(new URL("../command/CommandPost.tsx", import.meta.url), "utf8")).toMatch(/wordPlan\(draft, \{ generate, now: \(\) => Date\.now\(\), timeoutMs: WORDING_WAIT_MS,/);
  });
});
