// What the command post hands the clip time machine, built from the clip's reading: the result rows (first
// seen, the clearest frame, last seen; no leaving-edge row, since the reading's edge can be wrong), the key frame
// and the receipt line for the track read.

import type { Box2d, TimeMachineResult } from "../extras/timemachine/types";

type Reading = { firstSeen: string; lastSeen: string; keyFrame: { time: string; box2d: readonly number[] } };

const secondsOf = (mmss: string) => {
  const [m, s] = mmss.split(":").map(Number);
  return (m ?? 0) * 60 + (s ?? 0);
};
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function timeMachineResults(r: Reading): TimeMachineResult[] {
  const first = secondsOf(r.firstSeen), key = secondsOf(r.keyFrame.time), last = secondsOf(r.lastSeen);
  return [
    { id: "first_seen", label: `First seen ${clock(first)}`, timeS: first },
    { id: "clearest", label: `Clearest frame ${clock(key)}`, timeS: key },
    { id: "last_seen", label: `Last seen ${clock(last)}`, timeS: last },
  ];
}

/** The clearest frame's second and box, or null when the box is not 4 numbers in order on 0 to 1000. */
export function keyFrameOf(r: Reading): { timeS: number; box: Box2d } | null {
  const b = r.keyFrame.box2d;
  if (b.length !== 4 || !b.every((n) => Number.isFinite(n) && n >= 0 && n <= 1000)) return null;
  const [y0, x0, y1, x1] = b as [number, number, number, number];
  return y0 < y1 && x0 < x1 ? { timeS: secondsOf(r.keyFrame.time), box: [y0, x0, y1, x1] } : null;
}

/** The track read's receipt line: exactly what left the laptop. */
export function trackSentLine(frames: number): string {
  return `${frames} frame${frames === 1 ? "" : "s"} of the clip left this laptop for the cloud.`;
}
