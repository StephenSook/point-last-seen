// Dev-server-only harness (web/harness/photos.html): the photo tray with two
// synthetic photos and a save that never settles (?save=never, the link is down)
// or fails (?save=fail, the server refused). No Firebase, no model.

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PhotoTray, type TrayPhoto } from "../photos/PhotoTray";
import "../theme/fonts.css";
import "../theme/base.css";

const save = new URLSearchParams(location.search).get("save");

async function syntheticJpeg(label: string): Promise<Uint8Array> {
  const c = new OffscreenCanvas(160, 100);
  const g = c.getContext("2d")!;
  g.fillStyle = "#304050";
  g.fillRect(0, 0, 160, 100);
  g.fillStyle = "#fff";
  g.fillText(label, 20, 50);
  return new Uint8Array(await (await c.convertToBlob({ type: "image/jpeg" })).arrayBuffer());
}

function Harness() {
  const [photos, setPhotos] = useState<TrayPhoto[]>([]);
  useEffect(() => {
    void Promise.all([syntheticJpeg("Synthetic sign A"), syntheticJpeg("Synthetic sign B")]).then(([a, b]) =>
      setPhotos([{ sha256: "a".repeat(64), bytes: a! }, { sha256: "b".repeat(64), bytes: b! }]),
    );
  }, []);
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic photos, not drill data.</p>
      <PhotoTray
        photos={photos}
        loadError={null}
        deviceState="no-model"
        onCheckDevice={async () => {}}
        downloadPct={null}
        onAddFiles={async () => {}}
        readOnLaptop={async () => ({ refused: "no-on-device-model" })}
        readInCloud={async () => ({ refused: "not-in-cloud" })}
        onDecide={() => (save === "fail" ? new Promise<void>((_, reject) => setTimeout(() => reject(new Error("refused")), 100)) : new Promise<void>(() => {}))}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
