// Dev-server-only harness (web/harness/profile.html): the profile form with a save
// that never settles (the link is down). ?names=1: the family app has saved a list of other names.
// ?aids=project_lifesaver,...: the family already named these tracking aids. No Firebase.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ProfileForm } from "../command/ProfileForm";
import type { FamilyProfile, TrackingAid } from "@pls/engine";
import { emptyProfile } from "../data/profile";
import "../theme/fonts.css";
import "../theme/base.css";

const withNames = new URLSearchParams(location.search).get("names") === "1";
const aidsParam = new URLSearchParams(location.search).get("aids");
const base = withNames ? { ...emptyProfile(), otherNames: ["Bea", "Mom", "Roberta"], nickname: "Bea" } : emptyProfile();
const initial: FamilyProfile = aidsParam === null ? base : { ...base, trackingAids: { aids: aidsParam.split(",").filter(Boolean) as TrackingAid[], note: "" } };

function Harness() {
  const [open, setOpen] = useState(true);
  const [saves, setSaves] = useState(0);
  const [savedAids, setSavedAids] = useState("");
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic profile, not drill data.</p>
      {open ? (
        <ProfileForm
          initial={initial}
          onSave={(saved) => {
            setSaves((n) => n + 1);
            setSavedAids(saved.trackingAids === undefined ? "absent" : JSON.stringify(saved.trackingAids));
            return new Promise<void>(() => {});
          }}
          onPickPlace={() => {}}
          onPlaceToCheck={async () => {}}
          onClose={() => setOpen(false)}
        />
      ) : (
        <>
          <p data-testid="closed">Form closed after {saves} save.</p>
          <pre data-testid="saved-aids">{savedAids}</pre>
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
