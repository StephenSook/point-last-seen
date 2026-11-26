import { Component, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PropsWithChildren, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Block } from "./Block";
import { frameBoxAt } from "./FrameCard";
import { footPoint, linkTrack } from "./track";
import type { Box2d, TimeMachineProps, TrackSegment } from "./types";
import "./timemachine.css";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

class SceneBoundary extends Component<PropsWithChildren<{ fallback: ReactNode }>, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function formatTime(timeS: number) {
  const seconds = Math.floor(timeS);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function positionText(box: Box2d) {
  const [x] = footPoint(box);
  if (x < 1000 / 3) return "left";
  return x > 2000 / 3 ? "right" : "centre";
}

function describePath(segments: readonly TrackSegment[] | null, keyFrame: TimeMachineProps["keyFrame"]) {
  const first = segments?.[0]?.entries[0];
  const last = segments?.at(-1)?.entries.at(-1);
  if (first && last && first !== last) {
    return `Person first seen at ${positionText(first.box)} at ${formatTime(first.t)} and last seen at ${positionText(last.box)} at ${formatTime(last.t)}.`;
  }
  if (first) return `Person at ${positionText(first.box)} at ${formatTime(first.t)}.`;
  if (segments === null && keyFrame) return `Person at ${positionText(keyFrame.box)} at ${formatTime(keyFrame.timeS)}.`;
  return "No person path is available.";
}

function TimeSlider({ clock, durationS, segments, keyFrame }: Pick<TimeMachineProps, "clock" | "durationS" | "keyFrame"> & {
  segments: readonly TrackSegment[] | null;
}) {
  const { timeS } = useSyncExternalStore(clock.subscribe, clock.now, clock.now);
  const box = frameBoxAt(segments, keyFrame, timeS);
  const valueText = box ? `${formatTime(timeS)}, person at ${positionText(box)}` : formatTime(timeS);
  return (
    <input
      className="tm-slider"
      type="range"
      aria-label="Clip time"
      aria-valuetext={valueText}
      min={0}
      max={durationS}
      step={clock.frameS()}
      value={timeS}
      onChange={(event) => clock.set(event.currentTarget.valueAsNumber, "scene")}
    />
  );
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
  const path = describePath(segments, keyFrame);
  const fallback = <p className="tm-unavailable">3D view unavailable. {path}</p>;

  return (
    <section className="tm-view" aria-label="Clip time machine">
      <div className="tm-scene">
        <div className="tm-stage" ref={stage} data-scrubbable="true">
          <SceneBoundary fallback={fallback}>
            <Canvas orthographic flat dpr={[1, 1.5]} camera={{ position: [0, 0, 12] }} fallback={fallback}
              role="img" aria-label={`3D clip view. ${path}`} style={{ touchAction: "none" }}>
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
        <TimeSlider clock={clock} durationS={durationS} segments={segments} keyFrame={keyFrame} />
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
