import { useCallback, useEffect, useRef, useState } from "react";
import { playbackStep } from "./ruler";
import type { ReplayWindow } from "./stateAt";

/**
 * The replay clock. One requestAnimationFrame timer while playing; the whole window plays in 30 s. It opens at
 * the end of the window, which is the live map. With reduced motion there is no playing at all: the panel steps
 * from mark to mark instead.
 */
export function usePlayback(w: ReplayWindow, reducedMotion: boolean): { tMs: number; setT(t: number): void; playing: boolean; toggle(): void } {
  const [tMs, setTMs] = useState(w.endMs);
  const [playing, setPlaying] = useState(false);
  const tRef = useRef(tMs);
  useEffect(() => {
    tRef.current = tMs;
  }, [tMs]);

  const setT = useCallback((t: number) => setTMs(Math.min(w.endMs, Math.max(w.startMs, t))), [w.startMs, w.endMs]);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    let frame = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      const dt = last === null ? 0 : now - last;
      last = now;
      const next = playbackStep(tRef.current, dt, w);
      tRef.current = next;
      setTMs(next);
      if (next >= w.endMs) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, reducedMotion, w]);

  const toggle = useCallback(() => {
    if (reducedMotion) return;
    // Play from the start when the clock already sits at the end.
    if (!playing && tRef.current >= w.endMs) {
      tRef.current = w.startMs;
      setTMs(w.startMs);
    }
    setPlaying(!playing);
  }, [reducedMotion, playing, w.startMs, w.endMs]);

  return { tMs, setT, playing: playing && !reducedMotion, toggle };
}
