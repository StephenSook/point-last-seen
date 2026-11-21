import { useCallback, useEffect, useRef, useState } from "react";
import { PLAY_STOP_MS, playFrom } from "./ruler";
import type { ReplayWindow } from "./stateAt";

/**
 * The replay clock. It opens at the end of the window, which is the live map. Play goes report by report: it jumps
 * to the first stop at once, then to the next stop every PLAY_STOP_MS, and stops at the end. With reduced motion
 * there is no playing at all: the panel steps from mark to mark instead.
 */
export function usePlayback(
  w: ReplayWindow,
  stops: readonly number[],
  reducedMotion: boolean,
): { tMs: number; setT(t: number): void; playing: boolean; toggle(): void } {
  const [tMs, setTMs] = useState(w.endMs);
  const [playing, setPlaying] = useState(false);
  const tRef = useRef(tMs);
  useEffect(() => {
    tRef.current = tMs;
  }, [tMs]);

  const setT = useCallback((t: number) => setTMs(Math.min(w.endMs, Math.max(w.startMs, t))), [w.startMs, w.endMs]);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = setInterval(() => {
      const next = stops.find((s) => s > tRef.current);
      if (next === undefined) {
        setPlaying(false);
        return;
      }
      tRef.current = next;
      setTMs(next);
      if (next >= w.endMs) setPlaying(false);
    }, PLAY_STOP_MS);
    return () => clearInterval(timer);
  }, [playing, reducedMotion, stops, w.endMs]);

  const toggle = useCallback(() => {
    if (reducedMotion) return;
    if (!playing) {
      const from = playFrom(stops, tRef.current);
      tRef.current = from;
      setTMs(from);
    }
    setPlaying(!playing);
  }, [reducedMotion, playing, stops]);

  return { tMs, setT, playing: playing && !reducedMotion, toggle };
}
