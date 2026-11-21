import { describe, expect, it } from "vitest";
import { InferenceMode } from "firebase/ai";
import {
  PLAN_WORDING_JSON,
  REPLY_TIMEOUT_MS,
  checkWording,
  planPrompt,
  NUMBER_NOT_IN_PLAN,
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

const good = JSON.stringify({
  assignments: [
    { teamId: "T1", taskText: "Search segment AC.", reason: "Highest POA now." },
    { teamId: "T2", taskText: "Search segment AB.", reason: "Second highest." },
  ],
  summary: "Teams move to the two highest segments.",
});

function deps(over: Partial<WordingDeps>): WordingDeps {
  let t = 1000;
  return { generate: async () => ({ text: good, inferenceSource: "in_cloud" }), now: () => (t += 250), timeoutMs: 50, model: "gemini-3.5-flash-lite", ...over };
}
const httpError = (status: number, raw: string) => Object.assign(new Error(raw), { customErrorData: { status } });

describe("checkWording", () => {
  it("rejects team ids that differ from the draft", () => {
    expect(checkWording(draft, { assignments: [{ teamId: "T9", taskText: "x", reason: "y" }], summary: "" }).ok).toBe(false);
    expect(checkWording(draft, { assignments: [{ teamId: "T1", taskText: "x", reason: "y" }], summary: "" }).ok).toBe(false);
  });

  it("accepts the draft's teams in any order", () => {
    const w = JSON.parse(good);
    expect(checkWording(draft, { ...w, assignments: [...w.assignments].reverse() }).ok).toBe(true);
  });

  it("rejects empty or overlong text and a repeated team", () => {
    const w = JSON.parse(good);
    expect(checkWording(draft, { ...w, assignments: [{ ...w.assignments[0], reason: " " }, w.assignments[1]] }).ok).toBe(false);
    expect(checkWording(draft, { ...w, assignments: [{ ...w.assignments[0], reason: "x".repeat(201) }, w.assignments[1]] }).ok).toBe(false);
    expect(checkWording(draft, { ...w, assignments: [w.assignments[0], w.assignments[0]] }).ok).toBe(false);
  });
});

describe("templateWording", () => {
  it("words every team of the draft from code, naming its segments", () => {
    const t = templateWording(draft);
    expect(t.assignments.map((a) => a.teamId)).toEqual(["T1", "T2"]);
    expect(t.assignments[0]!.taskText).toContain("AC");
    expect(checkWording(draft, t).ok).toBe(true);
  });
});

describe("planPrompt", () => {
  it("carries the engine's table in the user text", () => {
    const p = planPrompt(draft);
    expect(p).toContain("T1: AC");
    expect(p).toContain("AC 31.0%");
    expect(p).toContain("AB 22.0%");
  });
});

describe("task lines come from code, the model writes only reasons", () => {
  it("asks the model for each team's reason and the summary, never a task line", () => {
    const item = PLAN_WORDING_JSON.properties.assignments.items;
    expect(item.required).toEqual(["teamId", "reason"]);
    expect("taskText" in item.properties).toBe(false);
  });
  it("ignores a task line the model wrote and keeps the plan's own segment", async () => {
    const sly = JSON.stringify({ assignments: [{ teamId: "T1", taskText: "Search segment AD.", reason: "Highest POA now." }, { teamId: "T2", reason: "Second highest." }], summary: "s" });
    const out = await wordPlan(draft, deps({ generate: async () => ({ text: sly, inferenceSource: "in_cloud" }) }));
    expect(out.wording.assignments).toEqual([
      { teamId: "T1", taskText: "Search segment AC.", reason: "Highest POA now." },
      { teamId: "T2", taskText: "Search segment AB.", reason: "Second highest." },
    ]);
  });
  it("a reason that names a segment the team was not given falls to the template", async () => {
    const wrong = JSON.stringify({ assignments: [{ teamId: "T1", reason: "AD is closest to the last sighting." }, { teamId: "T2", reason: "Second highest." }], summary: "s" });
    const out = await wordPlan(draft, deps({ generate: async () => ({ text: wrong, inferenceSource: "in_cloud" }) }));
    expect(out.route.path).toBe("rules");
    expect(out.wording.assignments[0]!.reason).toBe("POA now 31.0%.");
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
    expect(out.wording).toEqual(JSON.parse(good));
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

describe("numbers in the model's wording", () => {
  const withReason = (reason: string, summary = "Teams move to the two highest segments.") =>
    ({ assignments: [{ teamId: "T1", taskText: "x", reason }, { teamId: "T2", taskText: "x", reason: "Second highest." }], summary });
  it("accepts numbers that are in the plan the model was given", () => {
    expect(checkWording(draft, withReason("POA now 31.0%, up from 20.0%."))).toEqual({ ok: true });
  });
  it("refuses a number that is not in the plan, in a reason or in the summary", () => {
    expect(checkWording(draft, withReason("POA now 45%."))).toEqual({ ok: false, reason: NUMBER_NOT_IN_PLAN });
    expect(checkWording(draft, withReason("Highest.", "Teams cover 90% of the area."))).toEqual({ ok: false, reason: NUMBER_NOT_IN_PLAN });
  });
  it("a reason with a number not in the draft falls to the template, and the attempt says why", async () => {
    const out = await wordPlan(draft, deps({ generate: async () => ({ text: JSON.stringify(withReason("POA now 45%.")), inferenceSource: "in_cloud" }) }));
    expect(out.route).toMatchObject({ path: "rules", reason: "template_fallback" });
    expect(out.attempt).toMatchObject({ failure: "number", route: { path: "cloud" } });
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
