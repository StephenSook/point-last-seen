// The clip time machine at the command post: the clip played from a local object URL with the person's box drawn
// on it, and the 3D view (loaded only when opened, so three.js stays out of the main bundle and the offline download)
// on the same clock. With no track, the box shows only at the key frame. If the 3D view cannot load or stops
// working, the clip, its box and the result buttons stay.

import { Component, lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { bindVideo, createClock } from "../extras/timemachine/clock";
import { boxAt, linkTrack } from "../extras/timemachine/track";
import type { Box2d, TimeClock, TimeMachineResult, Track } from "../extras/timemachine/types";
import { keyFrameOf, timeMachineResults } from "./timeMachine";

/** The 3D view's code did not arrive (offline, or a link that dropped): not a fault in the view. */
class ViewLoadError extends Error {}

const TimeMachine = lazy(() =>
  import("../extras/timemachine/TimeMachine").catch((e: unknown) => {
    throw new ViewLoadError(e instanceof Error ? e.message : "The 3D view could not load.");
  }),
);

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
};

export function ClipTimeMachine({ clip, durationS, reading, track }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(clip);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [clip]);
  const clock = useMemo(() => createClock({ durationS }), [durationS]);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  useEffect(() => (video ? bindVideo(clock, video) : undefined), [clock, video]);
  // The player's own controls can seek while it is paused, and no frame plays then: the clock follows the seek.
  useEffect(() => {
    if (!video) return;
    const onSeeked = () => {
      if (video.paused && clock.now().source !== "tween") clock.set(video.currentTime, "video");
    };
    video.addEventListener("seeked", onSeeked);
    return () => video.removeEventListener("seeked", onSeeked);
  }, [clock, video]);
  const segments = useMemo(() => (track ? linkTrack(track.entries) : []), [track]);
  const keyFrame = keyFrameOf(reading);
  const results = useMemo(() => timeMachineResults(reading), [reading]);
  const { timeS } = useSyncExternalStore(clock.subscribe, clock.now, clock.now);
  const box: Box2d | null = segments.length > 0 ? boxAt(segments, timeS) : keyFrame && Math.abs(timeS - keyFrame.timeS) <= 0.5 ? keyFrame.box : null;
  return (
    <div className="clip-tm" data-testid="clip-time-machine">
      <div className="clip-frame">
        {url && <video ref={setVideo} src={url} muted playsInline preload="auto" controls aria-label="The clip, on the time machine's clock" />}
        {box && (
          <div
            className="clip-box"
            data-testid="clip-track-box"
            style={{ top: `${box[0] / 10}%`, left: `${box[1] / 10}%`, height: `${(box[2] - box[0]) / 10}%`, width: `${(box[3] - box[1]) / 10}%` }}
          />
        )}
      </div>
      {video && (
        <ViewBoundary results={results} clock={clock}>
          <Suspense fallback={<p className="muted small">Loading the time machine.</p>}>
            <TimeMachine video={video} durationS={durationS} track={track} keyFrame={keyFrame} results={results} clock={clock} />
          </Suspense>
        </ViewBoundary>
      )}
    </div>
  );
}
