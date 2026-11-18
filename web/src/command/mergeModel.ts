// Merge lanes: one lane per team, one card per arrived event, with the time
// the report spent on the phone without signal.

export type MergeDoc = {
  eventId: string;
  teamId: string | null;
  deviceId: string;
  clientTimeMs: number;
  serverTimeMs: number | null;
};

export type Card = {
  eventId: string;
  deviceId: string;
  sentAtMs: number;
  arrivedAtMs: number | null;
  offlineForMs: number | null;
  clockSuspect: boolean;
};

export type Lane = {
  teamId: string;
  name: string;
  silent: boolean;
  quietForMs: number | null;
  cards: Card[];
};

const DAY_MS = 24 * 3600_000;

function card(d: MergeDoc, offsets: Record<string, number>): Card {
  const sentAtMs = d.clientTimeMs + (offsets[d.deviceId] ?? 0);
  const arrivedAtMs = d.serverTimeMs;
  if (arrivedAtMs === null) {
    return { eventId: d.eventId, deviceId: d.deviceId, sentAtMs, arrivedAtMs, offlineForMs: null, clockSuspect: false };
  }
  const gap = arrivedAtMs - sentAtMs;
  const plausible = gap >= 0 && gap <= DAY_MS;
  return { eventId: d.eventId, deviceId: d.deviceId, sentAtMs, arrivedAtMs, offlineForMs: plausible ? gap : null, clockSuspect: !plausible };
}

/**
 * @param clockOffsets server time minus device clock, per deviceId, measured when the phone packed.
 */
export function mergeModel(
  docs: readonly MergeDoc[],
  teams: readonly { teamId: string; name: string }[],
  nowMs: number,
  clockOffsets: Record<string, number> = {},
): Lane[] {
  const seen = new Set<string>();
  const byTeam = new Map<string, Card[]>(teams.map((t) => [t.teamId, []]));
  for (const d of docs) {
    if (d.teamId === null || seen.has(d.eventId)) continue;
    const list = byTeam.get(d.teamId);
    if (!list) continue;
    seen.add(d.eventId);
    list.push(card(d, clockOffsets));
  }
  return teams.map((t) => {
    const cards = (byTeam.get(t.teamId) ?? []).sort((a, b) => a.sentAtMs - b.sentAtMs || (a.eventId < b.eventId ? -1 : 1));
    const arrivals = cards.map((c) => c.arrivedAtMs).filter((x): x is number => x !== null);
    const last = arrivals.length > 0 ? Math.max(...arrivals) : null;
    return { teamId: t.teamId, name: t.name, silent: last === null, quietForMs: last === null ? null : Math.max(0, nowMs - last), cards };
  });
}
