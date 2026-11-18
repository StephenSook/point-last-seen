// On-device clip triage, step two (P-39): this laptop's model looks at one frame per moving span
// and says only whether a person is in it. A frame of a family's clip is private: it is read
// only after the gate says the built-in model is available, with no cloud fallback.

import { InferenceMode, type HybridParams, type LanguageModelCreateOptions } from "firebase/ai";
import { onDeviceCreateOptions } from "./gate";

export const FRAME_JSON = {
  type: "object",
  properties: { personVisible: { type: "boolean" } },
  required: ["personVisible"],
} as const;

const SYSTEM = "You check one frame from a home camera clip. personVisible is true when any person, or any part of a person, is in the frame. Do not describe anyone.";

/** The one options object for frame checks: the gate asks Chrome with it, and the model is created with it. */
export const FRAME_OPTS: LanguageModelCreateOptions = onDeviceCreateOptions("image", SYSTEM);

export function frameCheckParams(): HybridParams {
  return { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions: FRAME_OPTS, promptOptions: { responseConstraint: FRAME_JSON } } };
}

export function parseFrameCheck(text: string): boolean | null {
  try {
    const v = (JSON.parse(text) as { personVisible?: unknown }).personVisible;
    return typeof v === "boolean" ? v : null;
  } catch {
    return null;
  }
}
