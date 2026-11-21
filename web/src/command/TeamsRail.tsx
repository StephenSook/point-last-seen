import type { Assignment } from "@pls/engine";
import type { Team } from "../data/incident";

type Props = {
  teams: readonly Team[];
  activeTeamId: string | null;
  assignments?: Readonly<Record<string, Assignment>>;
  newTeamIds?: ReadonlySet<string>;
  /** Picks a team (its cells are outlined on the map), or clears the pick when the picked team is pressed again. */
  onSelect?: (teamId: string | null) => void;
};

// A narrow strip: each team is a button. The picked team reads in fg-1 and the rest in fg-4; with none picked, every
// name reads in fg-2.
export function TeamsRail({ teams, activeTeamId, assignments = {}, newTeamIds = new Set(), onSelect }: Props) {
  return (
    <nav className="rail" aria-labelledby="teams-h">
      <h2 id="teams-h" className="label">Teams</h2>
      {teams.length === 0 ? (
        <p>No teams yet.</p>
      ) : (
        <ul className={activeTeamId ? "teams picking" : "teams"}>
          {teams.map((t) => {
            const a = assignments[t.teamId];
            return (
              <li key={t.teamId} className={t.teamId === activeTeamId ? "active" : undefined} data-testid={`team-card-${t.teamId}`}>
                <button type="button" className="team-pick" aria-pressed={t.teamId === activeTeamId} onClick={() => onSelect?.(t.teamId === activeTeamId ? null : t.teamId)}>
                  {t.name}
                  {newTeamIds.has(t.teamId) && <span className="new">New</span>}
                  {a && <span className="assign">{a.segmentIds.join(", ")}: {a.taskText}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
