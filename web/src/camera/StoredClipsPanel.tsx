// The clips this search has already read, at the command post: each sighting's last-seen time and clothing, and
// "Open the time machine", which loads the clip from storage (checked by its hash) and its stored track. Nothing here
// asks a model anything: a clip with no stored track opens on its clearest frame. A track is read only right after a
// clip read, on the window that read was consented for (CameraClipPanel), never from this list.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StoredClip } from "../data/storedClips";
import type { Track } from "../extras/timemachine/types";
import { ClipTimeMachine } from "./ClipTimeMachine";
import { cardFacts } from "./SightingCard";

export const CLIP_NOT_LOADED = "This clip could not be loaded. It may have been deleted, or the link dropped.";
export const NO_TRACK = "No track was read for this clip. The time machine shows its clearest frame.";

type Opened =
  | { sha256: string; status: "loading" }
  | { sha256: string; status: "failed" }
  | { sha256: string; status: "ready"; clip: Blob; durationS: number; track: Track | null };

type Props = {
  /** Changes whenever this search's media is deleted: the open clip closes and the list is read again. */
  revocation: number;
  /** Remote Config time_machine_enabled. */
  timeMachine: boolean;
  load: () => Promise<StoredClip[]>;
  openClip: (c: StoredClip) => Promise<{ clip: Blob; durationS: number; track: Track | null }>;
};

export function StoredClipsPanel({ revocation, timeMachine, load, openClip }: Props) {
  const [clips, setClips] = useState<StoredClip[]>([]);
  const [opened, setOpened] = useState<Opened | null>(null);
  // A delete, or leaving the page, moves the epoch: an open clip closes and a clip still loading is dropped.
  const epoch = useRef(0);
  const lastRevocation = useRef(revocation);
  useLayoutEffect(() => {
    if (revocation === lastRevocation.current) return;
    lastRevocation.current = revocation;
    epoch.current++;
    setOpened(null);
    setClips([]);
  }, [revocation]);
  useEffect(() => () => void epoch.current++, []);
  // Read when the panel appears and again after each delete (not on every render: `load` can be a new function each time).
  const loadNow = useRef(load);
  loadNow.current = load;
  useEffect(() => {
    let live = true;
    loadNow.current().then(
      (c) => live && setClips(c),
      () => live && setClips([]),
    );
    return () => {
      live = false;
    };
  }, [revocation]);

  if (!timeMachine || clips.length === 0) return null;

  async function open(c: StoredClip) {
    const at = ++epoch.current;
    const sha256 = c.record.sha256;
    setOpened({ sha256, status: "loading" });
    try {
      const o = await openClip(c);
      if (at !== epoch.current) return;
      setOpened({ sha256, status: "ready", clip: o.clip, durationS: o.durationS, track: o.track });
    } catch {
      if (at === epoch.current) setOpened({ sha256, status: "failed" });
    }
  }

  return (
    <section aria-labelledby="stored-clips-h" className="stored-clips">
      <h2 id="stored-clips-h" className="label">Clips read for this search</h2>
      <ul className="sightings">
        {clips.map((c) => {
          const f = cardFacts(c.sighting, c.record.clipStartMs, null, false);
          const here = opened?.sha256 === c.record.sha256 ? opened : null;
          return (
            <li key={c.record.sha256} className="sighting">
              <p className="num">{f.time}</p>
              {f.clothing && <p className="muted">{f.clothing}</p>}
              <button
                type="button"
                className="btn ghost"
                aria-pressed={here !== null}
                onClick={() => {
                  if (here) {
                    epoch.current++;
                    setOpened(null);
                  } else void open(c);
                }}
              >
                Open the time machine
              </button>
              {here?.status === "loading" && <p className="muted small" role="status">Loading the clip.</p>}
              {here?.status === "failed" && <p className="muted small" role="status">{CLIP_NOT_LOADED}</p>}
              {here?.status === "ready" && (
                <ClipTimeMachine
                  clip={here.clip}
                  durationS={here.durationS}
                  reading={c.sighting}
                  track={here.track}
                  onClose={() => {
                    epoch.current++;
                    setOpened(null);
                  }}
                  status={here.track ? null : <p className="muted small">{NO_TRACK}</p>}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
