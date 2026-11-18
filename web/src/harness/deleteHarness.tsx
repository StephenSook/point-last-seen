// Dev-server-only harness (web/harness/delete.html): the delete-media control with fakes. Nothing is
// deleted. ?counts=clips,photos,records sets what is "stored"; ?answer=ok returns the total, denied refuses.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DeleteMedia } from "../command/DeleteMedia";
import "../theme/fonts.css";
import "../theme/base.css";

const q = new URLSearchParams(location.search);
const [clips = 0, photos = 0, records = 0] = (q.get("counts") ?? "0,0,0").split(",").map(Number);

function Harness() {
  const [runs, setRuns] = useState(0);
  return (
    <main style={{ width: 360, padding: 16 }}>
      <p className="drill">Fakes only, nothing is deleted.</p>
      <DeleteMedia
        count={async () => ({ clips, photos, records })}
        run={async () => {
          setRuns((n) => n + 1);
          if (q.get("answer") === "denied") throw Object.assign(new Error("Only the incident's command can delete its media."), { code: "functions/permission-denied" });
          return clips + photos + records;
        }}
        onClose={() => {}}
      />
      <pre data-testid="runs">{runs}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
