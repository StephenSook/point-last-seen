// Remote Config for the command post. Nothing here changes engine output:
// engine parameters travel in the incident doc and the pack.

import type { FirebaseApp } from "firebase/app";
import { activate, fetchAndActivate, getAll, getRemoteConfig, getValue, onConfigUpdate } from "firebase/remote-config";

export const RC_DEFAULTS = {
  cloud_model_web: "gemini-3.5-flash-lite",
  kill_cloud: false,
  use_limited_use_tokens: true,
  /** The server prompt template for the consented cloud read of a sighting note. */
  sighting_template_id: "pls-sighting-note-v1",
  /** The server prompt template for the consented cloud read of a family photo. */
  photo_template_id: "pls-photo-cues-v1",
} as const;

export type WebRc = {
  cloudModelWeb: string;
  killCloud: boolean;
  useLimitedUseTokens: boolean;
  sightingTemplateId: string;
  photoTemplateId: string;
  /** Where cloud_model_web came from: the fetched config ("remote") or the in-app default. */
  cloudModelSource?: "remote" | "default" | "static";
  /** When Remote Config last answered a fetch (ms since 1970), or null when it never has. */
  fetchedAtMs?: number | null;
};

// Live paths use the flash-lite family only. A larger flash model took 116 s
// on one call (measured), so any other id falls back to the default.
const LIVE_MODEL = /^gemini-[0-9]+(\.[0-9]+)*-flash-lite$/;

function model(v: string | undefined, fallback: string): string {
  if (v === undefined) return fallback;
  const id = v.trim();
  return LIVE_MODEL.test(id) ? id : fallback;
}

// A template id is a plain name (it is part of the request path), so anything else falls back.
const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
function templateId(v: string | undefined, fallback: string): string {
  const id = v?.trim() ?? "";
  return TEMPLATE_ID.test(id) ? id : fallback;
}

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  const s = v.trim().toLowerCase();
  return s === "true" ? true : s === "false" ? false : fallback;
}

export function parseRc(values: Partial<Record<keyof typeof RC_DEFAULTS, string>>): WebRc {
  const d = RC_DEFAULTS;
  return {
    cloudModelWeb: model(values.cloud_model_web, d.cloud_model_web),
    killCloud: bool(values.kill_cloud, d.kill_cloud),
    useLimitedUseTokens: bool(values.use_limited_use_tokens, d.use_limited_use_tokens),
    sightingTemplateId: templateId(values.sighting_template_id, d.sighting_template_id),
    photoTemplateId: templateId(values.photo_template_id, d.photo_template_id),
  };
}

/** Fetches, activates and listens for real-time updates. `onChange` gets every activated set. */
export function startRemoteConfig(app: FirebaseApp, onChange: (rc: WebRc) => void): () => void {
  const rc = getRemoteConfig(app);
  rc.defaultConfig = Object.fromEntries(Object.entries(RC_DEFAULTS).map(([k, v]) => [k, typeof v === "string" ? v : String(v)]));
  const emit = () =>
    onChange({
      ...parseRc(Object.fromEntries(Object.entries(getAll(rc)).map(([k, v]) => [k, v.asString()]))),
      cloudModelSource: getValue(rc, "cloud_model_web").getSource(),
      fetchedAtMs: rc.fetchTimeMillis > 0 ? rc.fetchTimeMillis : null,
    });
  emit();
  fetchAndActivate(rc).then(emit, () => emit());
  return onConfigUpdate(rc, {
    next: () => {
      activate(rc).then(emit, () => undefined);
    },
    error: () => undefined,
    complete: () => undefined,
  });
}
