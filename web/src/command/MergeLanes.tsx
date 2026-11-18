import type { Lane } from "./mergeModel";

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
const mins = (ms: number) => Math.round(ms / 60_000);

export function MergeLanes({ lanes }: { lanes: readonly Lane[] }) {
  return (
    <section aria-labelledby="lanes-h">
      <h2 id="lanes-h" className="label">Reports by team</h2>
      <div className="lanes">
        {lanes.map((lane) => (
          <div key={lane.teamId} className={lane.silent ? "lane silent" : "lane"} data-testid={`lane-${lane.teamId}`}>
            <h3>{lane.name}</h3>
            {lane.silent && <div className="card">No reports yet.</div>}
            {lane.cards.map((c) => (
              <div key={c.eventId} className="card num">
                sent {hhmm(c.sentAtMs)}
                {c.arrivedAtMs === null ? " / on its way" : ` / arrived ${hhmm(c.arrivedAtMs)}`}
                {c.offlineForMs !== null && c.offlineForMs >= 60_000 && ` (${mins(c.offlineForMs)} min without signal)`}
                {c.clockSuspect && <span className="warn"> (phone clock looks wrong)</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
