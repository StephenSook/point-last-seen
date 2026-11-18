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
/**
 * The generation settings our apps use. Anything else (extra candidates, thinking budgets, new fields) is dropped.
 * "_responseJsonSchema" is where a server prompt template's output schema arrives (seen live 2026-11-18).
 */
const KEPT = new Set(["maxOutputTokens", "temperature", "topP", "topK", "stopSequences", "responseMimeType", "responseSchema",
  "responseJsonSchema", "_responseJsonSchema", "responseModalities", "speechConfig"]);

/**
 * Inline media above this many base64 characters is too big to rewrite: the AI Logic proxy accepted a rewritten
 * request of 11.3 MB and failed (HTTP 500) on 15.8 MB, while an 18.4 MB request left as sent went through
 * (measured 2026-11-18). Such a request is never rewritten; see guardRequest.
 */
export const MAX_REWRITE_MEDIA_CHARS = 9_000_000;

type Config = Record<string, unknown> & { maxOutputTokens?: number };
type Part = { inlineData?: { data?: unknown } };
type Request = Record<string, unknown> & { generationConfig?: Config };

/** Base64 characters of inline media in the request's turns. */
function mediaChars(request: Request): number {
  let n = 0;
  const turns = Array.isArray(request.contents) ? (request.contents as { parts?: Part[] }[]) : [];
  for (const turn of turns) for (const part of Array.isArray(turn?.parts) ? turn.parts : []) {
    const data = part?.inlineData?.data;
    if (typeof data === "string") n += data.length;
  }
  return n;
}

/**
 * cloudGuard's rule for one generateContent request: refuse a model that is not on the list; keep only the
 * generation settings our apps use; bound the output, by the speech cap on the speech model and by the text cap on
 * every other model, whatever modality the request asks for. A template call that names itself is only checked
 * for its model. A request with more inline media than MAX_REWRITE_MEDIA_CHARS cannot be rewritten: it passes as
 * sent only when its settings already comply (a missing token limit allowed), and is refused otherwise.
 * Returns the whole request when it changes it, or undefined to leave it as sent.
 */
export function guardRequest(model: string, request: Request, template?: unknown): Request | undefined {
  const id = model.split("/").pop() ?? "";
  if (!ALLOWED_MODELS.includes(id)) throw new HttpsError("permission-denied", "This model is not allowed here.");
  // A call that names its template is left as sent after the model check. Live template calls on 2026-11-18 did
  // not name it (data.template was null), so they take the path below, which keeps the template's schema.
  if (template) return undefined;
  const config: Config = request.generationConfig ?? {};
  const cap = id === TTS_MODEL ? TTS_MAX_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS;
  const kept: Config = Object.fromEntries(Object.entries(config).filter(([k]) => KEPT.has(k)));
  const asked = kept.maxOutputTokens;
  if (!(typeof asked === "number" && asked > 0 && asked <= cap)) kept.maxOutputTokens = cap;
  const unchanged = request.generationConfig !== undefined && Object.keys(kept).length === Object.keys(config).length
    && kept.maxOutputTokens === config.maxOutputTokens;
  if (unchanged) return undefined;
  if (mediaChars(request) > MAX_REWRITE_MEDIA_CHARS) {
    // Too big to rewrite: pass only settings the guard would keep, with a token limit within the cap or none (a
    // template call carries none; its template sets it).
    const askedRaw = config.maxOutputTokens;
    const complies = Object.keys(config).every(k => KEPT.has(k))
      && (askedRaw === undefined || (typeof askedRaw === "number" && askedRaw > 0 && askedRaw <= cap));
    if (!complies) throw new HttpsError("invalid-argument", "This request is too large to adjust. Send only supported settings.");
    return undefined;
  }
  return { ...request, generationConfig: kept };
}

/**
 * One log line per call: which path the guard took, the template's name, the request's and generation config's
 * setting names, and whether the request was rewritten. Names only: never the prompt, inputs, media or values.
 */
export function guardLogLine(data: { model: string; template?: { templateName?: string }; request: Request }, out: Request | undefined) {
  return {
    event: "cloudGuard",
    path: data.template ? "template" : "direct",
    model: data.model.split("/").pop() ?? "",
    template: data.template?.templateName ?? null,
    requestKeys: Object.keys(data.request).sort(),
    configKeys: Object.keys(data.request.generationConfig ?? {}).sort(),
    mediaMB: Math.floor(mediaChars(data.request) / 1e6),
    rewritten: out !== undefined,
  };
}
