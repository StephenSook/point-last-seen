import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BoxGeometry, CanvasTexture, CurvePath, LineCurve3, OrthographicCamera, SRGBColorSpace, Texture, TubeGeometry,
  Vector3, VideoTexture,
} from "three";
import { captureFramesBySeek } from "./frames";
import { BLOCK_DEPTH, BoxOutline, FRAME_HEIGHT, FRAME_WIDTH, FrameCard, INTRO_S, frameX, frameY, timeDepth, type SliceTexture } from "./FrameCard";
import { boxAt, footPoint } from "./track";
import { TRACK_RULES, type TimeMachineProps, type TrackSegment } from "./types";

const BLOCK_SHAPE = new BoxGeometry(FRAME_WIDTH, FRAME_HEIGHT, BLOCK_DEPTH);
const RADIAL_SEGMENTS = 8;

function useThumbnails(src: string, durationS: number) {
  const [frames, setFrames] = useState<readonly SliceTexture[]>([]);
  useEffect(() => {
    setFrames([]);
    const owned: SliceTexture[] = [];
    const stop = captureFramesBySeek(src, durationS, ({ timeS, bitmap }) => {
      const texture = new Texture(bitmap);
      // ImageBitmap ignores the texture's upload flip. Flip the UVs instead.
      texture.repeat.y = -1;
      texture.offset.y = 1;
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      owned.push({ timeS, texture });
      setFrames([...owned]);
    });
    return () => {
      stop();
      for (const { texture } of owned) {
        texture.dispose();
        (texture.image as ImageBitmap).close();
      }
    };
  }, [src, durationS]);
  return frames;
}

function useVideoTexture(video: HTMLVideoElement) {
  const [texture, setTexture] = useState<VideoTexture | null>(null);
  useEffect(() => {
    const next = new VideoTexture(video);
    next.colorSpace = SRGBColorSpace;
    setTexture(next);
    return () => next.dispose();
  }, [video]);
  return texture;
}

function KeySlice({ video, keyFrame, durationS, glass, ink }: {
  video: HTMLVideoElement;
  keyFrame: NonNullable<TimeMachineProps["keyFrame"]>;
  durationS: number;
  glass: string;
  ink: string;
}) {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  const { timeS, box } = keyFrame;

  useEffect(() => {
    setTexture(null);
    const src = video.currentSrc || video.src;
    if (!src) return;

    // A separate decoder reads the key frame even when the caller's player is paused elsewhere.
    const reader = video.ownerDocument.createElement("video");
    const canvas = video.ownerDocument.createElement("canvas");
    canvas.width = 192;
    canvas.height = 108;
    const context = canvas.getContext("2d");
    if (!context) return;

    let target: number | undefined;
    let image: CanvasTexture | undefined;
    function draw() {
      if (!context || image || target === undefined || reader.seeking || reader.readyState < 2 || reader.currentTime !== target) return;
      context.drawImage(reader, 0, 0, canvas.width, canvas.height);
      image = new CanvasTexture(canvas);
      image.colorSpace = SRGBColorSpace;
      setTexture(image);
    }
    function seek() {
      target = Math.max(0, Math.min(timeS, reader.duration));
      if (reader.currentTime !== target) reader.currentTime = target;
      draw();
    }

    reader.preload = "auto";
    reader.muted = true;
    reader.playsInline = true;
    reader.addEventListener("loadedmetadata", seek);
    reader.addEventListener("loadeddata", draw);
    reader.addEventListener("seeked", draw);
    reader.src = src;

    return () => {
      reader.removeEventListener("loadedmetadata", seek);
      reader.removeEventListener("loadeddata", draw);
      reader.removeEventListener("seeked", draw);
      reader.removeAttribute("src");
      reader.load();
      image?.dispose();
    };
  }, [video, timeS]);

  return (
    <group position-z={timeDepth(timeS, durationS)}>
      <Slice texture={texture} opacity={texture ? 0.9 : 0.26} glass={glass} />
      <BoxOutline color={ink} readBox={() => box} />
    </group>
  );
}

function Slice({ texture, opacity, glass, z = 0 }: { texture: Texture | null; opacity: number; glass: string; z?: number }) {
  return (
    <mesh position-z={z}>
      <planeGeometry args={[FRAME_WIDTH, FRAME_HEIGHT]} />
      <meshBasicMaterial map={texture} color={texture ? "white" : glass} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function PathTube({ segment, durationS, color, intro }: {
  segment: TrackSegment;
  durationS: number;
  color: string;
  intro: RefObject<number>;
}) {
  const tube = useMemo(() => {
    const start = Math.max(0, segment.startS - TRACK_RULES.holdS);
    const end = Math.min(durationS, segment.endS + TRACK_RULES.holdS);
    if (end <= start) return null;

    const times = [start, ...segment.entries.map(({ t }) => t).filter((t) => t > start && t < end), end];
    const points = times.flatMap((timeS) => {
      const box = boxAt([segment], timeS);
      if (!box) return [];
      const [x, y] = footPoint(box);
      return [new Vector3(frameX(x), frameY(y), timeDepth(timeS, durationS))];
    });

    const path = new CurvePath<Vector3>();
    for (let i = 1; i < points.length; i += 1) {
      path.add(new LineCurve3(points[i - 1]!, points[i]!));
    }
    if (!path.curves.length) return null;

    const steps = Math.min(240, Math.max(8, path.curves.length * 8));
    const core = new TubeGeometry(path, steps, 0.025, RADIAL_SEGMENTS, false);
    const halo = new TubeGeometry(path, steps, 0.06, RADIAL_SEGMENTS, false);
    const depths = Array.from({ length: steps + 1 }, (_, i) => path.getPointAt(i / steps).z);
    return { core, halo, depths };
  }, [segment, durationS]);

  useEffect(() => () => {
    tube?.core.dispose();
    tube?.halo.dispose();
  }, [tube]);

  useFrame(() => {
    if (!tube) return;
    const limit = timeDepth(durationS * intro.current, durationS);
    const firstHidden = intro.current >= 1 ? -1 : tube.depths.findIndex((depth) => depth < limit);
    const rings = firstHidden < 0 ? tube.depths.length : firstHidden;
    const count = Math.max(0, rings - 1) * RADIAL_SEGMENTS * 6;
    if (tube.core.drawRange.count === count) return;
    tube.core.setDrawRange(0, count);
    tube.halo.setDrawRange(0, count);
  });

  if (!tube) return null;
  return (
    <group>
      <mesh>
        <primitive object={tube.core} attach="geometry" />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh>
        <primitive object={tube.halo} attach="geometry" />
        <meshBasicMaterial color={color} transparent opacity={0.24} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

type BlockProps = Pick<TimeMachineProps, "video" | "durationS" | "clock" | "keyFrame"> & {
  segments: readonly TrackSegment[] | null;
  animateIntro: boolean;
  stage: RefObject<HTMLDivElement | null>;
  clockLabel: RefObject<HTMLTimeElement | null>;
};

export function Block({ video, durationS, clock, segments, keyFrame, animateIntro, stage, clockLabel }: BlockProps) {
  const frames = useThumbnails(video.currentSrc || video.src, durationS);
  const videoTexture = useVideoTexture(video);
  const intro = useRef(animateIntro ? 0 : 1);
  const sample = useRef({ elapsed: 0, frames: 0 });
  const [fewerSlices, setFewerSlices] = useState(false);
  const { camera, size } = useThree();
  const [palette, setPalette] = useState({ line: "#403c3a", glass: "#302d2b", ink: "#f8f4f1", accent: "#40e2f3" });

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const css = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (!css) return;
    const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    setPalette({ line: token("--line", "#403c3a"), glass: token("--bg-3", "#302d2b"), ink: token("--fg-1", "#f8f4f1"), accent: token("--change-cyan", "#40e2f3") });
  }, [stage]);

  useLayoutEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return;
    camera.zoom = Math.min(size.width / 6.3, size.height / 3.5);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  useEffect(() => {
    const document = video.ownerDocument;
    function resetSample() { sample.current = { elapsed: 0, frames: 0 }; }
    document.addEventListener("visibilitychange", resetSample);
    return () => document.removeEventListener("visibilitychange", resetSample);
  }, [video]);

  useFrame((_state, delta) => {
    intro.current = animateIntro ? Math.min(1, intro.current + delta / INTRO_S) : 1;
    if (fewerSlices || video.ownerDocument.hidden) return;

    const window = sample.current;
    // Ignore the first delta after mount or resume, which can include time offscreen.
    if (window.frames > 0) window.elapsed += delta;
    window.frames += 1;
    if (window.elapsed < 2) return;
    if ((window.frames - 1) / window.elapsed < 50) setFewerSlices(true);
    sample.current = { elapsed: 0, frames: 0 };
  }, -1);

  const visible = fewerSlices ? frames.filter((_, index) => index % 2 === 0) : frames;
  const opacity = Math.min(0.055, 1.6 / Math.max(visible.length, 1));

  function readBox() {
    const { timeS } = clock.now();
    if (segments !== null) return boxAt(segments, timeS);
    return keyFrame && Math.abs(timeS - keyFrame.timeS) <= 0.5 ? keyFrame.box : null;
  }

  return (
    <group rotation={[0.14, -40 * Math.PI / 180, 0]}>
      <lineSegments>
        <edgesGeometry args={[BLOCK_SHAPE]} />
        <lineBasicMaterial color={palette.line} toneMapped={false} />
      </lineSegments>
      {visible.map(({ timeS, texture }) => (
        <Slice key={timeS} texture={texture} z={timeDepth(timeS, durationS)} opacity={opacity} glass={palette.glass} />
      ))}
      {segments === null && keyFrame && (
        <KeySlice video={video} keyFrame={keyFrame} durationS={durationS} glass={palette.glass} ink={palette.ink} />
      )}
      {segments?.map((segment) => (
        <PathTube key={segment.startS} segment={segment} durationS={durationS} color={palette.accent} intro={intro} />
      ))}
      <FrameCard video={video} videoTexture={videoTexture} frames={frames} durationS={durationS} clock={clock} readBox={readBox} intro={intro} clockLabel={clockLabel} ink={palette.ink} glass={palette.glass} />
    </group>
  );
}
