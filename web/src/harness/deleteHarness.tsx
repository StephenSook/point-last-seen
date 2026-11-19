// Dev-server-only harness (web/harness/delete.html): the delete-media control with fakes. Nothing is
// deleted. ?counts=clips,photos,records sets what is "stored"; ?answer=ok returns the total, denied refuses,
// unavailable fails as a lost connection would, nocount returns no count.

import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DeleteMedia } from "../command/DeleteMedia";
import "../theme/fonts.css";
import "../theme/base.css";

const q = new URLSearchParams(location.search);
const [clips = 0, photos = 0, records = 0] = (q.get("counts") ?? "0,0,0").split(",").map(Number);
// ?after=clips,photos,records: what a count finds once "Delete now" has run (default: the same as before).
const after = q.get("after")?.split(",").map(Number);

function Harness() {
  const [runs, setRuns] = useState(0);
  const ran = useRef(false);
  return (
    <main style={{ width: 360, padding: 16 }}>
      <p className="drill">Fakes only, nothing is deleted.</p>
      <DeleteMedia
        count={async () => (ran.current && after ? { clips: after[0] ?? 0, photos: after[1] ?? 0, records: after[2] ?? 0 } : { clips, photos, records })}
        run={async () => {
          setRuns((n) => n + 1);
          ran.current = true;
          const answer = q.get("answer");
          if (answer === "denied") throw Object.assign(new Error("Only the incident's command can delete its media."), { code: "functions/permission-denied" });
          if (answer === "unavailable") throw Object.assign(new Error("x"), { code: "functions/unavailable" });
          if (answer === "nocount") return null;
          return clips + photos + records;
        }}
        onClose={() => {}}
      />
      <pre data-testid="runs">{runs}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
