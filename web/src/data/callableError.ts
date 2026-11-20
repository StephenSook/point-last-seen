// What a failed Cloud Functions call says, read the same way everywhere. The Firebase SDK ends every
// callable error message with the HTTP status (" [503]"), so the server's sentence is what comes before
// it. Status 0 means the request never got an answer (a lost connection). A stable details.reason, when
// the server sends one, is the safer thing to match on.

const STATUS_SUFFIX = / \[(\d{1,3})\]$/;

export type CallableError = { code: string; message: string; reason: string | null; status: number | null };

export function callableError(e: unknown): CallableError {
  const o = typeof e === "object" && e !== null ? (e as { code?: unknown; details?: unknown }) : {};
  const code = o.code === undefined ? "" : String(o.code);
  const raw = e instanceof Error ? e.message : "";
  const suffix = code.startsWith("functions/") ? STATUS_SUFFIX.exec(raw) : null;
  const message = suffix ? raw.slice(0, suffix.index) : raw;
  const status = suffix ? Number(suffix[1]) : null;
  const d = o.details;
  const reason = typeof d === "object" && d !== null && typeof (d as { reason?: unknown }).reason === "string" ? (d as { reason: string }).reason : null;
  return { code, message, reason, status };
}
