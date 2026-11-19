import { createRoot } from "react-dom/client";
import { ExtrasDock } from "../ExtrasDock";
import type { PostState } from "../hostApp";

const state: PostState = {
  view: {
    incident: { name: "Dock harness", mode: "drill", status: "open", priorVersion: 0 },
    teams: [],
    segments: [],
    rowPrior: null,
    clockOffsets: {},
  },
  events: [],
  plans: [],
  profile: null,
  denied: false,
  offline: false,
};

const root = document.getElementById("root");
if (!root) throw new Error("Missing harness root");

createRoot(root).render(
  <main>
    <header className="post-head">
      <span className="drill">Training drill. Nobody is missing.</span>
      <span>Made-up harness data</span>
      <ExtrasDock
        incidentId="dock-harness"
        state={state}
        vs={null}
        map={null}
        // Fakes: nothing is deleted. The page counts how many times "Delete now" ran.
        deleteMedia={{
          count: async () => ({ clips: 2, photos: 1, records: 3 }),
          run: async () => {
            document.body.dataset["deleteRuns"] = String(Number(document.body.dataset["deleteRuns"] ?? "0") + 1);
            return 6;
          },
        }}
      />
    </header>
  </main>,
);
