import { createHash } from "node:crypto";

/**
 * An incident id fit for a log line. A judge practice search's id is judge-{visitor uid}-{random}, so it is logged as
 * a short hash of the id (the same for every line about that practice search, never the uid); any other id as it is.
 */
export function logIncidentId(id: string): string {
  return id.startsWith("judge-") ? `judge#${createHash("sha256").update(id).digest("hex").slice(0, 12)}` : id;
}
