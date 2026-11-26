// The clip time machine at the command post: the clip played from a local object URL with the person's box drawn
// on it, and the 3D view (loaded only when opened, so three.js stays out of the main bundle) on the same clock.
// With no track, the box shows only at the key frame.

import { Component, lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { bindVideo, createClock } from "../extras/timemachine/clock";
import { boxAt, linkTrack } from "../extras/timemachine/track";
import type { Box2d, Track } from "../extras/timemachine/types";
import { keyFrameOf, timeMachineResults } from "./timeMachine";

const TimeMachine = lazy(() => import("../extras/timemachine/TimeMachine"));

export const VIEW_UNAVAILABLE = "The 3D view could not load. The clip and the person's box are still shown here.";

// The 3D view's code is not in the offline download, so its import can fail; the clip and its box stay.
class ViewBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <p className="muted small" role="status">{VIEW_UNAVAILABLE}</p> : this.props.children;
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
        <ViewBoundary>
          <Suspense fallback={<p className="muted small">Loading the time machine.</p>}>
            <TimeMachine video={video} durationS={durationS} track={track} keyFrame={keyFrame} results={results} clock={clock} />
          </Suspense>
        </ViewBoundary>
      )}
    </div>
  );
}
