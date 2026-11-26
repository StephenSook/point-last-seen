import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Texture } from "three";
import { describe, expect, it, vi } from "vitest";
import { Block } from "./Block";
import { createClock } from "./clock";
import { FrameCard, timeDepth, type SliceTexture } from "./FrameCard";
import type { TimeMachineProps, TrackSegment } from "./types";

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

function inspectBlock(segments: readonly TrackSegment[] | null = null) {
  const clock = createClock({ durationS });
  let children: ReactNode[] = [];
  function Inspect() {
    const scene = Block({
      video: { src: "blob:clip" } as HTMLVideoElement,
      durationS, clock, keyFrame, segments, animateIntro: false,
      stage: { current: null }, clockLabel: { current: null },
    });
    children = Children.toArray(scene.props.children as ReactNode);
    return null;
  }
  renderToStaticMarkup(<Inspect />);
  const nodes = children.filter(isValidElement<Record<string, unknown>>);
  const card = nodes.find((node) => node.type === FrameCard);
  return { clock, nodes, card };
}

describe("Block", () => {
  it("renders the frame card, thumbnail stack, and key slice without a track", () => {
    thumbnails.splice(0, thumbnails.length,
      { timeS: 0, texture: new Texture() },
      { timeS: 0.5, texture: new Texture() },
    );
    const { clock, nodes, card } = inspectBlock();

    expect(card?.props).toMatchObject({ clock, frames: thumbnails });
    for (const { timeS, texture } of thumbnails) {
      expect(nodes).toContainEqual(expect.objectContaining({
        props: expect.objectContaining({ texture, z: timeDepth(timeS, durationS) }),
      }));
    }
    expect(nodes).toContainEqual(expect.objectContaining({
      props: expect.objectContaining({ keyFrame }),
    }));
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
