// The clips this search has already read, at the command post: each sighting's last-seen time and clothing, and
// "Open the time machine", which loads the clip from storage (checked by its hash) and its stored track. Opening a
// clip with a stored track asks no model anything. With no track, "Track the person" reads one on the clip's stored
// consent (the read checks that consent with the server before every call) while the search is open.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StoredClip } from "../data/storedClips";
import type { Track } from "../extras/timemachine/types";
import { TRACK_FAILED, type TrackView } from "./CameraClipPanel";
import { ClipTimeMachine } from "./ClipTimeMachine";
import { cardFacts } from "./SightingCard";
import { trackSentLine } from "./timeMachine";

export const CLIP_NOT_LOADED = "This clip could not be loaded. It may have been deleted, or the link dropped.";

type Opened =
  | { sha256: string; status: "loading" }
  | { sha256: string; status: "failed" }
  | { sha256: string; status: "ready"; clip: Blob; durationS: number; track: TrackView | null };

type Props = {
  /** Changes whenever this search's media is deleted: the open clip closes and the list is read again. */
  revocation: number;
  /** Remote Config time_machine_enabled. */
  timeMachine: boolean;
  /** The search is open and this seat may write a track. */
  canTrack: boolean;
  load: () => Promise<StoredClip[]>;
  openClip: (c: StoredClip) => Promise<{ clip: Blob; durationS: number; track: Track | null }>;
  onTrack?: (c: StoredClip, clip: Blob, durationS: number, stillCurrent: () => boolean) => Promise<TrackView>;
};

export function StoredClipsPanel({ revocation, timeMachine, canTrack, load, openClip, onTrack }: Props) {
  const [clips, setClips] = useState<StoredClip[]>([]);
  const [opened, setOpened] = useState<Opened | null>(null);
  // A delete, or leaving the page, moves the epoch: an open clip closes and every result still on its way is dropped.
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
      setOpened({ sha256, status: "ready", clip: o.clip, durationS: o.durationS, track: o.track ? { status: "ready", track: o.track, durationS: o.durationS } : null });
    } catch {
      if (at === epoch.current) setOpened({ sha256, status: "failed" });
    }
  }

  function track(c: StoredClip, o: Extract<Opened, { status: "ready" }>) {
    if (!onTrack) return;
    const at = epoch.current;
    const current = () => at === epoch.current;
    setOpened({ ...o, track: { status: "reading" } });
    onTrack(c, o.clip, o.durationS, current).then(
      (v) => current() && setOpened({ ...o, track: v }),
      () => current() && setOpened({ ...o, track: { status: "failed", message: TRACK_FAILED, durationS: o.durationS } }),
    );
  }

  return (
    <section aria-labelledby="stored-clips-h" className="stored-clips">
      <h2 id="stored-clips-h" className="label">Clips read for this search</h2>
      <ul className="sightings">
        {clips.map((c) => {
          const f = cardFacts(c.sighting, c.record.clipStartMs, null, false);
          const here = opened?.sha256 === c.record.sha256 ? opened : null;
          const tv = here?.status === "ready" ? here.track : null;
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
                <>
                  {tv?.status === "reading" && <p className="muted small" role="status">Tracking the person in the clip.</p>}
                  {tv?.status === "failed" && <p className="muted small" role="status">{tv.message}</p>}
                  {tv && tv.status !== "reading" && tv.sent && <p className="small">{trackSentLine(tv.sent.frames, tv.sent.outlineFrames)}</p>}
                  {!tv && canTrack && onTrack && (
                    <button type="button" className="btn" onClick={() => track(c, here)}>
                      Track the person
                    </button>
                  )}
                  <ClipTimeMachine clip={here.clip} durationS={here.durationS} reading={c.sighting} track={tv?.status === "ready" ? tv.track : null} />
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
