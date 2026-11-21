// What the post says while it reconnects to the incident its link names (a reload, a reopened tab): it is opening
// that incident, not asking for a join code it may not need. Without a linked incident the join form shows as before.

/** Practice searches are judge-{uid}-{12 hex} (functions/src/judgeSession.ts). */
const PRACTICE = /^judge-/;

export function connectingLine(incidentId: string | null): string | null {
  if (!incidentId) return null;
  return PRACTICE.test(incidentId) ? "Opening practice search" : `Opening incident ${incidentId}`;
}
