// The one place the web app builds AI Logic models (rules gate). One AI
// instance per app, on the Gemini Developer API, with App Check tokens.

import type { FirebaseApp } from "firebase/app";
import { getAI, getGenerativeModel, getTemplateGenerativeModel, GoogleAIBackend, type AI, type GenerativeModel, type TemplateRequest } from "firebase/ai";
import { REPLY_TIMEOUT_MS, wordingParams, type WordingDeps } from "./replanWording";
import { photoCloudParams, photoParams, type PhotoDeps } from "./photoCues";
import { sightingTextParams, type SightingTextDeps } from "./sightingText";
import { clipCloudParams, clipParts, type ClipWindow } from "./clipRead";
import { frameCheckParams } from "./frameCheck";

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

type TemplateModel = { generateContent: (r: TemplateRequest) => Promise<{ response: { text: () => string; inferenceSource?: string } }> };

/** A server prompt template call: only the template id and the note leave the laptop. */
export function templateGeneratorFor(model: TemplateModel, templateId: string): SightingTextDeps["generate"] {
  return async (note) => {
    const r = await model.generateContent({ templateId, templateVariables: { note } });
    return { text: r.response.text(), inferenceSource: r.response.inferenceSource };
  };
}

/**
 * The consented cloud read of one note through the server prompt template (Remote Config
 * sighting_template_id): the template holds the model, the instruction and the output schema.
 */
export function sightingTemplateGenerator(ai: AI, templateId: string): SightingTextDeps["generate"] {
  return templateGeneratorFor(getTemplateGenerativeModel(ai, { timeout: REPLY_TIMEOUT_MS }) as unknown as TemplateModel, templateId);
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

/** A clip of up to 14,000,000 bytes is sent inline and read as video, so it gets longer than a text or photo read. */
export const CLIP_TIMEOUT_MS = 120_000;

export type ClipGenerate = (base64: string, mimeType: string, window?: ClipWindow) => Promise<{ text: string; inferenceSource?: string }>;

export function clipGeneratorFor(model: ImageModel): ClipGenerate {
  return async (base64, mimeType, window) => {
    const r = await model.generateContent(clipParts(base64, mimeType, window));
    return { text: r.response.text(), inferenceSource: r.response.inferenceSource };
  };
}

/** The consented cloud read of one camera clip (ONLY_IN_CLOUD). */
export function clipCloudGenerator(ai: AI, model: string): ClipGenerate {
  return clipGeneratorFor(getGenerativeModel(ai, clipCloudParams(model), { timeout: CLIP_TIMEOUT_MS }));
}

export function frameGeneratorFor(model: ImageModel): (jpegBase64: string) => Promise<{ text: string }> {
  return async (jpegBase64) => {
    const r = await model.generateContent([
      { type: "text", text: "Check this frame." },
      { type: "inlineData", inlineData: { mimeType: "image/jpeg", data: jpegBase64 } },
    ]);
    return { text: r.response.text() };
  };
}

/** One frame of a clip checked on this laptop (ONLY_ON_DEVICE). Call it only after the gate says yes. */
export function frameCheckGenerator(ai: AI): (jpegBase64: string) => Promise<{ text: string }> {
  return frameGeneratorFor(getGenerativeModel(ai, frameCheckParams(), PRIVATE_REQUEST_OPTIONS));
}

/** Starts Chrome's model download from a click, on a model built with the photo options the reads use. */
export function deviceModelInitializer(ai: AI): (onProgress: (v: number) => void) => Promise<void> {
  return (onProgress) => getGenerativeModel(ai, photoParams(), PRIVATE_REQUEST_OPTIONS).initializeDeviceModel(onProgress);
}
