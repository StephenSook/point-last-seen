// Dev-server-only harness (web/harness/teams.html): the command post's grid with the Teams strip beside the map, so a
// team can be picked and its assigned cells outlined. Synthetic teams and tasks, no Firebase.

import type { Assignment } from "@pls/engine";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TeamsRail } from "../command/TeamsRail";
import { MapView } from "../map/MapView";
import "../theme/fonts.css";
import "../theme/base.css";
import { HARNESS_POA, HARNESS_SEGMENTS } from "./mapHarness";

const TEAMS = [
  { teamId: "t1", name: "Team 1" },
  { teamId: "t2", name: "Team 2" },
  { teamId: "t3", name: "Team 3" },
];
const ASSIGNMENTS: Record<string, Assignment> = {
  t1: { teamId: "t1", segmentIds: ["CD"], taskText: "Hasty search of the pond edge", reason: "" },
  t2: { teamId: "t2", segmentIds: ["AB", "AC"], taskText: "Sweep the north field", reason: "" },
};

function Harness() {
  const [active, setActive] = useState<string | null>(null);
  return (
    <div className="post">
      <header className="post-head">
        <span className="drill">Synthetic teams, not drill data.</span>
      </header>
      <div className="post-body">
        <TeamsRail teams={TEAMS} activeTeamId={active} assignments={ASSIGNMENTS} onSelect={setActive} />
        <MapView segments={HARNESS_SEGMENTS} poa={HARNESS_POA} outlined={active ? (ASSIGNMENTS[active]?.segmentIds ?? []) : []} />
        <aside className="rail right" aria-label="Rail">
          <p className="small">Right rail</p>
        </aside>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
