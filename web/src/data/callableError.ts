// What a failed Cloud Functions call says, read the same way everywhere. The Firebase SDK ends every
// callable error message with the HTTP status (" [503]"), so the server's sentence is what comes before
// it. A stable details.reason, when the server sends one, is the safer thing to match on.

const STATUS_SUFFIX = / \[\d{3}\]$/;

export type CallableError = { code: string; message: string; reason: string | null };

export function callableError(e: unknown): CallableError {
  const o = typeof e === "object" && e !== null ? (e as { code?: unknown; details?: unknown }) : {};
  const code = o.code === undefined ? "" : String(o.code);
  const raw = e instanceof Error ? e.message : "";
  const message = code.startsWith("functions/") ? raw.replace(STATUS_SUFFIX, "") : raw;
  const d = o.details;
  const reason = typeof d === "object" && d !== null && typeof (d as { reason?: unknown }).reason === "string" ? (d as { reason: string }).reason : null;
  return { code, message, reason };
}
