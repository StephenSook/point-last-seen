// Private-data gate (firebase-js-sdk issue #10635).
//
// With no `LanguageModel` in the browser, the SDK's ONLY_ON_DEVICE mode and
// countTokens() call the cloud. So before any SDK call on a family photo or a
// caller's words, we ask Chrome ourselves, for the exact inputs that call
// needs, and make no SDK call at all unless the answer is "available".
//
// This is the only file that may call LanguageModel.availability (rules gate).

import type { LanguageModelCreateOptions, LanguageModelExpected } from "firebase/ai";

export type OnDeviceInput = "text" | "image";

const EN_TEXT: LanguageModelExpected = { type: "text", languages: ["en"] };

export const TEXT_INPUTS: readonly LanguageModelExpected[] = Object.freeze([EN_TEXT]);
export const IMAGE_INPUTS: readonly LanguageModelExpected[] = Object.freeze([EN_TEXT, { type: "image" }]);
export const TEXT_OUTPUTS: readonly LanguageModelExpected[] = Object.freeze([EN_TEXT]);

const AVAILABILITY_TIMEOUT_MS = 5000;

function copy(list: readonly LanguageModelExpected[]): LanguageModelExpected[] {
  return list.map((e) => (e.languages ? { type: e.type, languages: [...e.languages] } : { type: e.type }));
}

/**
 * Builds the on-device create options for one kind of read. Pass the SAME
 * object to `onDeviceAvailable` and to `onDeviceParams.createOptions`, so the
 * gate asks Chrome exactly what the SDK will ask.
 */
export function onDeviceCreateOptions(input: OnDeviceInput, systemPrompt?: string): LanguageModelCreateOptions {
  const options: LanguageModelCreateOptions = {
    expectedInputs: copy(input === "image" ? IMAGE_INPUTS : TEXT_INPUTS),
    expectedOutputs: copy(TEXT_OUTPUTS),
  };
  if (systemPrompt !== undefined) {
    options.initialPrompts = [{ role: "system", content: [{ type: "text", value: systemPrompt }] }];
  }
  return options;
}

type GateEnv = { LanguageModel?: unknown };

/**
 * True only when `LanguageModel` exists and `availability(options)` answers
 * exactly "available". Missing API, "downloadable", "downloading",
 * "unavailable", a throw, a rejection or a slow answer all give false.
 */
export async function onDeviceAvailable(
  options: LanguageModelCreateOptions,
  env: GateEnv = globalThis as GateEnv,
  timeoutMs: number = AVAILABILITY_TIMEOUT_MS,
): Promise<boolean> {
  return (await availabilityOf(options, env, timeoutMs)) === "available";
}

export type Availability = "available" | "downloadable" | "downloading" | "unavailable" | "missing";
const KNOWN: readonly string[] = ["available", "downloadable", "downloading", "unavailable"];

/**
 * Chrome's own answer for these options, for showing the laptop's state (the
 * judge page's three states). "missing" means no LanguageModel or a failed
 * check. Never use it to allow a private read: that is `onDeviceAvailable`.
 */
export async function availabilityOf(
  options: LanguageModelCreateOptions,
  env: GateEnv = globalThis as GateEnv,
  timeoutMs: number = AVAILABILITY_TIMEOUT_MS,
): Promise<Availability> {
  try {
    const api = env.LanguageModel as { availability?: unknown } | undefined;
    if (!api || typeof api.availability !== "function") return "missing";
    const ask = Promise.resolve((api.availability as (o: unknown) => unknown).call(api, options));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    try {
      const answer = await Promise.race([ask, late]);
      if (answer === "timeout") return "missing";
      return typeof answer === "string" && KNOWN.includes(answer) ? (answer as Availability) : "unavailable";
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return "missing";
  }
}

/**
 * Runs `call` (the SDK call) only when the gate passes. When it does not,
 * `call` is never invoked, so nothing about the private input reaches the SDK.
 */
export async function runOnDeviceOnly<T>(
  options: LanguageModelCreateOptions,
  call: () => Promise<T>,
  env: GateEnv = globalThis as GateEnv,
): Promise<{ ran: true; value: T } | { ran: false }> {
  if (!(await onDeviceAvailable(options, env))) return { ran: false };
  return { ran: true, value: await call() };
}
