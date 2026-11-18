// Remote Config for the command post. Nothing here changes engine output:
// engine parameters travel in the incident doc and the pack.

import type { FirebaseApp } from "firebase/app";
import { activate, fetchAndActivate, getAll, getRemoteConfig, onConfigUpdate } from "firebase/remote-config";

export const RC_DEFAULTS = {
  cloud_model_ios: "gemini-3.5-flash-lite",
  cloud_model_web: "gemini-3.5-flash-lite",
  cloud_model_android: "gemini-3.5-flash-lite",
  kill_cloud: false,
  use_limited_use_tokens: true,
  judge_seed_run_id: "",
  judge_sessions_per_day: 300,
  minimum_version_ios: "",
  minimum_version_android: "",
} as const;

export type WebRc = {
  cloudModelWeb: string;
  killCloud: boolean;
  useLimitedUseTokens: boolean;
  judgeSeedRunId: string;
  judgeSessionsPerDay: number;
};

// Live paths use the flash-lite family only. A larger flash model took 116 s
// on one call (measured), so any other id falls back to the default.
const LIVE_MODEL = /^gemini-[0-9]+(\.[0-9]+)*-flash-lite$/;

function model(v: string | undefined, fallback: string): string {
  if (v === undefined) return fallback;
  const id = v.trim();
  return LIVE_MODEL.test(id) ? id : fallback;
}

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  const s = v.trim().toLowerCase();
  return s === "true" ? true : s === "false" ? false : fallback;
}

function num(v: string | undefined, fallback: number, ok: (n: number) => boolean): number {
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && ok(n) ? n : fallback;
}

export function parseRc(values: Partial<Record<keyof typeof RC_DEFAULTS, string>>): WebRc {
  const d = RC_DEFAULTS;
  return {
    cloudModelWeb: model(values.cloud_model_web, d.cloud_model_web),
    killCloud: bool(values.kill_cloud, d.kill_cloud),
    useLimitedUseTokens: bool(values.use_limited_use_tokens, d.use_limited_use_tokens),
    judgeSeedRunId: values.judge_seed_run_id?.trim() ?? d.judge_seed_run_id,
    judgeSessionsPerDay: num(values.judge_sessions_per_day, d.judge_sessions_per_day, (n) => Number.isInteger(n) && n >= 0),
  };
}

/** Fetches, activates and listens for real-time updates. `onChange` gets every activated set. */
export function startRemoteConfig(app: FirebaseApp, onChange: (rc: WebRc) => void): () => void {
  const rc = getRemoteConfig(app);
  rc.defaultConfig = Object.fromEntries(Object.entries(RC_DEFAULTS).map(([k, v]) => [k, typeof v === "string" ? v : String(v)]));
  const emit = () => onChange(parseRc(Object.fromEntries(Object.entries(getAll(rc)).map(([k, v]) => [k, v.asString()]))));
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
