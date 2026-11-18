// "Get this laptop ready": which of the judge page's states this browser is
// in, and the model download a person starts with a click.

import { availabilityOf, onDeviceCreateOptions } from "./gate";

export type DeviceState = "no-model" | "downloadable" | "text" | "image";

const TEXT = onDeviceCreateOptions("text");
const IMAGE = onDeviceCreateOptions("image");

export async function deviceState(env?: { LanguageModel?: unknown }): Promise<DeviceState> {
  const [text, image] = await Promise.all([availabilityOf(TEXT, env), availabilityOf(IMAGE, env)]);
  if (image === "available") return "image";
  if (text === "available") return "text";
  if ([text, image].some((a) => a === "downloadable" || a === "downloading")) return "downloadable";
  return "no-model";
}

/**
 * Starts (or joins) Chrome's model download from a click and reports whole
 * percents. `initialize` is the SDK's `initializeDeviceModel` on a model built
 * with the options the reads will use.
 */
export async function downloadDeviceModel(onPct: (pct: number) => void, initialize: (onProgress: (v: number) => void) => Promise<void>): Promise<void> {
  try {
    await initialize((v) => onPct(Math.round(Math.max(0, Math.min(1, v)) * 100)));
  } catch {
    throw new Error("This browser cannot download a local model.");
  }
}
