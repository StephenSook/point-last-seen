import { lazy, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { bindVideo, createClock } from "../src/extras/timemachine/clock";
import { linkTrack } from "../src/extras/timemachine/track";
import type { TimeClock, TimeMachineResult, Track, TrackEntry } from "../src/extras/timemachine/types";
import fixture from "./fixtures/moving-box-track.json";

declare global {
  interface Window {
    __tm: { clock: TimeClock; video: HTMLVideoElement; thumbnailCount: number; segmentCount: number };
  }
}

const TimeMachine = lazy(() => import("../src/extras/timemachine/TimeMachine"));
if (fixture.version !== "track-v1") throw new Error("Unexpected harness track version");
const track: Track = {
  version: fixture.version,
  window: fixture.window,
  entries: fixture.entries.map(({ t, box, source }): TrackEntry => {
    const [top, left, bottom, right] = box;
    if (top === undefined || left === undefined || bottom === undefined || right === undefined ||
        (source !== "cloud" && source !== "on_device")) {
      throw new Error(`Invalid harness track entry at ${t} seconds`);
    }
    return { t, box: [top, left, bottom, right], source };
  }),
};
const durationS = track.window.endS;
const clock = createClock({ durationS });
const keyEntry = track.entries.find(({ t }) => t === 4);
if (!keyEntry) throw new Error("Missing the 4-second frame in the harness track");

const keyFrame = { timeS: keyEntry.t, box: keyEntry.box };
const results: readonly TimeMachineResult[] = [
  { id: "first_seen", label: "First seen 0:00", timeS: 0 },
  { id: "clearest", label: "Clearest frame 0:04", timeS: 4 },
  { id: "last_seen", label: "Last seen 0:08", timeS: 8 },
];
const withoutTrack = new URLSearchParams(location.search).get("track") === "none";

function Harness({ video }: { video: HTMLVideoElement }) {
  useEffect(() => bindVideo(clock, video), [video]);
  return (
    <Suspense fallback={<p>Loading clip time machine.</p>}>
      <TimeMachine video={video} durationS={durationS} track={withoutTrack ? null : track}
        keyFrame={keyFrame} results={results} clock={clock} />
    </Suspense>
  );
}

const root = document.getElementById("root");
const video = document.querySelector<HTMLVideoElement>("#clip");
if (!root || !video) throw new Error("Missing harness root or video");

const probe = { clock, video, thumbnailCount: 0, segmentCount: withoutTrack ? 0 : linkTrack(track.entries).length };
window.__tm = probe;
// This page uses createImageBitmap to capture the block's thumbnails.
const nativeCreateImageBitmap = window.createImageBitmap;
window.createImageBitmap = new Proxy(nativeCreateImageBitmap, {
  async apply(target, receiver, args) {
    const bitmap: ImageBitmap = await Reflect.apply(target, receiver, args);
    probe.thumbnailCount += 1;
    return bitmap;
  },
});
if (import.meta.hot) import.meta.hot.dispose(() => { window.createImageBitmap = nativeCreateImageBitmap; });

createRoot(root).render(<Harness video={video} />);
