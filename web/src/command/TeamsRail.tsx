import type { Team } from "../data/incident";

export function TeamsRail({ teams, activeTeamId }: { teams: readonly Team[]; activeTeamId: string | null }) {
  return (
    <nav className="rail" aria-labelledby="teams-h">
      <h2 id="teams-h" className="label">Teams</h2>
      {teams.length === 0 ? (
        <p>No teams yet.</p>
      ) : (
        <ul className="teams">
          {teams.map((t) => (
            <li key={t.teamId} className={t.teamId === activeTeamId ? "active" : undefined} data-testid={`team-card-${t.teamId}`}>
              {t.name}
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
