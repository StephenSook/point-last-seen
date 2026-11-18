// The one place the web app builds AI Logic models (rules gate). One AI
// instance per app, on the Gemini Developer API, with App Check tokens.

import type { FirebaseApp } from "firebase/app";
import { getAI, getGenerativeModel, GoogleAIBackend, type AI, type GenerativeModel } from "firebase/ai";
import { REPLY_TIMEOUT_MS, wordingParams, type WordingDeps } from "./replanWording";
import { photoCloudParams, photoParams, type PhotoDeps } from "./photoCues";
import { sightingCloudParams, sightingTextParams, type SightingTextDeps } from "./sightingText";

let instance: AI | undefined;

/**
 * Request options for private reads on this laptop (a family photo, a caller's
 * note). If the SDK ever falls back to the cloud for an ONLY_ON_DEVICE call
 * (firebase-js-sdk #10635), the request goes to a host that cannot resolve
 * (RFC 2606), so nothing leaves the machine. The gate is the first check;
 * this is the second.
 */
export const PRIVATE_REQUEST_OPTIONS = { timeout: REPLY_TIMEOUT_MS, baseUrl: "https://on-device-only.invalid" } as const;

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
  return generatorFor(getGenerativeModel(ai, sightingTextParams(), PRIVATE_REQUEST_OPTIONS));
}

/** The consented cloud read of one note (ONLY_IN_CLOUD). */
export function sightingCloudGenerator(ai: AI, model: string): SightingTextDeps["generate"] {
  return generatorFor(getGenerativeModel(ai, sightingCloudParams(model), { timeout: REPLY_TIMEOUT_MS }));
}

type ImageModel = Pick<GenerativeModel, "generateContent">;

export function photoGeneratorFor(model: ImageModel): PhotoDeps["generate"] {
  return async (jpegBase64) => {
    const r = await model.generateContent([
      { type: "text", text: "Read this photo." },
      { type: "inlineData", inlineData: { mimeType: "image/jpeg", data: jpegBase64 } },
    ]);
    return { text: r.response.text(), inferenceSource: r.response.inferenceSource };
  };
}

/** One family photo read on this laptop (ONLY_ON_DEVICE). Call it only after the gate says yes. */
export function photoGenerator(ai: AI): PhotoDeps["generate"] {
  return photoGeneratorFor(getGenerativeModel(ai, photoParams(), PRIVATE_REQUEST_OPTIONS));
}

/** The consented cloud read of one photo (ONLY_IN_CLOUD). */
export function photoCloudGenerator(ai: AI, model: string): PhotoDeps["generate"] {
  return photoGeneratorFor(getGenerativeModel(ai, photoCloudParams(model), { timeout: REPLY_TIMEOUT_MS }));
}
