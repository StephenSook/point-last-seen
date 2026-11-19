// Dev-server-only harness (web/harness/tray-revoke.html): the photo tray fed by usePhotoTray, with a fake
// store. "Slow reload" starts a load that finishes only on "Load finishes"; "Another seat deletes" empties the
// store and changes mediaRevokedAt, as the server's delete does. No Firebase, no model.

import { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { PhotoTray, type TrayPhoto } from "../photos/PhotoTray";
import { usePhotoTray } from "../photos/usePhotoTray";
import "../theme/fonts.css";
import "../theme/base.css";

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
  const stored = useRef(true);
  const slowNext = useRef(false);
  const gate = useRef<(() => void) | null>(null);
  const [revokedAtMs, setRevokedAtMs] = useState<number | null>(null);
  const load = useCallback(async () => {
    // What the store holds when the load starts is what it returns.
    const photos: TrayPhoto[] = stored.current
      ? [{ sha256: "a".repeat(64), bytes: await syntheticJpeg("Synthetic sign A") }, { sha256: "b".repeat(64), bytes: await syntheticJpeg("Synthetic sign B") }]
      : [];
    if (slowNext.current) {
      slowNext.current = false;
      await new Promise<void>((resolve) => (gate.current = resolve));
    }
    return { photos, error: null };
  }, []);
  const tray = usePhotoTray(load, revokedAtMs, true);
  return (
    <main className="rail right" style={{ width: 340 }}>
      <p className="drill">Synthetic photos, not drill data.</p>
      <PhotoTray
        key={tray.epoch}
        photos={tray.photos}
        loadError={tray.error}
        deviceState="no-model"
        onCheckDevice={async () => {}}
        downloadPct={null}
        onAddFiles={async () => {}}
        readOnLaptop={async () => ({ refused: "no-on-device-model" })}
        readInCloud={async () => ({ refused: "not-in-cloud" })}
        onDecide={() => new Promise<void>(() => {})}
      />
      <button type="button" onClick={() => { slowNext.current = true; void tray.reload(); }}>Slow reload</button>
      <button type="button" onClick={() => { stored.current = false; setRevokedAtMs(Date.now()); }}>Another seat deletes</button>
      <button type="button" onClick={() => gate.current?.()}>Load finishes</button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
