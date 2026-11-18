// The one place the web app builds AI Logic models (rules gate). One AI
// instance per app, on the Gemini Developer API, with App Check tokens.

import type { FirebaseApp } from "firebase/app";
import { getAI, getGenerativeModel, GoogleAIBackend, type AI } from "firebase/ai";
import { REPLY_TIMEOUT_MS, wordingParams, type WordingDeps } from "./replanWording";
import { sightingCloudParams, sightingTextParams, type SightingTextDeps } from "./sightingText";

let instance: AI | undefined;

export function aiClient(app: FirebaseApp, useLimitedUseAppCheckTokens: boolean): AI {
  instance ??= getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens });
  return instance;
}

type TextModel = { generateContent: (text: string) => Promise<{ response: { text: () => string; inferenceSource?: string } }> };

export function generatorFor(model: TextModel): WordingDeps["generate"] {
  return async (text) => {
    const r = await model.generateContent(text);
    return { text: r.response.text(), inferenceSource: r.response.inferenceSource };
  };
}

/** Plan wording on the SDK's PREFER_IN_CLOUD mode, cloud and on-device parameters both set. */
export function wordingGenerator(ai: AI, model: string): WordingDeps["generate"] {
  return generatorFor(getGenerativeModel(ai, wordingParams(model), { timeout: REPLY_TIMEOUT_MS }));
}

/** The caller's note read on this laptop (ONLY_ON_DEVICE). Call it only after the gate says yes. */
export function sightingTextGenerator(ai: AI): SightingTextDeps["generate"] {
  return generatorFor(getGenerativeModel(ai, sightingTextParams(), { timeout: REPLY_TIMEOUT_MS }));
}

/** The consented cloud read of one note (ONLY_IN_CLOUD). */
export function sightingCloudGenerator(ai: AI, model: string): SightingTextDeps["generate"] {
  return generatorFor(getGenerativeModel(ai, sightingCloudParams(model), { timeout: REPLY_TIMEOUT_MS }));
}
