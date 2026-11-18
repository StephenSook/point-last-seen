// Dev-server-only harness (web/harness/frames.html): decodes a clip handed in by a test and
// reports the sampled frames, their cells changed between samples and the motion windows. No Firebase.

import { sampleFrames, jpegAt } from "../camera/frames";
import { changedCells, MOTION, motionWindows } from "../camera/motion";

const blobOf = (b64: string) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "video/mp4" });

Object.assign(window, {
  sample: async (b64: string) => {
    const { durationS, frames } = await sampleFrames(blobOf(b64));
    const change: number[] = [];
    for (let i = 1; i < frames.length; i++) change.push(changedCells(frames[i - 1]!.px, frames[i]!.px));
    return { durationS, count: frames.length, size: frames[0]?.px.length ?? 0, change, windows: motionWindows(frames, MOTION.width, MOTION.height, durationS) };
  },
  jpeg: async (b64: string, t: number) => (await jpegAt(blobOf(b64), t)).slice(0, 8),
  ready: true,
});
