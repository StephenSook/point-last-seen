// A refused prior write has two very different causes. The rules refuse a batch that does not raise
// the prior version by exactly one, which happens when another seat rebuilt first; they also refuse
// writes for other reasons (for example a closed incident). Only a server read that shows the
// incident at the sent version or newer confirms the first cause.

export const PRIOR_SUPERSEDED = "pls/prior-superseded";

/**
 * Returns the error to report. A permission refusal becomes PRIOR_SUPERSEDED only when the server's
 * version is at least the version this write tried to save; anything unconfirmed keeps its original error.
 */
export async function classifyPriorRefusal(e: unknown, sentVersion: number, serverVersion: () => Promise<number | null>): Promise<unknown> {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  if (!code.endsWith("permission-denied")) return e;
  let server: number | null;
  try {
    server = await serverVersion();
  } catch {
    return e;
  }
  if (typeof server !== "number" || server < sentVersion) return e;
  return Object.assign(new Error("Another seat saved a newer prior first."), { code: PRIOR_SUPERSEDED });
}
