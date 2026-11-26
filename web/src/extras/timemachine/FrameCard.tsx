import { useEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  type Group, type LineLoop, type MeshBasicMaterial, type Texture, Vector2, Vector3,
} from "three";
import { boxAt } from "./track";
import { TRACK_RULES, type Box2d, type Mask, type TimeClock, type TimeMachineProps, type TrackSegment } from "./types";

export const FRAME_WIDTH = 3.2;
export const FRAME_HEIGHT = 1.8;
export const BLOCK_DEPTH = 4;
export const INTRO_S = 1.2;
const CARD_CORNERS = new Float32Array([
  -FRAME_WIDTH / 2, FRAME_HEIGHT / 2, 0,
  FRAME_WIDTH / 2, FRAME_HEIGHT / 2, 0,
  FRAME_WIDTH / 2, -FRAME_HEIGHT / 2, 0,
  -FRAME_WIDTH / 2, -FRAME_HEIGHT / 2, 0,
]);

export function timeDepth(timeS: number, durationS: number) {
  const fraction = durationS > 0 ? Math.max(0, Math.min(1, timeS / durationS)) : 0;
  return (0.5 - fraction) * BLOCK_DEPTH;
}

export function frameX(x: number) { return (x / 1000 - 0.5) * FRAME_WIDTH; }
export function frameY(y: number) { return (0.5 - y / 1000) * FRAME_HEIGHT; }

export function frameBoxAt(segments: readonly TrackSegment[] | null, keyFrame: TimeMachineProps["keyFrame"], timeS: number) {
  if (segments !== null) return boxAt(segments, timeS);
  return keyFrame && Math.abs(timeS - keyFrame.timeS) <= TRACK_RULES.holdS ? keyFrame.box : null;
}

export type SliceTexture = { readonly timeS: number; readonly texture: Texture };

export function BoxOutline({ color, readBox }: { color: string; readBox: () => Box2d | null }) {
  const line = useRef<LineLoop>(null);
  const previous = useRef<Box2d | null>(null);
  const corners = useMemo(() => new Float32Array(12), []);

  useFrame(() => {
    const outline = line.current;
    if (!outline) return;
    const box = readBox();
    outline.visible = box !== null;
    if (!box || box === previous.current) return;
    previous.current = box;

    const [top, left, bottom, right] = box;
    const position = outline.geometry.getAttribute("position");
    position.setXYZ(0, frameX(left), frameY(top), 0);
    position.setXYZ(1, frameX(right), frameY(top), 0);
    position.setXYZ(2, frameX(right), frameY(bottom), 0);
    position.setXYZ(3, frameX(left), frameY(bottom), 0);
    position.needsUpdate = true;
  });

  return (
    <lineLoop ref={line} visible={false} frustumCulled={false} position-z={0.012} renderOrder={3}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[corners, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </lineLoop>
  );
}

export function MaskOutline({ mask, color, opacity = 1, depthTest = true }: {
  mask: Mask;
  color: string;
  opacity?: number;
  depthTest?: boolean;
}) {
  const points = useMemo(() => new Float32Array(mask.flatMap(([y, x]) => [frameX(x), frameY(y), 0])), [mask]);

  return (
    <lineLoop frustumCulled={false} position-z={0.012} renderOrder={3}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthTest={depthTest} depthWrite={false} toneMapped={false} />
    </lineLoop>
  );
}

type FrameCardProps = {
  video: HTMLVideoElement;
  videoTexture: Texture | null;
  frames: readonly SliceTexture[];
  durationS: number;
  clock: TimeClock;
  readBox: () => Box2d | null;
  readMask: (timeS: number) => Mask | null;
  intro: RefObject<number>;
  clockLabel: RefObject<HTMLTimeElement | null>;
  ink: string;
  glass: string;
  renderOrder: number;
};

type Drag = { pointerId: number; x: number; y: number; axis: Vector2; timeS: number };

export function FrameCard({ video, videoTexture, frames, durationS, clock, readBox, readMask, intro, clockLabel, ink, glass, renderOrder }: FrameCardProps) {
  const card = useRef<Group>(null);
  const plane = useRef<MeshBasicMaterial>(null);
  const projected = useRef(new Vector3());
  const drag = useRef<Drag | null>(null);
  const getScene = useThree((state) => state.get);
  const currentMask = () => readMask(clock.now().timeS);
  const mask = useSyncExternalStore(clock.subscribe, currentMask, currentMask);

  useEffect(() => {
    const label = clockLabel.current;
    return () => { if (label) label.style.visibility = "hidden"; };
  }, [clockLabel]);

  useEffect(() => {
    const document = getScene().gl.domElement.ownerDocument;
    function cancelDrag(event: PointerEvent) {
      if (drag.current?.pointerId === event.pointerId) drag.current = null;
    }
    document.addEventListener("pointercancel", cancelDrag, true);
    document.addEventListener("lostpointercapture", cancelDrag, true);
    return () => {
      document.removeEventListener("pointercancel", cancelDrag, true);
      document.removeEventListener("lostpointercapture", cancelDrag, true);
    };
  }, [getScene]);

  useFrame(({ camera, size }) => {
    if (!card.current || !plane.current) return;
    const { timeS, source } = clock.now();
    const remaining = 1 - intro.current;
    card.current.position.z = timeDepth(timeS, durationS) + 1.15 * remaining ** 3;
    card.current.position.y = 0.23 * remaining ** 3;

    let image: Texture | null = null;
    if (source !== "tween" && video.readyState >= 2 && !video.seeking && Math.abs(video.currentTime - timeS) <= 0.12) {
      image = videoTexture;
    }
    if (!image) {
      let bestDistance = 0.5;
      for (const frame of frames) {
        const distance = Math.abs(timeS - frame.timeS);
        if (distance > bestDistance) continue;
        bestDistance = distance;
        image = frame.texture;
      }
    }
    const material = plane.current;
    if (material.map !== image) {
      // Video and bitmap textures use different shader paths.
      if (!material.map || !image || (material.map === videoTexture) !== (image === videoTexture)) {
        material.needsUpdate = true;
      }
      material.map = image;
      material.color.set(image ? "white" : glass);
      material.opacity = image ? 0.88 : 0.23;
    }

    const label = clockLabel.current;
    if (label) {
      const point = projected.current.set(0, FRAME_HEIGHT / 2 + 0.08, 0);
      card.current.localToWorld(point).project(camera);
      const x = (point.x + 1) * size.width / 2;
      const y = (1 - point.y) * size.height / 2;
      label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      label.style.visibility = "visible";

      const seconds = Math.floor(timeS);
      const minuteText = String(Math.floor(seconds / 60)).padStart(2, "0");
      const secondText = String(seconds % 60).padStart(2, "0");
      const timeText = `${minuteText}:${secondText}`;
      if (label.textContent !== timeText) {
        label.textContent = timeText;
        label.dateTime = `PT${seconds}S`;
      }
    }
  });

  function startDrag(event: ThreeEvent<PointerEvent>) {
    const parent = card.current?.parent;
    if (!parent || durationS <= 0 || event.button !== 0 || drag.current) return;
    const { width, height } = getScene().size;
    const start = parent.localToWorld(new Vector3(0, 0, BLOCK_DEPTH / 2)).project(event.camera);
    const end = parent.localToWorld(new Vector3(0, 0, -BLOCK_DEPTH / 2)).project(event.camera);
    const axis = new Vector2((end.x - start.x) * width / 2, (start.y - end.y) * height / 2);
    if (axis.lengthSq() === 0) return;

    event.stopPropagation();
    const { timeS } = clock.now();
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, axis, timeS };
    (event.target as Element).setPointerCapture(event.pointerId);
    clock.set(timeS, "scene");
  }

  function moveDrag(event: ThreeEvent<PointerEvent>) {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const offset = active.axis.x * (event.clientX - active.x) + active.axis.y * (event.clientY - active.y);
    clock.set(active.timeS + durationS * offset / active.axis.lengthSq(), "scene");
  }

  function endDrag(event: ThreeEvent<PointerEvent>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    const target = event.target as Element;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  }

  return (
    <group ref={card} renderOrder={renderOrder}>
      <mesh renderOrder={2} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}>
        <planeGeometry args={[FRAME_WIDTH, FRAME_HEIGHT]} />
        <meshBasicMaterial ref={plane} color={glass} transparent opacity={0.23} depthWrite={false} toneMapped={false} />
      </mesh>
      <lineLoop renderOrder={3}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[CARD_CORNERS, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={ink} transparent opacity={0.7} depthWrite={false} toneMapped={false} />
      </lineLoop>
      {mask ? <MaskOutline mask={mask} color={ink} depthTest={false} /> : <BoxOutline color={ink} readBox={readBox} />}
    </group>
  );
}
