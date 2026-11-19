// Dev-server-only harness (web/harness/profile.html): the profile form with a save
// that never settles (the link is down). ?names=1: the family app has saved a list of other names. No Firebase.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ProfileForm } from "../command/ProfileForm";
import { emptyProfile } from "../data/profile";
import "../theme/fonts.css";
import "../theme/base.css";

const withNames = new URLSearchParams(location.search).get("names") === "1";
const initial = withNames ? { ...emptyProfile(), otherNames: ["Bea", "Mom", "Roberta"], nickname: "Bea" } : emptyProfile();

function Harness() {
  const [open, setOpen] = useState(true);
  const [saves, setSaves] = useState(0);
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic profile, not drill data.</p>
      {open ? (
        <ProfileForm
          initial={initial}
          onSave={() => {
            setSaves((n) => n + 1);
            return new Promise<void>(() => {});
          }}
          onPickPlace={() => {}}
          onPlaceToCheck={async () => {}}
          onClose={() => setOpen(false)}
        />
      ) : (
        <p data-testid="closed">Form closed after {saves} save.</p>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
