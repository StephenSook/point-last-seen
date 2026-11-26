// The clip time machine at the command post: the clip played from a local object URL with the person's box drawn
// on it, and the 3D view (loaded only when opened, so three.js stays out of the main bundle and the offline download)
// on the same clock. With no track, the box shows only at the key frame. If the 3D view cannot load or stops
// working, the clip, its box and the result buttons stay.

import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PropsWithChildren, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { bindVideo, createClock } from "../extras/timemachine/clock";
import { boxAt, linkTrack } from "../extras/timemachine/track";
import type { Box2d, TimeClock, TimeMachineResult, Track } from "../extras/timemachine/types";
import { keyFrameOf, timeMachineResults } from "./timeMachine";

/** The 3D view's code did not arrive (offline, or a link that dropped): not a fault in the view. */
class ViewLoadError extends Error {}

// React.lazy keeps a failed load for good, so each open makes its own: a view that could not load is tried again the
// next time the time machine opens (a loaded one comes from the browser's module cache at once).
const loadTimeMachine = () =>
  import("../extras/timemachine/TimeMachine").catch((e: unknown) => {
    throw new ViewLoadError(e instanceof Error ? e.message : "The 3D view could not load.");
  });

export const VIEW_UNAVAILABLE = "The 3D view could not load. The clip and the person's box are still shown here.";
export const VIEW_BROKE = "The 3D view stopped working. The clip and the person's box are still shown here.";

/** The result rows as plain buttons on the shared clock, for when the 3D view (which also draws them) is not there. */
function ResultButtons({ results, clock }: { results: readonly TimeMachineResult[]; clock: TimeClock }) {
  return (
    <ol className="tm-fallback-results">
      {results.map(({ id, label, timeS }) => (
        <li key={id}>
          <button type="button" className="btn ghost" onClick={() => clock.jumpTo(timeS)}>
            {label}
          </button>
        </li>
      ))}
    </ol>
  );
}

type BoundaryProps = PropsWithChildren<{ results: readonly TimeMachineResult[]; clock: TimeClock }>;

// A failed import gets the offline message; any other error is a fault in the view, said as such and handed to the
// page's error reporting (which keeps only name, message and stack) as if it had not been caught.
class ViewBoundary extends Component<BoundaryProps, { failed: "load" | "broke" | null }> {
  state: { failed: "load" | "broke" | null } = { failed: null };

  static getDerivedStateFromError(error: unknown) {
    return { failed: error instanceof ViewLoadError ? "load" : "broke" };
  }

  componentDidCatch(error: unknown) {
    if (error instanceof ViewLoadError) return;
    try {
      globalThis.reportError?.(error);
    } catch {
      // reporting must not raise another error
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <>
        <p className="muted small" role="status">{this.state.failed === "load" ? VIEW_UNAVAILABLE : VIEW_BROKE}</p>
        <ResultButtons results={this.props.results} clock={this.props.clock} />
      </>
    );
  }
}

type Reading = Parameters<typeof timeMachineResults>[0];

type Props = {
  clip: Blob;
  /** The clip's exact length in seconds. */
  durationS: number;
  reading: Reading;
  track: Track | null;
  /** Close: back to the card it was opened from (Escape does the same). */
  onClose: () => void;
  /** Lines and actions about the clip's track, shown at the top of the panel. */
  status?: ReactNode;
};

// The open time machine is a panel over the whole post, so the clip and the 3D view are large enough to read: side by
// side on a wide screen, stacked on a phone. Close (or Escape) returns to the card, and focus goes back to where it was.
export function ClipTimeMachine({ clip, durationS, reading, track, onClose, status }: Props) {
  const close = useRef<HTMLButtonElement>(null);
  const closeNow = useRef(onClose);
  closeNow.current = onClose;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNow.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(clip);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [clip]);
  const TimeMachine = useMemo(() => lazy(loadTimeMachine), []);
  const clock = useMemo(() => createClock({ durationS }), [durationS]);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  // bindVideo also follows a seek made with the player's own controls while it is paused.
  useEffect(() => (video ? bindVideo(clock, video) : undefined), [clock, video]);
  const segments = useMemo(() => (track ? linkTrack(track.entries) : []), [track]);
  const keyFrame = keyFrameOf(reading);
  const results = useMemo(() => timeMachineResults(reading), [reading]);
  const { timeS } = useSyncExternalStore(clock.subscribe, clock.now, clock.now);
  const box: Box2d | null = segments.length > 0 ? boxAt(segments, timeS) : keyFrame && Math.abs(timeS - keyFrame.timeS) <= 0.5 ? keyFrame.box : null;
  return createPortal(
    <div className="clip-tm-panel" role="dialog" aria-label="Time machine">
      <div className="clip-tm-head">
        <h2 className="label">Time machine</h2>
        <button ref={close} type="button" className="btn" onClick={() => closeNow.current()}>
          Close
        </button>
      </div>
      {status && <div className="clip-tm-status">{status}</div>}
      <div className="clip-tm" data-testid="clip-time-machine">
        <div className="clip-frame">
          {url && <video ref={setVideo} src={url} muted playsInline preload="auto" controls aria-label="The clip, on the time machine's clock" />}
          {/* The box is drawn on the picture only, never over the player's own controls along the bottom. */}
          <div className="clip-box-layer">
            {box && (
              <div
                className="clip-box"
                data-testid="clip-track-box"
                style={{ top: `${box[0] / 10}%`, left: `${box[1] / 10}%`, height: `${(box[2] - box[0]) / 10}%`, width: `${(box[3] - box[1]) / 10}%` }}
              />
            )}
          </div>
        </div>
        {video && (
          <ViewBoundary results={results} clock={clock}>
            <Suspense fallback={<p className="muted small">Loading the time machine.</p>}>
              <TimeMachine video={video} durationS={durationS} track={track} keyFrame={keyFrame} results={results} clock={clock} />
            </Suspense>
          </ViewBoundary>
        )}
      </div>
    </div>,
    document.body,
  );
}
