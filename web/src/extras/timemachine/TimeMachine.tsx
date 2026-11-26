import { Component, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { Canvas } from "@react-three/fiber";
import { Block } from "./Block";
import { linkTrack } from "./track";
import type { TimeMachineProps } from "./types";
import "./timemachine.css";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const fallback = <p className="tm-unavailable">3D view unavailable.</p>;

class SceneBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? fallback : this.props.children;
  }
}

export default function TimeMachine({ video, durationS, track, keyFrame, results, clock }: TimeMachineProps) {
  const stage = useRef<HTMLDivElement>(null);
  const clockLabel = useRef<HTMLTimeElement>(null);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && (window.matchMedia?.(MOTION_QUERY).matches ?? false),
  );
  useEffect(() => {
    const media = window.matchMedia?.(MOTION_QUERY);
    if (!media) return;
    const handleChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const segments = useMemo(() => track ? linkTrack(track.entries) : null, [track]);
  const animateIntro = segments !== null && !reducedMotion;

  return (
    <section className="tm-view" aria-label="Clip time machine">
      <div className="tm-stage" ref={stage} data-scrubbable="true">
        <SceneBoundary>
          <Canvas orthographic flat dpr={[1, 1.5]} camera={{ position: [0, 0, 12] }} fallback={fallback}>
            <Block
              key={segments === null ? "key-frame" : "track"}
              video={video}
              durationS={durationS}
              clock={clock}
              segments={segments}
              keyFrame={keyFrame}
              animateIntro={animateIntro}
              stage={stage}
              clockLabel={clockLabel}
            />
          </Canvas>
          <time className="tm-clock" ref={clockLabel} aria-hidden="true" />
        </SceneBoundary>
      </div>
      <div className="tm-results">
        <h3>Results</h3>
        <ol>
          {results.map(({ id, label, timeS }) => (
            <li key={id}>
              <button type="button" onClick={() => {
                if (reducedMotion) clock.jumpTo(timeS, 0);
                else clock.jumpTo(timeS);
              }}>{label}</button>
            </li>
          ))}
        </ol>
        {results.length > 0 && (
          <details>
            <summary>Results as text</summary>
            <p>{results.map(({ label }) => label).join("\n")}</p>
          </details>
        )}
      </div>
    </section>
  );
}
