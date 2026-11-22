// Family photos at the command post. Each photo is read on this laptop when
// the gate allows; otherwise nothing is sent, and a cloud read needs the family's
// own consent for that photo, recorded when they shared it. A person answers yes, no or not sure.

import type { PhotoCues, RouteRecord } from "@pls/engine";
import { useEffect, useMemo, useState } from "react";
import type { DeviceState } from "../ai/deviceModel";
import { receiptLines } from "../ai/receipt";
import { RouteGlyph } from "../command/RouteGlyph";
import { PHOTO_DELETED, PHOTO_UNCHECKED, type FamilyDecision } from "../data/photos";

export type TrayPhoto = { sha256: string; bytes: Uint8Array };
/** `sentBytes`: the size of what the read sent (the photo as base64 for a cloud read; 0 on this laptop). */
type Done = { cues: PhotoCues; route: RouteRecord; sentBytes?: number };
type Read = Done | { couldNot: string } | { noModel: true } | { consent: true };

type Props = {
  photos: readonly TrayPhoto[];
  loadError: string | null;
  deviceState: DeviceState | null;
  onCheckDevice: () => Promise<void>;
  downloadPct: number | null;
  onAddFiles: (files: File[]) => Promise<void>;
  readOnLaptop: (p: TrayPhoto) => Promise<Done | { refused: string }>;
  readInCloud: (p: TrayPhoto) => Promise<Done | { refused: string }>;
  onDecide: (p: TrayPhoto, cues: PhotoCues | null, route: RouteRecord | null, d: FamilyDecision) => Promise<void>;
};

const STATE_LINE: Record<DeviceState, string> = {
  "no-model": "This browser has no built-in model. Photos stay unread here unless you choose a cloud read for one.",
  downloadable: "This browser can download a built-in model.",
  text: "This browser's model cannot read images, so no model read these photos.",
  image: "This device can read photos here.",
};
export { PHOTO_DELETED };

const COULD_NOT: Record<string, string> = {
  deleted: PHOTO_DELETED,
  "no-consent": "The family has not agreed to a cloud reading of this photo, so no AI model in the cloud reads it.",
  mismatch: "This photo's file does not match its name, so it was not sent.",
  "consent-unchecked": "Could not check the family's consent with the server. Nothing was sent.",
  "not-on-device": "Couldn't read on this device. The result was discarded.",
  timeout: "Couldn't read in time.",
  invalid: "Couldn't read this photo.",
  "cloud-paused": "Cloud reads are paused by command.",
  "not-in-cloud": "Couldn't read in the cloud.",
};

function Thumb({ bytes }: { bytes: Uint8Array }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/jpeg" })), [bytes]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="Family photo" className="thumb" />;
}

export function PhotoTray({ photos, loadError, deviceState, onCheckDevice, downloadPct, onAddFiles, readOnLaptop, readInCloud, onDecide }: Props) {
  const [reads, setReads] = useState<Record<string, Read>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // The photo being read on this laptop: its first read in a page can take tens of seconds (PHOTO_READ_TIMEOUT_MS).
  const [readingHere, setReadingHere] = useState<string | null>(null);
  const [decided, setDecided] = useState<Record<string, FamilyDecision>>({});
  const [saveError, setSaveError] = useState<Record<string, string | null>>({});
  const set = (sha: string, r: Read) => setReads((x) => ({ ...x, [sha]: r }));

  async function run(p: TrayPhoto, how: "laptop" | "cloud") {
    setBusy(p.sha256);
    if (how === "laptop") setReadingHere(p.sha256);
    try {
      const r = how === "laptop" ? await readOnLaptop(p) : await readInCloud(p);
      if ("cues" in r) set(p.sha256, r);
      else if (r.refused === "no-on-device-model") set(p.sha256, { noModel: true });
      else set(p.sha256, { couldNot: COULD_NOT[r.refused] ?? "Couldn't read this photo." });
    } catch {
      set(p.sha256, { couldNot: "Couldn't read this photo." });
    } finally {
      setBusy(null);
      setReadingHere(null);
    }
  }

  // The answer shows at once and the buttons stay free: a Firestore write settles only when the
  // server acknowledges it, which never happens with the link down. A refusal brings the buttons back.
  function decide(p: TrayPhoto, d: FamilyDecision) {
    const r = reads[p.sha256];
    setDecided((x) => ({ ...x, [p.sha256]: d }));
    setSaveError((x) => ({ ...x, [p.sha256]: null }));
    onDecide(p, r && "cues" in r ? r.cues : null, r && "cues" in r ? r.route : null, d).catch((e: unknown) => {
      setDecided((x) => {
        const next = { ...x };
        if (next[p.sha256] === d) delete next[p.sha256];
        return next;
      });
      const known = e instanceof Error && (e.message === PHOTO_DELETED || e.message === PHOTO_UNCHECKED);
      setSaveError((x) => ({ ...x, [p.sha256]: known ? (e as Error).message : "Not saved. Try again." }));
    });
  }

  return (
    <section aria-labelledby="photos-h" className="tray">
      <h2 id="photos-h" className="label">Family photos</h2>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => void onCheckDevice()}>
          Get this device ready
        </button>
        <label className="btn ghost file">
          Add photos
          <input type="file" accept="image/*" multiple onChange={(e) => e.target.files && void onAddFiles([...e.target.files])} />
        </label>
      </div>
      {deviceState && <p role="status" className="muted">{STATE_LINE[deviceState]}</p>}
      {downloadPct !== null && downloadPct < 100 && <p role="status" className="muted num">Downloading the model: {downloadPct}%</p>}
      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      {photos.length === 0 && !loadError && <p className="muted">No photos yet.</p>}
      <ul className="photos">
        {photos.map((p) => {
          const r = reads[p.sha256];
          return (
            <li key={p.sha256} className="photo" data-sha256={p.sha256}>
              <Thumb bytes={p.bytes} />
              <div className="row">
                <button type="button" className="btn ghost" onClick={() => run(p, "laptop")} disabled={busy !== null}>
                  Read on this device
                </button>
              </div>
              {readingHere === p.sha256 && (
                <p role="status" className="muted">
                  Reading on this device. The first read can take up to a minute.
                </p>
              )}
              {r && "noModel" in r && (
                <div role="status" className="note-state">
                  <p>This device has no local model. Nothing was sent.</p>
                  <button type="button" className="btn ghost" onClick={() => set(p.sha256, { consent: true })} disabled={busy !== null}>
                    Read in the cloud
                  </button>
                </div>
              )}
              {r && "consent" in r && (
                <div role="status" className="note-state">
                  <p>This photo goes to Gemini in the cloud. Sent only if the family agreed to a cloud reading when they shared it.</p>
                  <button type="button" className="btn ghost" onClick={() => run(p, "cloud")} disabled={busy !== null}>
                    Send this photo to the cloud
                  </button>
                </div>
              )}
              {r && "couldNot" in r && <p className="chip" role="status">{r.couldNot}</p>}
              {r && "cues" in r && (
                <div className="cues" data-testid="photo-cues">
                  <div className="suggested-head">
                    <span className="tag">Suggested</span>
                    <RouteGlyph route={r.route} />
                  </div>
                  <p>
                    {r.cues.placeType.replace(/_/g, " ")}
                    {r.cues.placeName && `: ${r.cues.placeName}`}
                  </p>
                  {r.cues.signText && <p className="muted">Sign: "{r.cues.signText}"</p>}
                  {r.cues.landmarks.length > 0 && <p className="muted">Landmarks: {r.cues.landmarks.join(", ")}</p>}
                  {r.sentBytes !== undefined && (
                    <details className="receipt">
                      <summary>What ran</summary>
                      {receiptLines({
                        asked: r.route.reason === "consented_cloud_read" ? "the cloud, with the family's consent" : "this device only",
                        route: r.route,
                        sentBytes: r.sentBytes,
                        what: "the photo, as base64",
                      }).map((l) => (
                        <p key={l} className="small">{l}</p>
                      ))}
                    </details>
                  )}
                </div>
              )}
              {saveError[p.sha256] && (
                <p className="error" role="alert">
                  {saveError[p.sha256]}
                </p>
              )}
              {decided[p.sha256] ? (
                <p className="tag">Family said: {decided[p.sha256] === "not_sure" ? "not sure" : decided[p.sha256]}</p>
              ) : (
                <div className="row" aria-label="Does the family know this place?">
                  {(["yes", "no", "not_sure"] as const).map((d) => (
                    <button key={d} type="button" className="btn ghost" onClick={() => decide(p, d)} disabled={busy !== null}>
                      {d === "not_sure" ? "Not sure" : d === "yes" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
