// Dev-server-only harness (web/harness/approach.html): the approach card over a made-up shared profile.
// ?aids=project_lifesaver,gps_tracker&note=...: the tracking aids the family named; ?aids= (empty): none;
// no aids parameter: the field is absent (unknown).

import { createRoot } from "react-dom/client";
import type { TrackingAid } from "@pls/engine";
import { ApproachCard } from "../command/ApproachCard";
import { emptyProfile, profileDocs } from "../data/profile";
import "../theme/fonts.css";
import "../theme/base.css";

const q = new URLSearchParams(location.search);
const base = profileDocs(emptyProfile()).shared;
const aids = q.get("aids");
const shared = {
  ...base,
  answersTo: "Roberta",
  ...(aids === null ? {} : { trackingAids: { aids: aids.split(",").filter(Boolean) as TrackingAid[], note: q.get("note") ?? "" } }),
};

createRoot(document.getElementById("root")!).render(
  <main style={{ width: 360, padding: 16 }}>
    <p className="drill">Made-up profile, not drill data.</p>
    <ApproachCard shared={shared} photoOld={false} />
  </main>,
);
