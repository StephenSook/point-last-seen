// Dev-server-only harness (web/harness/post-layout.html): the command post's grid with rails taller than the
// window and the real What changed section, whose spoken line is visually hidden. No Firebase, no map.

import { createRoot } from "react-dom/client";
import { ChangeBeat } from "../command/ChangeBeat";
import "../theme/fonts.css";
import "../theme/base.css";

const filler = (n: number, label: string) =>
  Array.from({ length: n }, (_, i) => (
    <p key={i} className="small">
      {`${label} line ${i + 1}`}
    </p>
  ));

function Harness() {
  return (
    <div className="post">
      <header className="post-head">
        <span className="drill">Synthetic layout, not drill data.</span>
      </header>
      {/* ?offline=1: the line the command post shows when the link drops, between the header and the body. */}
      {new URLSearchParams(location.search).get("offline") === "1" && (
        <p className="error" role="status">
          No connection. Showing the last data received.
        </p>
      )}
      <div className="post-body">
        <aside className="rail" aria-label="Teams">
          {filler(40, "Team")}
        </aside>
        <div className="map-wrap" data-testid="map" />
        <aside className="rail right" aria-label="Rail">
          {filler(30, "Rail")}
          <ChangeBeat change={{ changed: [], banner: "Sighting saved.", announce: "A spoken line for screen readers." }} holding={false} onHold={() => {}} />
          {filler(30, "More")}
          <button type="button" className="btn">Last button</button>
        </aside>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
