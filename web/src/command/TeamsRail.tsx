import type { Assignment } from "@pls/engine";
import type { Team } from "../data/incident";

type Props = {
  teams: readonly Team[];
  activeTeamId: string | null;
  assignments?: Readonly<Record<string, Assignment>>;
  newTeamIds?: ReadonlySet<string>;
};

export function TeamsRail({ teams, activeTeamId, assignments = {}, newTeamIds = new Set() }: Props) {
  return (
    <nav className="rail" aria-labelledby="teams-h">
      <h2 id="teams-h" className="label">Teams</h2>
      {teams.length === 0 ? (
        <p>No teams yet.</p>
      ) : (
        <ul className="teams">
          {teams.map((t) => {
            const a = assignments[t.teamId];
            return (
              <li key={t.teamId} className={t.teamId === activeTeamId ? "active" : undefined} data-testid={`team-card-${t.teamId}`}>
                {t.name}
                {newTeamIds.has(t.teamId) && <span className="new">New</span>}
                {a && <span className="assign">{a.segmentIds.join(", ")}: {a.taskText}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
