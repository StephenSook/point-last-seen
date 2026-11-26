import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useFrame, type RootState } from "@react-three/fiber";
import { Group, PerspectiveCamera, Texture, Vector3 } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Block } from "./Block";
import { createClock } from "./clock";
import { FrameCard, timeDepth, type SliceTexture } from "./FrameCard";
import type { Mask, TimeMachineProps, TrackSegment } from "./types";

const { thumbnails } = vi.hoisted(() => ({ thumbnails: [] as SliceTexture[] }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState: (initial: unknown) => react.useState(Array.isArray(initial) ? thumbnails : initial),
  };
});
vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn(),
  useThree: () => ({ camera: null, size: { width: 800, height: 600 } }),
}));

const keyFrame: NonNullable<TimeMachineProps["keyFrame"]> = { timeS: 2, box: [100, 200, 400, 600] };
const durationS = 4;

beforeEach(() => {
  vi.mocked(useFrame).mockClear();
  thumbnails.length = 0;
});

function inspectBlock(segments: readonly TrackSegment[] | null = null) {
  const clock = createClock({ durationS });
  const stack = new Group();
  const parent = new Group();
  parent.position.set(3, 2, 5);
  parent.rotation.y = Math.PI / 2;
  parent.add(stack);
  let children: ReactNode[] = [];
  function Inspect() {
    const scene = Block({
      video: { src: "blob:clip", ownerDocument: { hidden: true } } as HTMLVideoElement,
      durationS, clock, keyFrame, segments, animateIntro: false,
      stage: { current: null }, clockLabel: { current: null },
    });
    children = Children.toArray(scene.props.children as ReactNode);
    return null;
  }
  renderToStaticMarkup(<Inspect />);
  const nodes = children.filter(isValidElement<Record<string, unknown>>);
  const card = nodes.find((node) => node.type === FrameCard);
  const stackNode = nodes.find((node) => node.type === "group" && node.props.ref);
  const stackRef = stackNode?.props.ref as { current: Group | null } | undefined;
  if (stackRef) stackRef.current = stack;
  const slices = Children.toArray(stackNode?.props.children as ReactNode).filter(isValidElement<Record<string, unknown>>);
  return { clock, card, stack, slices };
}

describe("Block", () => {
  it("renders the frame card, thumbnail stack, and key slice without a track", () => {
    thumbnails.splice(0, thumbnails.length,
      { timeS: 0, texture: new Texture() },
      { timeS: 0.5, texture: new Texture() },
    );
    const { clock, slices, card } = inspectBlock();

    expect(card?.props).toMatchObject({ clock, frames: thumbnails });
    for (const { timeS, texture } of thumbnails) {
      expect(slices).toContainEqual(expect.objectContaining({
        props: expect.objectContaining({ texture, z: timeDepth(timeS, durationS) }),
      }));
    }
    expect(slices).toContainEqual(expect.objectContaining({
      props: expect.objectContaining({ keyFrame }),
    }));
  });

  it("reverses slice render order when the camera crosses the block time axis", () => {
    thumbnails.push(
      { timeS: 0, texture: new Texture() },
      { timeS: 0.5, texture: new Texture() },
    );
    const { stack, slices } = inspectBlock();
    expect(slices).toHaveLength(3);
    stack.add(new Group(), new Group(), new Group());
    const camera = new PerspectiveCamera();
    const state = { camera } as RootState;
    const tick = vi.mocked(useFrame).mock.calls[0]?.[0];
    expect(tick).toBeTypeOf("function");

    camera.position.copy(stack.localToWorld(new Vector3(0, 0, 12)));
    tick!(state, 0, undefined);
    expect(stack.children.map((child) => child.renderOrder)).toEqual([3, 2, 1]);
    camera.position.copy(stack.localToWorld(new Vector3(0, 0, -12)));
    tick!(state, 0, undefined);
    expect(stack.children.map((child) => child.renderOrder)).toEqual([0, 1, 2]);
  });

  it("places each mask on its own slice and selects the nearest second for the card", () => {
    const first: Mask = [[100, 200], [100, 300], [400, 250]];
    const last: Mask = [[150, 200], [150, 300], [450, 250]];
    const entries = [
      { t: 0, box: keyFrame.box, source: "cloud", mask: first },
      { t: 1, box: keyFrame.box, source: "cloud" },
      { t: 3, box: keyFrame.box, source: "cloud", mask: last },
    ] as const;
    thumbnails.push({ timeS: 0, texture: new Texture() }, { timeS: 0.5, texture: new Texture() });
    const { card, clock, slices } = inspectBlock([{ startS: 0, endS: 3, entries }]);
    expect(slices.map((slice) => [slice.props.z, slice.props.mask])).toEqual([
      [timeDepth(0, durationS), first],
      [timeDepth(0.5, durationS), undefined],
      [timeDepth(3, durationS), last],
    ]);
    const readMask = card?.props.readMask as (timeS: number) => Mask | null;
    expect([0, 0.49, 0.51, 1, 2.49, 2.5, 3.5, 3.51].map(readMask))
      .toEqual([first, first, null, null, null, last, last, null]);

    clock.set(1, "scene");
    expect((card?.props.readBox as () => unknown)()).toEqual(keyFrame.box);
  });

  it("shows the key-frame box on the card only within half a second", () => {
    const { clock, card } = inspectBlock();
    const readBox = card?.props.readBox;
    expect(readBox).toBeTypeOf("function");
    if (typeof readBox !== "function") return;

    for (const [timeS, box] of [[1.49, null], [1.5, keyFrame.box], [2, keyFrame.box], [2.5, keyFrame.box], [2.51, null]] as const) {
      clock.set(timeS, "video");
      expect(readBox()).toEqual(box);
    }
  });
});
