// The walker flow (spec 10.6, 22.1): the sampled tracks leave the start in cohorts and
// move along roads, trails and the creek as dots on one canvas, then the canvas fades and
// the probability fill (the walker prior) is what remains. Positions are plain arithmetic
// (walkerFrame); only each walker's current point is projected per frame.

import type { Map as MlMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { motionScope, playWalkers } from "../motion/engine";
import { walkerFrame, type Track } from "../motion/walkerCanvas";
import { COMMAND } from "../theme/tokens";

export function WalkerLayer({ map, tracks, playKey }: { map: MlMap; tracks: readonly Track[]; playKey: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"flowing" | "final-grid">("flowing");

  useEffect(() => {
    let run: { cancel(): void } | null = null;
    const scope = motionScope((reduced) => {
      run?.cancel();
      const c = canvas.current;
      if (!c) return;
      const ctx = c.getContext("2d")!;
      const ratio = devicePixelRatio || 1;
      const total = Math.max(0, ...tracks.map((t) => t.releaseMs + t.durationMs));
      setMode("flowing");
      c.style.opacity = "1";
      run = playWalkers(
        total,
        reduced,
        (t) => {
          const { clientWidth: w, clientHeight: h } = c;
          if (c.width !== w * ratio || c.height !== h * ratio) {
            c.width = w * ratio;
            c.height = h * ratio;
          }
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = COMMAND.fg2;
          for (const p of walkerFrame(tracks, t)) {
            if (p.done) continue;
            const s = map.project([p.x, p.y]);
            ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
          }
        },
        () => {
          c.style.opacity = "0";
          setMode("final-grid");
        },
      );
    });
    return () => {
      run?.cancel();
      scope.revert();
    };
  }, [playKey]);

  return <canvas ref={canvas} className="walker-canvas" data-testid="walker-canvas" data-mode={mode} aria-hidden="true" />;
}
