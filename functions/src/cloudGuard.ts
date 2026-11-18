import { HttpsError } from "firebase-functions/v2/https";

/**
 * The models a client may name through AI Logic: the same list as shared/constants/models.json, which the rules
 * gate already enforces in source (a test keeps the two equal). A function is deployed from functions/ only,
 * so the list is kept here rather than read from the shared folder at run time.
 */
export const ALLOWED_MODELS: readonly string[] = ["gemini-3.5-flash-lite", "gemini-3.8-flash-lite-tts"];
/** The largest text reply any of our calls needs (a camera sighting with its 400-character evidence), with room. */
export const MAX_OUTPUT_TOKENS = 2048;

type Request = { generationConfig?: { maxOutputTokens?: number; responseModalities?: string[] } & Record<string, unknown> } & Record<string, unknown>;

/**
 * cloudGuard's rule for one generateContent request: refuse a model that is not on the list, and bound a text
 * reply's length. Returns the whole request when it changes it, or undefined to leave it as sent. Speech output
 * (responseModalities AUDIO) is not bounded by the text limit.
 */
export function guardRequest(model: string, request: Request): Request | undefined {
  const id = model.split("/").pop() ?? "";
  if (!ALLOWED_MODELS.includes(id)) throw new HttpsError("permission-denied", "This model is not allowed here.");
  const config = request.generationConfig ?? {};
  if ((config.responseModalities ?? []).includes("AUDIO")) return undefined;
  const asked = config.maxOutputTokens;
  if (typeof asked === "number" && asked <= MAX_OUTPUT_TOKENS) return undefined;
  return { ...request, generationConfig: { ...config, maxOutputTokens: MAX_OUTPUT_TOKENS } };
}
