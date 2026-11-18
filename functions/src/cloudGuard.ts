import { HttpsError } from "firebase-functions/v2/https";

/**
 * The models a client may name through AI Logic: the same list as shared/constants/models.json, which the rules
 * gate already enforces in source (a test keeps the two equal). A function is deployed from functions/ only,
 * so the list is kept here rather than read from the shared folder at run time.
 */
export const ALLOWED_MODELS: readonly string[] = ["gemini-3.5-flash-lite", "gemini-3.8-flash-lite-tts"];
/** The speech model: only it gets the speech cap below. */
const TTS_MODEL = "gemini-3.8-flash-lite-tts";
/** The largest text reply any of our calls needs (a camera sighting with its 400-character evidence), with room. */
export const MAX_OUTPUT_TOKENS = 2048;
/** Speech output: a 600-character text is well under a minute of audio. */
export const TTS_MAX_OUTPUT_TOKENS = 4096;
/** The generation settings our apps use. Anything else (extra candidates, thinking budgets, new fields) is dropped. */
const KEPT = new Set(["maxOutputTokens", "temperature", "topP", "topK", "stopSequences", "responseMimeType", "responseSchema",
  "responseJsonSchema", "responseModalities", "speechConfig"]);

type Config = Record<string, unknown> & { maxOutputTokens?: number };
type Request = Record<string, unknown> & { generationConfig?: Config };

/**
 * cloudGuard's rule for one generateContent request: refuse a model that is not on the list; keep only the
 * generation settings our apps use; bound the output, by the speech cap on the speech model and by the text cap on
 * every other model, whatever modality the request asks for. Returns the whole request when it changes it, or
 * undefined to leave it as sent.
 */
export function guardRequest(model: string, request: Request): Request | undefined {
  const id = model.split("/").pop() ?? "";
  if (!ALLOWED_MODELS.includes(id)) throw new HttpsError("permission-denied", "This model is not allowed here.");
  const config: Config = request.generationConfig ?? {};
  const cap = id === TTS_MODEL ? TTS_MAX_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS;
  const kept: Config = Object.fromEntries(Object.entries(config).filter(([k]) => KEPT.has(k)));
  const asked = kept.maxOutputTokens;
  if (!(typeof asked === "number" && asked > 0 && asked <= cap)) kept.maxOutputTokens = cap;
  const unchanged = request.generationConfig !== undefined && Object.keys(kept).length === Object.keys(config).length
    && kept.maxOutputTokens === config.maxOutputTokens;
  return unchanged ? undefined : { ...request, generationConfig: kept };
}
